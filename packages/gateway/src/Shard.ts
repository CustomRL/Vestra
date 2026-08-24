import { EventEmitter } from 'node:events'
import {
  GatewayOpcodes,
  type GatewayDispatchPayload,
  type GatewayReceivePayload,
  type GatewaySendPayload,
} from '@vestra/types'
import { buildGatewayUrl, resolveShardOptions } from './GatewayOptions.js'
import type { ResolvedShardOptions, ShardOptions } from './GatewayOptions.js'
import { GatewayCloseCodes } from '@vestra/types'
import { Backoff } from './connection/Backoff.js'
import {
  resolveCloseVerdict,
  ShardCloseAction,
  CLOSE_PERMANENT,
  CLOSE_RESUMABLE,
} from './connection/CloseCodes.js'
import { ShardConnection } from './connection/ShardConnection.js'
import type { IdentifyThrottler } from './session/IdentifyThrottler.js'
import type { ShardEvents } from './ShardEvents.js'
import { sendIdentify, sendResume } from './ShardHandshake.js'
import { ShardSession } from './ShardSession.js'
import { ClosingIntent, ConnectIntent, ShardState } from './ShardState.js'
import { FatalGatewayError } from './errors/FatalGatewayError.js'

/**
 * One gateway connection, and the state machine that keeps it alive.
 *
 * @remarks
 * See {@link ShardEvents} for the delivery guarantees this class makes.
 */
export class Shard extends EventEmitter<ShardEvents> {
  readonly #options: ResolvedShardOptions
  readonly #throttler: IdentifyThrottler | undefined
  readonly #backoff: Backoff

  #state: ShardState = ShardState.Idle
  #connection: ShardConnection | null = null
  #epoch = 0

  readonly #session: ShardSession

  #intent: ConnectIntent = ConnectIntent.Identify
  #closingIntent: ClosingIntent | null = null
  #replaying = false

  #handshakeTimer: ReturnType<typeof setTimeout> | null = null
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * @param options - Shard configuration.
   * @param throttler - Gates identifies across the fleet. Omit for a single shard.
   */
  constructor(options: ShardOptions, throttler?: IdentifyThrottler) {
    super()
    this.#options = resolveShardOptions(options)
    this.#throttler = throttler
    this.#backoff = new Backoff(this.#options.backoff)
    this.#session = new ShardSession(this.#options.sessionStore, this.#options.shardId)
  }

  /** The shard's index. */
  get id(): number {
    return this.#options.shardId
  }

  /** The current state. */
  get state(): ShardState {
    return this.#state
  }

  /** The round trip time of the last acknowledged heartbeat, or `-1`. */
  get latency(): number {
    return this.#connection?.latency ?? -1
  }

  /** The last sequence number received. */
  get sequence(): number | null {
    return this.#session.sequence
  }

  /**
   * Opens a connection, resuming when a session is available.
   *
   * @throws {@link FatalGatewayError} if the shard has already failed terminally.
   */
  async connect(): Promise<void> {
    if (this.#state === ShardState.Fatal) {
      throw new FatalGatewayError('This shard failed terminally and cannot reconnect.')
    }
    if (this.#connection !== null) return

    await this.#session.load()
    this.#openConnection()
  }

  /**
   * Sends a payload once the shard is connected.
   *
   * @param payload - The payload to send.
   * @param signal - Aborts the wait for the command allowance.
   */
  async send(payload: GatewaySendPayload, signal?: AbortSignal): Promise<void> {
    const connection = this.#connection
    if (connection === null) throw new Error('The shard is not connected.')
    await connection.send(payload, signal)
  }

  /**
   * Stops the shard.
   *
   * @param recover - `'resume'` keeps the session resumable for a later restart;
   *                  `'none'` ends it, so the bot appears offline promptly.
   *
   * @remarks
   * The distinction matters more than it looks. Closing with 1000 invalidates the session,
   * so a reconnect implemented as close-then-connect silently converts every cheap resume
   * into a full identify — and session starts are a daily-capped resource.
   */
  async destroy(recover: 'none' | 'resume' = 'none'): Promise<void> {
    this.#clearTimers()
    const connection = this.#connection

    if (recover === 'resume') {
      await this.#session.persist()
    } else {
      await this.#session.forget()
    }

    // `Fatal` is terminal and stays terminal. Transitioning to `Closed` here made a shard that
    // failed on a rejected token reconnectable again — `connect()` throws in `Fatal` and
    // resolves in `Closed` — undoing the state that exists to stop a doomed reconnect loop.
    //
    // Only guarded here: a shard that went `Fatal` disposed its connection on the way, so it
    // always takes this branch.
    if (connection === null) {
      if (this.#state !== ShardState.Fatal) this.#transition(ShardState.Closed)
      return
    }

    this.#closingIntent = ClosingIntent.User
    this.#transition(ShardState.Closing)
    connection.close(recover === 'resume' ? CLOSE_RESUMABLE : CLOSE_PERMANENT, 'shutting down')
    connection.dispose()
    this.#connection = null
    this.#transition(ShardState.Closed)
  }

  /**
   * Decides how to connect, then opens the socket.
   */
  #openConnection(): void {
    this.#intent = this.#session.resumable ? ConnectIntent.Resume : ConnectIntent.Identify

    const base =
      this.#intent === ConnectIntent.Resume
        ? (this.#session.resumeUrl ?? this.#options.gatewayUrl)
        : this.#options.gatewayUrl

    const url = buildGatewayUrl(
      base,
      this.#options.version,
      this.#options.encoding.query,
      this.#compressionQuery(),
    )

    this.#epoch += 1
    this.#closingIntent = null
    this.#replaying = false

    const connection = new ShardConnection(
      this.#options,
      {
        onOpen: () => {
          this.#onOpen()
        },
        onFrame: (payload) => {
          this.#onFrame(payload)
        },
        onClose: (code, reason, wasClean) => {
          this.#onClose(code, reason, wasClean)
        },
        onError: (error) => {
          this.emit('error', error)
        },
        onZombie: () => {
          this.#onZombie()
        },
        onBackpressure: (inflight, bytes) => {
          this.#closingIntent = ClosingIntent.Backpressure
          this.emit('backpressure', inflight, bytes)
        },
        onHeartbeatDrift: (drift) => {
          this.emit('heartbeatDrift', drift)
        },
        currentSequence: () => this.#session.sequence,
      },
      url,
      this.#epoch,
    )

    this.#connection = connection
    this.#transition(ShardState.Connecting)
    connection.connect()

    // Policy, not protocol: Discord documents no deadline for Hello, but a socket that
    // opens and then says nothing would otherwise hang the shard indefinitely.
    this.#handshakeTimer = this.#options.timers.setTimeout(() => {
      if (this.#state !== ShardState.Handshaking) return
      this.emit('error', new Error('The gateway did not send Hello before the handshake timeout.'))
      this.#closingIntent = ClosingIntent.Resume
      this.#abandonAndReconnect()
    }, this.#options.handshakeTimeout)
  }

  /**
   * The `compress` query value for the configured mode.
   */
  #compressionQuery(): string | null {
    return this.#options.compression === 'none' ? null : this.#options.compression
  }

  /**
   * The socket opened. Nothing is sent until Hello arrives.
   */
  #onOpen(): void {
    this.#transition(ShardState.Handshaking)
  }

  /**
   * Routes one gateway frame.
   */
  #onFrame(payload: GatewayReceivePayload): void {
    switch (payload.op) {
      case GatewayOpcodes.Hello:
        this.#onHello(payload.d.heartbeat_interval)
        return
      case GatewayOpcodes.Heartbeat:
        // Discord asking for a beat can arrive in any state, including before Hello.
        this.#connection?.beatNow()
        return
      case GatewayOpcodes.HeartbeatAck:
        this.#connection?.ackHeartbeat()
        return
      case GatewayOpcodes.Reconnect:
        // Reachable from every state, including Handshaking. Closing immediately rather
        // than waiting uses the grace window Discord gives before it closes the socket.
        this.#closingIntent = ClosingIntent.Resume
        this.#connection?.close(CLOSE_RESUMABLE, 'gateway requested reconnect')
        return
      case GatewayOpcodes.InvalidSession:
        this.#onInvalidSession(payload.d)
        return
      case GatewayOpcodes.Dispatch:
        this.#onDispatch(payload)
        return
    }
  }

  /**
   * Hello arrived: start heartbeating, then identify or resume.
   */
  #onHello(intervalMs: number): void {
    this.#clearHandshakeTimer()
    this.emit('hello', intervalMs)

    const connection = this.#connection
    if (connection === null) return

    // Heartbeating starts first, and identify is deliberately *not* gated on the first
    // (jittered) beat having fired — that would delay login by up to a full interval,
    // which presents as a hung startup.
    connection.startHeartbeating(intervalMs)

    if (this.#intent === ConnectIntent.Resume) {
      this.#transition(ShardState.Resuming)
      this.#session.noteResumeAttempt()
      this.#resume(connection)
      return
    }

    this.#transition(ShardState.Identifying)
    this.#identify(connection)
  }

  /**
   * Sends the Identify payload, reporting any failure as an error event.
   */
  #identify(connection: ShardConnection): void {
    void sendIdentify(connection, this.#options, this.#throttler).catch((error: unknown) => {
      this.emit('error', error instanceof Error ? error : new Error(String(error)))
    })
  }

  /**
   * Sends the Resume payload, reporting any failure as an error event.
   */
  #resume(connection: ShardConnection): void {
    const snapshot = this.#session.snapshot()
    if (snapshot === undefined) return
    void sendResume(connection, this.#options, snapshot).catch((error: unknown) => {
      this.emit('error', error instanceof Error ? error : new Error(String(error)))
    })
  }

  /**
   * The session is invalid.
   */
  #onInvalidSession(resumable: boolean): void {
    // During identify a `d: true` is meaningless — there is no session to resume — and a
    // storm of them across a fleet is the signature of a broken identify throttle.
    const canResume = resumable && this.#state !== ShardState.Identifying

    if (!canResume) void this.#session.forget()
    this.#closingIntent = canResume ? ClosingIntent.Resume : null
    this.#abandonAndReconnect()
  }

  /**
   * A dispatch arrived.
   */
  #onDispatch(payload: GatewayDispatchPayload): void {
    // Only dispatches advance the sequence. Letting a control frame's `s: null` clobber it
    // turns a resumable session into a 4007 on the next resume.
    this.#session.advance(payload.s)

    if (payload.t === 'READY') {
      const data = payload.d
      this.#session.establish(data.session_id, data.resume_gateway_url, payload.s)
      this.#backoff.reset()
      this.#transition(ShardState.Ready)
      this.emit('ready', data)
      this.emit('dispatch', payload, false)
      return
    }

    if (payload.t === 'RESUMED') {
      this.#replaying = false
      this.#session.noteSuccess()
      this.#backoff.reset()
      this.#transition(ShardState.Ready)
      this.emit('resumed')
      this.emit('dispatch', payload, false)
      return
    }

    if (this.#state === ShardState.Resuming) {
      this.#replaying = true
      this.#transition(ShardState.Replaying)
    }

    this.emit('dispatch', payload, this.#replaying)
  }

  /**
   * The connection stopped acknowledging heartbeats.
   */
  #onZombie(): void {
    this.emit('zombie')
    this.#closingIntent = ClosingIntent.Zombie
    this.#abandonAndReconnect()
  }

  /**
   * The socket closed.
   */
  #onClose(code: number, reason: string, wasClean: boolean): void {
    this.#clearHandshakeTimer()

    if (this.#state === ShardState.Closing || this.#state === ShardState.Closed) return

    const verdict = resolveCloseVerdict(this.#closingIntent, code, wasClean)

    this.emit('closed', code, reason, wasClean, verdict.action)
    if (verdict.warn)
      this.emit('error', new Error(`Gateway close ${String(code)}: ${verdict.reason}`))

    if (verdict.action === ShardCloseAction.Fatal) {
      this.#disposeConnection()
      this.#transition(ShardState.Fatal)
      this.emit('error', new FatalGatewayError(verdict.reason, code))
      return
    }

    if (verdict.action === ShardCloseAction.ReIdentify) void this.#session.forget()

    // 4008 means payloads went out too fast, and reconnecting straight away is the tight loop
    // Discord revokes API access for. `startAtCap` exists for this and had no caller anywhere.
    if (code === GatewayCloseCodes.RateLimited) this.#backoff.startAtCap()

    this.#scheduleReconnect()
  }

  /**
   * Abandons the socket and schedules a reconnect.
   */
  #abandonAndReconnect(): void {
    this.#disposeConnection()
    this.#scheduleReconnect()
  }

  /**
   * Waits out the backoff, then reconnects.
   */
  #scheduleReconnect(): void {
    this.#disposeConnection()

    if (this.#backoff.exhausted) {
      this.#transition(ShardState.Fatal)
      this.emit(
        'error',
        new FatalGatewayError('Gave up reconnecting after the configured number of attempts.'),
      )
      return
    }

    // The resume path is bounded: `resume_gateway_url` names one gateway node, so if that
    // node is what failed, retrying it forever is a loop against a host that will never
    // answer. Fall back to a fresh identify against the base URL.
    // `>=`, not `>`: the count is incremented before this runs, so `>` allowed one resume more
    // than the option names — four for a configured three.
    if (this.#session.resumeAttempts >= this.#options.maxResumeAttempts) {
      void this.#session.forget()
    }

    this.#transition(ShardState.Reconnecting)
    const delay = this.#backoff.next()
    this.#reconnectTimer = this.#options.timers.setTimeout(() => {
      this.#reconnectTimer = null
      this.#openConnection()
    }, delay)
  }

  #disposeConnection(): void {
    this.#connection?.dispose()
    this.#connection = null
  }

  #clearHandshakeTimer(): void {
    if (this.#handshakeTimer === null) return
    this.#options.timers.clearTimeout(this.#handshakeTimer)
    this.#handshakeTimer = null
  }

  #clearTimers(): void {
    this.#clearHandshakeTimer()
    if (this.#reconnectTimer !== null) {
      this.#options.timers.clearTimeout(this.#reconnectTimer)
      this.#reconnectTimer = null
    }
  }

  #transition(to: ShardState): void {
    if (this.#state === to) return
    const from = this.#state
    this.#state = to
    this.emit('stateChange', from, to)
  }
}
