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

/** How many slots the window is divided into. */
const SLOTS = 60

/** The span each slot covers. */
const SLOT_MS = WINDOW_MS / SLOTS

/** The count at which Discord temporarily bans the origin IP at the Cloudflare edge. */
export const CLOUDFLARE_BAN_THRESHOLD = 10_000

/**
 * Counts invalid responses over a rolling window and refuses to send near the threshold.
 *
 * @remarks
 * Discord bans an IP for an hour after 10,000 invalid requests in ten minutes, and the
 * ban applies to the whole machine — every bot in the process, and anything else sharing
 * the address. Recovery is waiting it out.
 *
 * The window is genuinely rolling, kept as a ring of ten-second slots. A tumbling window
 * that resets on a boundary would let the count drop from just under the threshold to
 * zero in an instant while Discord's own rolling counter still held nearly the full
 * amount — permitting close to twice the threshold inside one real ten-minute period,
 * which is precisely the ban this class exists to prevent. The ring costs 60 numbers and
 * bounds the resolution error to one slot.
 */
export class InvalidRequestTracker {
  readonly #threshold: number

  /** Count per slot. */
  readonly #counts = new Uint32Array(SLOTS)

  /** Which slot index each entry currently represents, so stale slots can be zeroed. */
  readonly #epochs = new Float64Array(SLOTS)

  /**
   * @param threshold - The count at which to start refusing. Defaults to 9,500, leaving
   *                    headroom for requests already in flight.
   */
  constructor(threshold = 9_500) {
    this.#threshold = threshold
    this.#epochs.fill(-1)
  }

  /**
   * Records a response status.
   *
   * @param status - The HTTP status of a completed request.
   * @param now - The current time, injectable for testing.
   */
  register(status: number, now = Date.now()): void {
    if (!INVALID_STATUSES.has(status)) return

    const epoch = Math.floor(now / SLOT_MS)
    const index = epoch % SLOTS

    // A slot whose epoch is not the current one holds a count from a previous lap of the
    // ring and must be discarded rather than added to.
    if (this.#epochs[index] !== epoch) {
      this.#epochs[index] = epoch
      this.#counts[index] = 0
    }
    this.#counts[index] = (this.#counts[index] ?? 0) + 1
  }

  /**
   * How many invalid requests have been seen in the last ten minutes.
   *
   * @param now - The current time, injectable for testing.
   * @returns The rolling count.
   */
  countIn(now = Date.now()): number {
    const currentEpoch = Math.floor(now / SLOT_MS)
    const oldestEpoch = currentEpoch - SLOTS + 1

    let total = 0
    for (let index = 0; index < SLOTS; index += 1) {
      const epoch = this.#epochs[index] ?? -1
      if (epoch >= oldestEpoch && epoch <= currentEpoch) total += this.#counts[index] ?? 0
    }
    return total
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
   * When the oldest counted request falls out of the window, as a millisecond timestamp.
   *
   * @param now - The current time, injectable for testing.
   * @returns When the count will next decrease, or `now` if nothing is counted.
   */
  decaysAt(now = Date.now()): number {
    const currentEpoch = Math.floor(now / SLOT_MS)
    const oldestEpoch = currentEpoch - SLOTS + 1

    let oldestPresent = Number.POSITIVE_INFINITY
    for (let index = 0; index < SLOTS; index += 1) {
      const epoch = this.#epochs[index] ?? -1
      if (epoch >= oldestEpoch && epoch <= currentEpoch && (this.#counts[index] ?? 0) > 0) {
        oldestPresent = Math.min(oldestPresent, epoch)
      }
    }

    if (!Number.isFinite(oldestPresent)) return now
    return (oldestPresent + SLOTS) * SLOT_MS
  }
}
