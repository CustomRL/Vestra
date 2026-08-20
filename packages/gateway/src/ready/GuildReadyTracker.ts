import type { Timers } from '../connection/Heartbeater.js'

/**
 * Settings for guild readiness tracking.
 */
export interface GuildReadyTrackerOptions {
  /** How long to wait with no new guild before declaring startup finished. */
  idleMs: number
  /**
   * Whether tracking applies at all.
   *
   * @remarks
   * Must be false when the `Guilds` intent is absent. Without it `GUILD_CREATE` never
   * arrives, so the pending set can never drain and an interaction-only bot would pay the
   * full timeout on every connect while its logs claimed guilds had failed to load.
   */
  enabled: boolean
}

/**
 * Tracks which guilds have streamed in after READY.
 *
 * @remarks
 * READY means the handshake succeeded, nothing more: its `guilds` are stubs carrying only
 * ids, and the real data arrives as a stream of `GUILD_CREATE` events afterwards. A client
 * that treats READY as "startup complete" reports an empty cache.
 *
 * The timer is **idle-based**, not absolute. A 2,500-guild shard legitimately streams for
 * far longer than a ten-guild one, so any fixed deadline either cuts off real bots or
 * needlessly delays small ones.
 *
 * This is deliberately not a gate on anything: Discord's guidance during an outage is to
 * keep heartbeating and wait, so as long as beats are acknowledged the connection is
 * healthy however long the stream takes.
 */
export class GuildReadyTracker {
  readonly #options: GuildReadyTrackerOptions
  readonly #timers: Timers
  readonly #onComplete: (unresolved: string[]) => void
  readonly #pending = new Set<string>()
  #handle: ReturnType<typeof setTimeout> | null = null
  #done = false

  /**
   * @param options - Tracking settings.
   * @param timers - Timer sources.
   * @param onComplete - Called once, with any guilds that never arrived.
   */
  constructor(
    options: GuildReadyTrackerOptions,
    timers: Timers,
    onComplete: (unresolved: string[]) => void,
  ) {
    this.#options = options
    this.#timers = timers
    this.#onComplete = onComplete
  }

  /** Guilds still waiting to arrive. */
  get pending(): ReadonlySet<string> {
    return this.#pending
  }

  /**
   * Records the guilds READY said to expect.
   *
   * @param ids - The guild ids from the READY payload.
   */
  seed(ids: string[]): void {
    if (!this.#options.enabled || ids.length === 0) {
      this.#complete()
      return
    }
    for (const id of ids) this.#pending.add(id)
    this.#arm()
  }

  /**
   * Marks a guild as accounted for.
   *
   * @param id - The guild's id.
   *
   * @remarks
   * Called for `GUILD_DELETE` as well as `GUILD_CREATE`. Guilds unavailable during an
   * outage arrive as a delete, so tracking only creates means those never clear and every
   * restart during a Discord incident falls through to the timeout.
   */
  resolve(id: string): void {
    if (this.#done || !this.#pending.delete(id)) return
    if (this.#pending.size === 0) {
      this.#complete()
      return
    }
    this.#arm()
  }

  /**
   * Stops tracking without reporting completion.
   */
  stop(): void {
    this.#done = true
    this.#disarm()
    this.#pending.clear()
  }

  #arm(): void {
    this.#disarm()
    this.#handle = this.#timers.setTimeout(() => {
      this.#handle = null
      this.#complete()
    }, this.#options.idleMs)
  }

  #disarm(): void {
    if (this.#handle === null) return
    this.#timers.clearTimeout(this.#handle)
    this.#handle = null
  }

  #complete(): void {
    if (this.#done) return
    this.#done = true
    this.#disarm()
    const unresolved = [...this.#pending]
    this.#pending.clear()
    this.#onComplete(unresolved)
  }
}
