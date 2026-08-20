/**
 * Statuses Discord counts as invalid requests.
 *
 * @remarks
 * Note that 429 is included. Being rate limited and retrying is itself an invalid
 * request, so a naive retry loop accelerates towards the ban rather than away from it.
 */
const INVALID_STATUSES = new Set([401, 403, 429])

/** The window Discord counts invalid requests over. */
const WINDOW_MS = 600_000

/** The count at which Discord temporarily bans the origin IP at the Cloudflare edge. */
export const CLOUDFLARE_BAN_THRESHOLD = 10_000

/**
 * Counts invalid responses and refuses to send once the ban threshold is near.
 *
 * @remarks
 * Discord bans an IP for an hour after 10,000 invalid requests in ten minutes, and the
 * ban applies to the whole machine — every bot in the process, and anything else sharing
 * the address. Recovery is waiting it out.
 *
 * The failure is almost always a bug: a permission error in a loop, an expired token
 * retried forever. Vestra stops short of the threshold and raises, because a loud failure
 * at 9,500 is far cheaper than a silent hour of downtime at 10,000.
 */
export class InvalidRequestTracker {
  readonly #threshold: number
  #count = 0
  #windowStartedAt = 0

  /**
   * @param threshold - The count at which to start refusing. Defaults to 9,500, leaving
   *                    headroom for requests already in flight.
   */
  constructor(threshold = 9_500) {
    this.#threshold = threshold
  }

  /**
   * Records a response status.
   *
   * @param status - The HTTP status of a completed request.
   * @param now - The current time, injectable for testing.
   */
  register(status: number, now = Date.now()): void {
    if (!INVALID_STATUSES.has(status)) return

    if (now - this.#windowStartedAt >= WINDOW_MS) {
      this.#windowStartedAt = now
      this.#count = 0
    }
    this.#count += 1
  }

  /**
   * How many invalid requests have been seen in the current window.
   *
   * @param now - The current time, injectable for testing.
   * @returns The count, or `0` once the window has elapsed.
   */
  countIn(now = Date.now()): number {
    if (now - this.#windowStartedAt >= WINDOW_MS) return 0
    return this.#count
  }

  /**
   * Whether sending should stop to avoid a Cloudflare ban.
   *
   * @param now - The current time, injectable for testing.
   * @returns `true` when the threshold has been reached.
   */
  shouldStop(now = Date.now()): boolean {
    return this.countIn(now) >= this.#threshold
  }

  /**
   * When the current window elapses, as a millisecond timestamp.
   */
  get windowResetsAt(): number {
    return this.#windowStartedAt + WINDOW_MS
  }
}
