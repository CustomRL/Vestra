import { setTimeout as sleep } from 'node:timers/promises'

/**
 * The window one identify bucket occupies.
 */
const IDENTIFY_WINDOW_MS = 5_000

/**
 * Gates how many shards may identify at once.
 *
 * @remarks
 * An interface so a multi-process fleet can coordinate through Redis. Identify
 * concurrency is enforced per *token*, not per process, so several processes sharing a
 * token must share a throttler or they will collectively exceed the limit while each
 * believes it is compliant.
 */
export interface IdentifyThrottler {
  /**
   * Waits until the given shard is allowed to identify.
   *
   * @param shardId - The shard about to identify.
   * @param signal - Aborts the wait.
   */
  waitForIdentify: (shardId: number, signal?: AbortSignal) => Promise<void>
}

/**
 * Gates identifies within one process, using Discord's bucket rule.
 *
 * @remarks
 * Shards are bucketed by `shardId % maxConcurrency`, and one bucket may identify per five
 * second window. For most applications `max_concurrency` is 1, so shards identify strictly
 * one at a time — which is why a large fleet takes minutes to start and why doing this
 * wrong works perfectly in development with a single shard.
 *
 * Exceeding the limit invalidates sessions and burns the daily session-start allowance,
 * so the correct behaviour when in doubt is to wait.
 */
export class LocalIdentifyThrottler implements IdentifyThrottler {
  readonly #maxConcurrency: number
  /** When each bucket next becomes free, as a millisecond timestamp. */
  readonly #freeAt: number[]
  /** Serialises waiters per bucket so they are admitted in order. */
  readonly #tails: Promise<void>[]

  /**
   * @param maxConcurrency - The `max_concurrency` from `GET /gateway/bot`.
   */
  constructor(maxConcurrency: number) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new RangeError(
        `max_concurrency must be a positive integer, received ${String(maxConcurrency)}. ` +
          'It comes from GET /gateway/bot and must not be guessed.',
      )
    }
    this.#maxConcurrency = maxConcurrency
    this.#freeAt = Array.from({ length: maxConcurrency }, () => 0)
    this.#tails = Array.from({ length: maxConcurrency }, () => Promise.resolve())
  }

  /**
   * Waits until the given shard is allowed to identify.
   *
   * @param shardId - The shard about to identify.
   * @param signal - Aborts the wait.
   */
  async waitForIdentify(shardId: number, signal?: AbortSignal): Promise<void> {
    const bucket = shardId % this.#maxConcurrency

    const previous = this.#tails[bucket] ?? Promise.resolve()
    let release!: () => void
    this.#tails[bucket] = new Promise<void>((resolve) => {
      release = resolve
    })

    try {
      await previous
      signal?.throwIfAborted()

      const now = Date.now()
      const freeAt = this.#freeAt[bucket] ?? 0
      const delay = freeAt - now
      if (delay > 0) await sleep(delay, undefined, signal ? { signal } : undefined)

      this.#freeAt[bucket] = Math.max(Date.now(), freeAt) + IDENTIFY_WINDOW_MS
    } finally {
      release()
    }
  }
}
