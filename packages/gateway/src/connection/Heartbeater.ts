import type { Timers } from '../util/Timers.js'
import { SystemTimers } from '../util/Timers.js'

/**
 * Callbacks the heartbeater invokes.
 */
export interface HeartbeaterHooks {
  /** Sends a heartbeat carrying the given sequence number. */
  sendHeartbeat: () => void
  /**
   * The connection stopped acknowledging heartbeats.
   *
   * @remarks
   * The implementation of this **must** abandon the socket rather than closing it
   * gracefully. See {@link Heartbeater} for why.
   */
  onZombie: () => void
  /**
   * The heartbeat timer fired late by more than the configured threshold.
   *
   * @param driftMs - How late it was.
   */
  onDrift: (driftMs: number) => void
}

/**
 * Settings for heartbeat behaviour.
 */
export interface HeartbeaterOptions {
  /** How late a heartbeat may fire before drift is reported, in milliseconds. */
  driftThresholdMs: number
}

/**
 * The default heartbeat settings.
 */
export const DefaultHeartbeaterOptions: HeartbeaterOptions = {
  driftThresholdMs: 2_000,
}

/**
 * Keeps one connection alive and detects when it has stopped responding.
 *
 * @remarks
 * The critical rule here concerns **zombie recovery**, and it is the worst failure mode
 * in the gateway design because it is invisible against a well-behaved mock server.
 *
 * A zombie connection is one where the socket is open but the peer has stopped
 * responding. Discord's guidance is to terminate with any close code other than 1000 or
 * 1001 and then resume. The trap is that a *graceful* close cannot work: a closing
 * handshake needs the peer to reply, and the peer is by definition not replying. The
 * socket sits in `CLOSING` forever — there is no closing-handshake timeout in undici and
 * no `terminate()` on the WHATWG interface — so a shard that waits for the close event
 * before reconnecting hangs permanently.
 *
 * {@link HeartbeaterHooks.onZombie} must therefore abandon the socket outright.
 */
export class Heartbeater {
  readonly #hooks: HeartbeaterHooks
  readonly #timers: Timers
  readonly #options: HeartbeaterOptions

  #interval = 0
  #handle: ReturnType<typeof setTimeout> | null = null
  #awaitingAck = false
  #lastBeatAt = 0
  #scheduledFor = 0
  #latency = -1
  #stopped = false

  /**
   * @param hooks - Callbacks for sending and for failure.
   * @param timers - Timer sources.
   * @param options - Heartbeat settings.
   */
  constructor(
    hooks: HeartbeaterHooks,
    timers: Timers = SystemTimers,
    options: HeartbeaterOptions = DefaultHeartbeaterOptions,
  ) {
    this.#hooks = hooks
    this.#timers = timers
    this.#options = options
  }

  /** The round trip time of the last acknowledged heartbeat, or `-1` if none. */
  get latency(): number {
    return this.#latency
  }

  /** Whether the most recent heartbeat has been acknowledged. */
  get acked(): boolean {
    return !this.#awaitingAck
  }

  /**
   * Begins heartbeating.
   *
   * @param intervalMs - The interval from the Hello payload.
   *
   * @remarks
   * Only the **first** beat of a connection is jittered, by `interval * random()`. After
   * that the cadence is exactly `interval`. The jitter exists so that a large fleet
   * reconnecting together does not then heartbeat in lockstep forever; re-randomising
   * every beat would not improve on that and would make the cadence unpredictable.
   *
   * A resumed connection is a new connection, so it jitters its own first beat again.
   */
  start(intervalMs: number): void {
    this.stop()
    this.#stopped = false
    this.#interval = intervalMs
    this.#awaitingAck = false
    this.#schedule(Math.floor(intervalMs * this.#timers.random()))
  }

  /**
   * Sends a heartbeat immediately, in response to Discord requesting one.
   *
   * @remarks
   * Deliberately does **not** reset the periodic timer, and shares the single
   * outstanding-acknowledgement flag. That way a burst of requested beats can neither
   * starve the periodic cadence nor falsely trip the zombie detector. Discord's
   * documentation does not say which behaviour it expects, so this is Vestra policy.
   */
  beatNow(): void {
    if (this.#stopped) return
    this.#beat()
  }

  /**
   * Records an acknowledgement.
   */
  ack(): void {
    if (this.#stopped) return
    this.#awaitingAck = false
    this.#latency = this.#timers.now() - this.#lastBeatAt
  }

  /**
   * Stops heartbeating.
   */
  stop(): void {
    this.#stopped = true
    if (this.#handle !== null) {
      this.#timers.clearTimeout(this.#handle)
      this.#handle = null
    }
    this.#awaitingAck = false
  }

  /**
   * Schedules the next beat.
   */
  #schedule(delayMs: number): void {
    this.#scheduledFor = this.#timers.now() + delayMs
    this.#handle = this.#timers.setTimeout(() => {
      this.#onTimer()
    }, delayMs)
  }

  /**
   * Runs when a beat is due.
   */
  #onTimer(): void {
    if (this.#stopped) return
    this.#handle = null

    // A blocked event loop delays this timer, Discord stops receiving beats and closes the
    // connection, the bot reconnects, replays, and blocks again — the classic "dies under
    // load" spiral. The fire-time delta is the only self-observable signal, because a
    // blocked loop cannot run the code that would notice in real time.
    const drift = this.#timers.now() - this.#scheduledFor
    if (drift > this.#options.driftThresholdMs) this.#hooks.onDrift(drift)

    // The zombie check happens at the moment the next beat is due, not on a separate
    // timer: if the previous beat was never acknowledged, sending another would only add
    // traffic to a connection that has already stopped carrying it.
    if (this.#awaitingAck) {
      // **How long it has been outstanding, not merely that it is.** A beat Discord *requested*
      // sets the same flag, so one arriving within a round trip of the scheduled beat left an
      // ack legitimately in flight when this fired — and a healthy socket was abandoned and a
      // resume spent. The window was about one RTT per interval, which on a busy shard is not
      // rare.
      //
      // A beat outstanding for a whole interval is the condition Discord's own guidance
      // describes, and it is what this now checks. Anything younger gets the rest of its
      // interval instead.
      const outstanding = this.#timers.now() - this.#lastBeatAt
      if (outstanding >= this.#interval) {
        this.stop()
        this.#hooks.onZombie()
        return
      }

      this.#schedule(this.#interval - outstanding)
      return
    }

    this.#beat()
    this.#schedule(this.#interval)
  }

  /**
   * Sends one heartbeat.
   */
  #beat(): void {
    this.#awaitingAck = true
    this.#lastBeatAt = this.#timers.now()
    this.#hooks.sendHeartbeat()
  }
}
