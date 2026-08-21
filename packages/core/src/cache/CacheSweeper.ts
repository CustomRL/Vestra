import type { Timers } from '@vestra/gateway'
import type { AnyCacheStore } from './CacheRegistry.js'

/**
 * Runs the TTL sweep for every scope that has one.
 *
 * @remarks
 * TTL needs something to drive it, and the naive answers — a timer per scope, or per entry
 * — are what make TTL expensive. This is **one timer for the whole client**, and it is
 * armed only if at least one scope actually has a non-zero TTL.
 *
 * The default configuration has none, so **the default creates no timer at all**. That is
 * the answer to "a timer per cache is expensive": the common case pays nothing.
 *
 * `setTimeout` re-armed at the end of each sweep rather than `setInterval`, so a sweep that
 * runs long cannot stack on itself. Timers come from the injected seam, so sweep tests run
 * in mocked time — and, per the gateway's implementation note, the seam must dereference
 * `globalThis.setTimeout` at call time rather than capturing it at module scope, or every
 * timing test silently runs in real time.
 */
export class CacheSweeper {
  readonly #stores: readonly AnyCacheStore[]
  readonly #timers: Timers
  readonly #intervalMs: number
  #handle: ReturnType<Timers['setTimeout']> | undefined

  /**
   * @param stores - Every store; the ones with no TTL are filtered out once, here.
   * @param timers - Timer and clock sources.
   * @param intervalMs - How often to sweep, or `null` to never arm a timer.
   */
  constructor(
    stores: readonly AnyCacheStore[],
    timers: Timers,
    intervalMs: number | null = 60_000,
  ) {
    // Filtered once at construction rather than on every tick. A scope with no TTL can
    // never have an expired entry, so visiting it is pure cost.
    this.#stores = stores.filter((store) => store.enabled && store.expires)
    this.#timers = timers
    this.#intervalMs = intervalMs ?? 0
  }

  /** Whether anything needs sweeping at all. */
  get needed(): boolean {
    return this.#stores.length > 0 && this.#intervalMs > 0
  }

  /** Whether the timer is currently armed. */
  get running(): boolean {
    return this.#handle !== undefined
  }

  /**
   * Arms the timer, if there is anything to sweep.
   *
   * @remarks
   * Called from `login()` rather than at module scope: ADR 2 forbids top-level side effects
   * in `src/`, and a library that starts a timer on import is one nobody can embed.
   *
   * The handle is unref'd so the cache alone never holds the process open. Guarded, because
   * under a mocked clock the handle may be a plain number rather than a `Timeout`.
   */
  start(): void {
    if (this.running || !this.needed) return
    this.#arm()
  }

  /**
   * Clears the timer.
   *
   * @remarks
   * Idempotent, because `destroy()` may be called more than once and a client that throws
   * on a second shutdown is worse than one that shrugs.
   */
  stop(): void {
    if (this.#handle === undefined) return
    this.#timers.clearTimeout(this.#handle)
    this.#handle = undefined
  }

  /**
   * Sweeps every TTL'd scope once.
   *
   * @returns How many entries were dropped.
   *
   * @remarks
   * Public so a consumer who set `sweepInterval: null` can drive it from their own
   * scheduler. `REST.sweep()` sets that precedent in this repository and the cache mirrors
   * its shape.
   */
  sweep(): number {
    const now = this.#timers.now()
    let dropped = 0
    for (const store of this.#stores) dropped += store.sweep(now)
    return dropped
  }

  #arm(): void {
    const handle = this.#timers.setTimeout(() => {
      this.sweep()
      // Re-armed after the sweep, so a long sweep delays the next one rather than
      // overlapping it.
      if (this.#handle !== undefined) this.#arm()
    }, this.#intervalMs)

    this.#handle = handle
    if (typeof handle === 'object' && 'unref' in handle) handle.unref()
  }
}
