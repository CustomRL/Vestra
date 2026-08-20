import { EventEmitter } from 'node:events'
import type { APISessionStartLimit, RESTGetAPIGatewayBotResult } from '@vestra/types'
import { Shard } from './Shard.js'
import type { ShardOptions } from './GatewayOptions.js'
import { LocalIdentifyThrottler, type IdentifyThrottler } from './session/IdentifyThrottler.js'
import { shardIdForGuild } from './util/ShardRouting.js'

/**
 * Thrown when starting would exceed the daily session start allowance.
 *
 * @remarks
 * Deliberately fatal, never retried. Overrunning the limit does not throttle the bot: it
 * terminates every active session, resets the token, and emails the owner. A retry loop
 * past the cap converts a configuration mistake into an outage that needs a human to fix.
 */
export class SessionLimitError extends Error {
  /** Session starts left today. */
  readonly remaining: number
  /** The daily allowance. */
  readonly total: number
  /** Milliseconds until the allowance resets. */
  readonly resetAfter: number

  /**
   * @param limit - The session start limit from `GET /gateway/bot`.
   * @param required - How many session starts were needed.
   */
  constructor(limit: APISessionStartLimit, required: number) {
    super(
      `Starting ${String(required)} shards needs ${String(required)} session starts but only ` +
        `${String(limit.remaining)} of ${String(limit.total)} remain today. The allowance ` +
        `resets in ${String(Math.ceil(limit.reset_after / 1000))}s. Refusing to start: ` +
        'exceeding the limit terminates every session, resets the token, and emails the owner.',
    )
    this.name = 'SessionLimitError'
    this.remaining = limit.remaining
    this.total = limit.total
    this.resetAfter = limit.reset_after
  }
}

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
          if (readyCount === ids.length) this.emit('allReady')
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
