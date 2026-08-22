/**
 * Settings for reconnect pacing.
 */
export interface BackoffOptions {
  /** The first delay, before jitter, in milliseconds. */
  baseMs: number
  /** The longest delay, before jitter, in milliseconds. */
  capMs: number
  /** How many attempts before giving up. `null` never gives up. */
  maxAttempts: number | null
  /** Source of randomness, injectable so tests are deterministic. */
  random: () => number
}

/**
 * The default pacing.
 */
export const DefaultBackoffOptions: BackoffOptions = {
  baseMs: 1_000,
  capMs: 60_000,
  maxAttempts: null,
  random: Math.random,
}

/**
 * Paces reconnection attempts.
 *
 * @remarks
 * **Everything in this class is Vestra policy, not protocol.** Discord's documentation
 * contains no backoff guidance at all — the only related advice is negative: consider
 * some close codes a signal to stop reconnecting entirely.
 *
 * The strategy is *full jitter*: `random() * min(cap, base * 2^attempt)`. Fixed delays
 * and half-jitter both leave a fleet synchronised, and a fleet whose shards all
 * disconnected in the same second will otherwise reconnect in the same second too —
 * which looks indistinguishable from an attack and gets the whole fleet throttled.
 */
export class Backoff {
  readonly #options: BackoffOptions
  #attempt = 0

  /**
   * @param options - Pacing settings.
   */
  constructor(options: BackoffOptions = DefaultBackoffOptions) {
    this.#options = options
  }

  /** How many attempts have been made since the last success. */
  get attempt(): number {
    return this.#attempt
  }

  /** Whether the attempt limit has been reached. */
  get exhausted(): boolean {
    const { maxAttempts } = this.#options
    return maxAttempts !== null && this.#attempt >= maxAttempts
  }

  /**
   * Consumes an attempt and returns how long to wait.
   *
   * @returns The delay in milliseconds.
   */
  next(): number {
    const ceiling = Math.min(this.#options.capMs, this.#options.baseMs * 2 ** this.#attempt)
    this.#attempt += 1
    return Math.floor(this.#options.random() * ceiling)
  }

  /**
   * Clears the attempt count.
   *
   * @remarks
   * Call this on `READY` or `RESUMED` only — never when the socket merely opens. The
   * common failure is a socket that opens and is immediately closed with an unrecoverable
   * code; resetting on open makes the backoff useless in exactly that case, producing a
   * tight reconnect loop against a gateway that will never accept the connection.
   */
  reset(): void {
    this.#attempt = 0
  }

  /**
   * Jumps straight to the maximum delay.
   *
   * @remarks
   * For close code 4008, where the cause is this client sending too fast. Starting over
   * at one second would reproduce the condition immediately.
   */
  startAtCap(): void {
    const { baseMs, capMs } = this.#options
    this.#attempt = Math.max(this.#attempt, Math.ceil(Math.log2(capMs / baseMs)))
  }
}
