import { setTimeout as sleep } from 'node:timers/promises'

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
  #remaining: number
  #windowResetsAt = 0
  #blockedUntil = 0

  /**
   * @param limit - Requests permitted per second. Discord's default is 50; large bots
   *                may be granted more.
   */
  constructor(limit = 50) {
    this.#limit = limit
    this.#remaining = limit
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
    if (now >= this.#windowResetsAt) return 0
    if (this.#remaining > 0) return 0
    return this.#windowResetsAt - now
  }

  /**
   * Waits until a request may be sent, then consumes its allowance.
   *
   * @param exempt - Whether the route is exempt from the per-second ceiling.
   * @param signal - Aborts the wait.
   */
  async acquire(exempt: boolean, signal?: AbortSignal): Promise<void> {
    for (;;) {
      const now = Date.now()

      const blocked = this.#blockedUntil - now
      if (blocked > 0) {
        await sleep(blocked, undefined, signal ? { signal } : undefined)
        continue
      }

      if (exempt) return

      if (now >= this.#windowResetsAt) {
        this.#remaining = this.#limit
        this.#windowResetsAt = now + 1000
      }

      if (this.#remaining > 0) {
        this.#remaining -= 1
        return
      }

      await sleep(this.#windowResetsAt - now, undefined, signal ? { signal } : undefined)
    }
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
    if (until > this.#blockedUntil) this.#blockedUntil = until
  }

  /** Whether a global block is currently in force. */
  get blocked(): boolean {
    return this.#blockedUntil > Date.now()
  }
}
