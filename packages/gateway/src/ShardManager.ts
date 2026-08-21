import { EventEmitter } from 'node:events'
import type { RESTGetAPIGatewayBotResult } from '@vestra/types'
import { Shard } from './Shard.js'
import type { ShardOptions } from './GatewayOptions.js'
import { LocalIdentifyThrottler, type IdentifyThrottler } from './session/IdentifyThrottler.js'
import { shardIdForGuild } from './util/ShardRouting.js'
import { SessionLimitError } from './errors/SessionLimitError.js'

/**
 * Fetches gateway connection information.
 *
 * @returns The result of `GET /gateway/bot`.
 *
 * @remarks
 * A function rather than a REST client, so `@vestra/gateway` does not depend on
 * `@vestra/rest`. The package graph is one-directional and this is the only thing the
 * gateway would have needed it for.
 */
export type GatewayBotFetcher = () => Promise<RESTGetAPIGatewayBotResult>

/**
 * Configuration for a fleet of shards.
 */
export interface ShardManagerOptions extends Omit<
  ShardOptions,
  'gatewayUrl' | 'shardCount' | 'shardId'
> {
  /** Fetches `GET /gateway/bot`. */
  fetchGatewayBot: GatewayBotFetcher
  /** The total shard count. Defaults to Discord's recommendation. */
  shardCount?: number
  /**
   * Which shards this process owns. Defaults to all of them.
   *
   * @remarks
   * Independent of `shardCount` on purpose. Running two managers with different counts,
   * sharing one throttler, is the sanctioned zero-downtime resharding path — `num_shards`
   * only routes traffic and does not limit how many sessions may exist.
   */
  shardIds?: number[]
  /**
   * Gates identifies. Defaults to a per-process throttler.
   *
   * @remarks
   * Injectable because identify buckets are scoped to the **token**, not the process. Four
   * processes of sixteen shards each using their own throttler will each believe they own
   * bucket 0, and four shards will identify in the same window — a failure that only
   * appears in production.
   */
  throttler?: IdentifyThrottler
  /** Warn when remaining session starts fall below this multiple of the shard count. */
  sessionStartHeadroom?: number
}

/**
 * Events a shard manager emits.
 */
export interface ShardManagerEvents {
  /** A shard was created and is connecting. */
  shardSpawn: [shardId: number]
  /** Every shard reported ready. */
  allReady: []
  /** A shard emitted an error. */
  error: [error: Error, shardId: number]
  /** Session start budget is running low. */
  sessionStartWarning: [remaining: number, total: number]
}

/**
 * Owns a fleet of shards and the information needed to start them.
 */
export class ShardManager extends EventEmitter<ShardManagerEvents> {
  readonly #options: ShardManagerOptions
  readonly #shards = new Map<number, Shard>()
  #throttler: IdentifyThrottler | undefined
  /** The base gateway URL, cached for the process lifetime. */
  #gatewayUrl: string | null = null
  #shardCount = 0

  /**
   * @param options - Fleet configuration.
   */
  constructor(options: ShardManagerOptions) {
    super()
    this.#options = options
    this.#throttler = options.throttler
  }

  /** The shards this manager owns. */
  get shards(): ReadonlyMap<number, Shard> {
    return this.#shards
  }

  /** The total shard count in use. */
  get shardCount(): number {
    return this.#shardCount
  }

  /**
   * Fetches gateway information, checks the session budget, and connects every shard.
   *
   * @throws {@link SessionLimitError} when starting would exceed the daily allowance.
   */
  async connect(): Promise<void> {
    // Called before opening any socket. Only `url` is cached for the process lifetime —
    // the rest of the response must not be, because `shards` and the session budget change
    // as the bot joins and leaves guilds, and a stale copy hides both.
    const info = await this.#options.fetchGatewayBot()
    this.#gatewayUrl = info.url
    this.#shardCount = this.#options.shardCount ?? info.shards

    const ids = this.#options.shardIds ?? Array.from({ length: this.#shardCount }, (_v, i) => i)

    const limit = info.session_start_limit
    if (limit.remaining < ids.length) throw new SessionLimitError(limit, ids.length)

    const headroom = this.#options.sessionStartHeadroom ?? 2
    if (limit.remaining < ids.length * headroom) {
      this.emit('sessionStartWarning', limit.remaining, limit.total)
    }

    this.#throttler ??= new LocalIdentifyThrottler(limit.max_concurrency)

    let readyCount = 0
    await Promise.all(
      ids.map(async (shardId) => {
        const shard = this.#createShard(shardId)
        shard.once('ready', () => {
          readyCount += 1
          if (readyCount !== ids.length) return

          // Deferred by a microtask rather than emitted inline. `shardSpawn` is the first
          // point a consumer can attach to a shard, and this listener is registered before
          // that — so emitting here runs ahead of every consumer `ready` handler, and
          // anything they derived from READY is a tick stale. With one shard the two land
          // in the same millisecond, which is how the race hides.
          queueMicrotask(() => {
            this.emit('allReady')
          })
        })
        this.emit('shardSpawn', shardId)
        await shard.connect()
      }),
    )
  }

  /**
   * Stops every shard.
   *
   * @param resumable - Whether to keep sessions resumable for a fast restart.
   */
  async destroy(resumable = false): Promise<void> {
    await Promise.all(
      [...this.#shards.values()].map(async (shard) => {
        await shard.destroy(resumable ? 'resume' : 'none')
      }),
    )
    this.#shards.clear()
  }

  /**
   * Which shard carries a guild's traffic.
   *
   * @param guildId - The guild's snowflake.
   * @returns The shard index.
   */
  shardIdForGuild(guildId: string): number {
    if (this.#shardCount === 0) {
      throw new Error('The shard count is not known until connect() has fetched it.')
    }
    return shardIdForGuild(guildId, this.#shardCount)
  }

  #createShard(shardId: number): Shard {
    if (this.#gatewayUrl === null) throw new Error('The gateway URL has not been fetched.')

    const shard = new Shard(
      {
        ...this.#options,
        gatewayUrl: this.#gatewayUrl,
        shardId,
        shardCount: this.#shardCount,
      },
      this.#throttler,
    )
    shard.on('error', (error) => {
      this.emit('error', error, shardId)
    })
    this.#shards.set(shardId, shard)
    return shard
  }
}
