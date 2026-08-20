import { setTimeout as sleep } from 'node:timers/promises'

/**
 * Notified before the limiter sleeps, so the caller can enforce its own ceiling.
 *
 * @param delayMs - How long the limiter is about to wait.
 * @param global - Whether the wait is a global block rather than the per-second ceiling.
 * @throws Whatever the caller decides; throwing aborts the wait.
 */
export type GlobalWaitHook = (delayMs: number, global: boolean) => void

/**
 * Enforces the account-wide request limit that sits above every per-route bucket.
 *
 * @remarks
 * Two separate mechanisms live here because Discord enforces two:
 *
 * - A steady ceiling of 50 requests per second across the whole token. Exceeding it
 *   returns a 429 with `x-ratelimit-scope: global`.
 * - A hard block, set when such a 429 arrives, during which *no* request may go out.
 *   Continuing to send while globally limited is what escalates a throttle into a
 *   Cloudflare ban.
 *
 * Interaction callbacks are exempt from the first but not the second, which is why the
 * caller passes `exempt` rather than this class inferring it.
 */
export class GlobalLimiter {
  readonly #limit: number

  /**
   * Send times of the most recent requests, as a ring buffer of length `limit`.
   *
   * @remarks
   * A true sliding window, not a window that resets on a fixed boundary. A tumbling
   * window lets an idle-then-burst pattern put up to twice the allowance into one real
   * second — 50 at the end of one window and 50 at the start of the next — which is
   * exactly the shape a bot has when it wakes up and flushes queued work.
   */
  readonly #sent: Float64Array
  #next = 0
  #count = 0

  #blockedUntil = 0

  /**
   * @param limit - Requests permitted per second. Discord's default is 50; large bots
   *                may be granted more.
   */
  constructor(limit = 50) {
    this.#limit = limit
    this.#sent = new Float64Array(limit)
  }

  /**
   * How long a request must wait before it may be sent, in milliseconds.
   *
   * @param exempt - Whether the route is exempt from the per-second ceiling.
   * @param now - The current time, injectable for testing.
   * @returns Milliseconds to wait; `0` if the request may proceed immediately.
   */
  delayFor(exempt: boolean, now = Date.now()): number {
    // A global block applies to everything, exemptions included.
    const blocked = this.#blockedUntil - now
    if (blocked > 0) return blocked
    if (exempt) return 0
    if (this.#count < this.#limit) return 0

    // The oldest of the last `limit` sends. Once it is more than a second old, a slot
    // has freed up.
    const oldest = this.#sent[this.#next] ?? 0
    const freeAt = oldest + 1000
    return freeAt > now ? freeAt - now : 0
  }

  /**
   * Waits until a request may be sent, then consumes its allowance.
   *
   * @param exempt - Whether the route is exempt from the per-second ceiling.
   * @param signal - Aborts the wait.
   * @param onWait - Called before each sleep, so the caller can apply a timeout ceiling.
   *
   * @remarks
   * `onWait` exists because the caller's `rateLimitTimeout` check happens before this
   * method is entered. A global block landing in between would otherwise stall the
   * request for its full duration, silently ignoring the ceiling the user configured.
   */
  async acquire(exempt: boolean, signal?: AbortSignal, onWait?: GlobalWaitHook): Promise<void> {
    for (;;) {
      const now = Date.now()

      const blocked = this.#blockedUntil - now
      if (blocked > 0) {
        onWait?.(blocked, true)
        await sleep(blocked, undefined, signal ? { signal } : undefined)
        continue
      }

      if (exempt) return

      const delay = this.delayFor(false, now)
      if (delay > 0) {
        onWait?.(delay, true)
        await sleep(delay, undefined, signal ? { signal } : undefined)
        continue
      }

      this.#record(now)
      return
    }
  }

  /**
   * Records a send in the sliding window.
   */
  #record(now: number): void {
    this.#sent[this.#next] = now
    this.#next = (this.#next + 1) % this.#limit
    if (this.#count < this.#limit) this.#count += 1
  }

  /**
   * Blocks every request until the given time.
   *
   * @param until - When sending may resume, as a millisecond timestamp.
   *
   * @remarks
   * Only ever extends the block. A shorter `Retry-After` arriving from a request that
   * was already in flight must not shorten a longer block already in force.
   */
  blockUntil(until: number): void {
    if (Number.isFinite(until) && until > this.#blockedUntil) this.#blockedUntil = until
  }

  /** Whether a global block is currently in force. */
  get blocked(): boolean {
    return this.#blockedUntil > Date.now()
  }
}
