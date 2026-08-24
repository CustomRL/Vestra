import { GatewayOpcodes, type GatewayReceivePayload, type GatewaySendPayload } from '@vestra/types'
import { createCompression, type Compression } from '../compression/index.js'
import type { ResolvedShardOptions } from '../GatewayOptions.js'
import type { Transport } from '../transport/Transport.js'
import { Heartbeater } from './Heartbeater.js'
import { SendQueue } from './SendQueue.js'

/**
 * What the shard needs from a connection's events.
 */
export interface ConnectionHooks {
  /** The socket opened. */
  onOpen: () => void
  /** A gateway payload arrived and parsed. */
  onFrame: (payload: GatewayReceivePayload) => void
  /** The socket closed. */
  onClose: (code: number, reason: string, wasClean: boolean) => void
  /** Something went wrong that does not itself close the socket. */
  onError: (error: Error) => void
  /** The connection stopped acknowledging heartbeats and must be abandoned. */
  onZombie: () => void
  /** Undelivered traffic exceeded the configured ceiling. */
  onBackpressure: (inflight: number, bytes: number) => void
  /** A heartbeat fired late, indicating a blocked event loop. */
  onHeartbeatDrift: (driftMs: number) => void
  /** The sequence number to send with heartbeats. */
  currentSequence: () => number | null
}

/**
 * Owns one websocket from `connect()` to disposal, and is never reused.
 *
 * @remarks
 * The `epoch` exists because sockets outlive their usefulness: a late event from an
 * abandoned socket must be attributable to the connection that produced it, or it will be
 * applied to its replacement.
 */
export class ShardConnection {
  /** Which connection attempt this is, so late events can be attributed. */
  readonly epoch: number

  readonly #options: ResolvedShardOptions
  readonly #hooks: ConnectionHooks
  readonly #url: string
  readonly #transport: Transport
  readonly #compression: Compression
  readonly #queue: SendQueue
  readonly #heartbeater: Heartbeater

  /** Messages pushed into decompression but not yet delivered. */
  #inflight = 0
  /** Compressed bytes received but not yet resolved into payloads. */
  #bufferedBytes = 0
  #disposed = false

  /**
   * @param options - Resolved shard options.
   * @param hooks - Callbacks for this connection's events.
   * @param url - The fully qualified gateway URL.
   * @param epoch - The connection attempt number.
   */
  constructor(options: ResolvedShardOptions, hooks: ConnectionHooks, url: string, epoch: number) {
    this.#options = options
    this.#hooks = hooks
    this.#url = url
    this.epoch = epoch

    this.#queue = new SendQueue(options.sendQueue)

    this.#compression = createCompression(
      options.compression,
      {
        onPayload: (payload) => {
          this.#onPayload(payload)
        },
        onError: (error) => {
          // The context cannot be reset once it has errored, so the connection is dead.
          this.#hooks.onError(error)
          this.#hooks.onClose(4000, 'decompression failed', false)
        },
      },
      options.compressionLimits,
    )

    this.#heartbeater = new Heartbeater(
      {
        sendHeartbeat: () => {
          this.#sendHeartbeat()
        },
        onZombie: () => {
          this.#hooks.onZombie()
        },
        onDrift: (drift) => {
          this.#hooks.onHeartbeatDrift(drift)
        },
      },
      options.timers,
      options.heartbeat,
    )

    this.#transport = options.transport(
      {
        onOpen: () => {
          if (!this.#disposed) this.#hooks.onOpen()
        },
        onMessage: (data) => {
          this.#onMessage(data)
        },
        onClose: (code, reason, wasClean) => {
          if (!this.#disposed) this.#hooks.onClose(code, reason, wasClean)
        },
        onError: (error) => {
          if (!this.#disposed) this.#hooks.onError(error)
        },
      },
      {
        userAgent: options.userAgent,
        ...(options.dispatcher === undefined ? {} : { dispatcher: options.dispatcher }),
      },
    )
  }

  /** Whether this connection has been abandoned. */
  get disposed(): boolean {
    return this.#disposed
  }

  /**
   * Reads the disposal flag in a way narrowing cannot elide.
   *
   * @remarks
   * Needed after an `await`: TypeScript narrows the field from an earlier guard and has no
   * way to know that disposal can happen while the send queue is waiting.
   */
  #isDisposed(): boolean {
    return this.#disposed
  }

  /** The round trip time of the last acknowledged heartbeat, or `-1`. */
  get latency(): number {
    return this.#heartbeater.latency
  }

  /** The URL this connection was opened against. */
  get url(): string {
    return this.#url
  }

  /**
   * Opens the socket.
   */
  connect(): void {
    this.#transport.connect(this.#url)
  }

  /**
   * Starts heartbeating at the interval Discord specified.
   *
   * @param intervalMs - The interval from the Hello payload.
   */
  startHeartbeating(intervalMs: number): void {
    if (this.#disposed) return
    this.#heartbeater.start(intervalMs)
  }

  /**
   * Sends a heartbeat immediately, because Discord asked for one.
   */
  beatNow(): void {
    if (this.#disposed) return
    this.#heartbeater.beatNow()
  }

  /**
   * Records a heartbeat acknowledgement.
   */
  ackHeartbeat(): void {
    if (this.#disposed) return
    this.#heartbeater.ack()
  }

  /**
   * Sends a payload, waiting for the command allowance.
   *
   * @param payload - The payload to send.
   * @param signal - Aborts the wait.
   * @throws If the payload is too large, or the wait exceeds the configured ceiling.
   */
  async send(payload: GatewaySendPayload, signal?: AbortSignal): Promise<void> {
    if (this.#disposed) return
    const serialised = this.#options.encoding.encode(payload)
    this.#queue.assertWithinSizeLimit(serialised, payload.op)
    await this.#queue.acquire(signal)
    if (this.#isDisposed()) return
    this.#transport.send(serialised)
  }

  /**
   * Begins a closing handshake.
   *
   * @param code - 1000 to end the session deliberately, 4000 to keep it resumable.
   * @param reason - An optional reason.
   */
  close(code: number, reason?: string): void {
    if (this.#disposed) return
    this.#heartbeater.stop()
    this.#transport.close(code, reason)
  }

  /**
   * Abandons the socket without waiting for a closing handshake.
   *
   * @remarks
   * The only correct response to a zombie connection: a graceful close needs the peer to
   * reply, and a zombie by definition does not, so the socket would sit in `CLOSING`
   * forever.
   */
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#heartbeater.stop()
    this.#compression.destroy()
    this.#transport.destroy()
  }

  /**
   * Sends a heartbeat, if the reserved allowance permits.
   */
  #sendHeartbeat(): void {
    if (this.#disposed) return
    if (!this.#queue.tryTakeHeartbeatSlot()) {
      this.#hooks.onError(
        new Error(
          'The gateway command allowance is exhausted, so a heartbeat could not be sent. ' +
            'The connection will be diagnosed as zombied shortly.',
        ),
      )
      return
    }
    const payload = { op: GatewayOpcodes.Heartbeat, d: this.#hooks.currentSequence() } as const
    this.#transport.send(this.#options.encoding.encode(payload))
  }

  /**
   * Feeds an arriving websocket message into decompression.
   */
  #onMessage(data: ArrayBuffer | string): void {
    if (this.#disposed) return

    // Zero-copy view; nothing is retained past the decode below.
    const chunk = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data)

    this.#inflight += 1
    this.#bufferedBytes += chunk.byteLength

    const { maxInflightMessages, maxBufferedBytes } = this.#options.backpressure
    if (this.#inflight > maxInflightMessages || this.#bufferedBytes > maxBufferedBytes) {
      // The transport offers no receive back-pressure, so the only lever is closing.
      // A non-1000 close leaves the session resumable, so nothing is lost by doing it.
      this.#hooks.onBackpressure(this.#inflight, this.#bufferedBytes)
      this.close(4000, 'back-pressure')
      return
    }

    this.#compression.push(chunk)
  }

  /**
   * Decodes one decompressed payload and hands it to the shard.
   *
   * @remarks
   * Runs inside the decompressor's borrow window, so the buffer is decoded here and never
   * stored.
   */
  #onPayload(payload: Buffer): void {
    this.#inflight = Math.max(0, this.#inflight - 1)
    this.#bufferedBytes = 0

    if (this.#disposed) return

    let frame: GatewayReceivePayload
    try {
      frame = this.#options.encoding.decode(payload)
    } catch (error) {
      // With zstd there is no framing self-check, so a parse failure is the only signal
      // that the one-message-to-one-payload assumption was violated. Report it as a
      // protocol failure rather than as a decoding bug.
      this.#hooks.onError(
        new Error(
          `Could not parse a gateway payload. With ${this.#options.compression} this usually ` +
            'means the message framing assumption was violated rather than that the ' +
            'decoder is faulty.',
          { cause: error },
        ),
      )
      return
    }

    this.#hooks.onFrame(frame)
  }
}
