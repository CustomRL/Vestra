import type { GatewayBotFetcher, ShardManagerOptions } from '@vestra/gateway'
import type { REST, RESTOptions } from '@vestra/rest'
import type { GatewayIntentBits } from '@vestra/types'
import type { CacheOptions } from './cache/CacheRegistry.js'
import { DEFAULT_MAX_QUEUED } from './events/DispatchQueue.js'

/**
 * Configuration for a client, and its resolution.
 *
 * @remarks
 * The client owns four things the gateway would otherwise ask for separately — the token,
 * the intents, the user agent and how `/gateway/bot` is fetched — so they are lifted here
 * and removed from what a consumer may pass through. Leaving them in both places would let
 * a client identify with one set of intents and a shard with another.
 */

/** Gateway configuration, minus what the client owns. */
export type ClientGatewayOptions = Omit<
  ShardManagerOptions,
  'fetchGatewayBot' | 'intents' | 'token' | 'userAgent'
> & {
  /**
   * Overrides how gateway connection information is fetched.
   *
   * @remarks
   * Defaults to the client's own REST. Override it to serve `/gateway/bot` from a cache
   * shared across processes — the session budget it carries is per token, not per process —
   * or to drive a client in tests with no REST layer at all.
   */
  fetchGatewayBot?: GatewayBotFetcher
}

/** Configuration for a client. */
export interface ClientOptions {
  /** The bot token, without a scheme prefix. */
  token: string
  /**
   * The intents to identify with.
   *
   * @remarks
   * A bit set, or the bits to combine. The array form exists because
   * `[GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]` is what people write, and
   * making them reach for `|` is a papercut on the first line of every bot.
   */
  intents: number | readonly GatewayIntentBits[]
  /** The `User-Agent` presented on both REST and gateway traffic. */
  userAgent?: string
  /** Cache policy, adapter and sweep cadence. */
  cache?: CacheOptions
  /**
   * REST configuration, or an already-configured client to share.
   *
   * @remarks
   * Sharing one `REST` across several clients is the supported way to keep rate-limit
   * buckets coherent: the buckets are keyed by token, so two clients on one token with two
   * REST instances will each believe they have the whole allowance.
   */
  rest?: REST | RESTOptions
  /** Gateway configuration, passed through untouched. */
  gateway?: ClientGatewayOptions
  /**
   * How often the cache sweeper runs, in milliseconds, or `null` to drive it yourself.
   *
   * @remarks
   * Invented Vestra policy with no protocol basis. `null` mirrors `REST.sweep()`'s
   * precedent for consumers who schedule their own maintenance.
   */
  sweepInterval?: number | null
  /**
   * Delivers dispatches to listeners one at a time, per shard.
   *
   * @remarks
   * Off by default, and the default is the guarantee the gateway publishes: `emit` returns
   * once every listener has been *entered*, so an `async` listener that awaits yields and
   * the next dispatch is routed before it finishes.
   *
   * Switching this on makes the promise a listener returns a completion signal. That is the
   * cost, and it is not confined to the listener you meant: an unrelated `async` listener
   * starts holding up its shard's queue simply by being `async`.
   *
   * `true` takes the default depth; the object form sets it. See 4.8.
   *
   * One practical note: {@link ClientEvents} types listeners as returning `void`, because
   * that is what the default path does with the return value. A project running
   * typescript-eslint will therefore see `no-misused-promises` on every `async` listener it
   * registers, and the rule cannot tell that the promise is awaited here. Disabling it for
   * those listeners is the intended answer, not a workaround.
   */
  serialDispatch?: boolean | { maxQueued?: number }
}

/** {@link ClientOptions} with every default applied. */
export interface ResolvedClientOptions {
  /** The bot token. */
  token: string
  /** The intents bit set. */
  intents: number
  /** The `User-Agent`. */
  userAgent: string
  /** Cache policy. */
  cache: CacheOptions
  /** Gateway configuration. */
  gateway: ClientGatewayOptions
  /** Sweep cadence, or `null` for manual. */
  sweepInterval: number | null
  /** Serial dispatch depth per shard, or `null` when the mode is off. */
  serialDispatch: { maxQueued: number } | null
}

/** The default user agent, which Discord requires to identify the library. */
const DEFAULT_USER_AGENT = 'DiscordBot (https://github.com/CustomRL/Vestra, 0.0.0)'

/**
 * Combines intent bits.
 *
 * @param intents - A bit set, or the bits to combine.
 * @returns The bit set.
 */
export function resolveIntents(intents: number | readonly GatewayIntentBits[]): number {
  if (typeof intents === 'number') return intents
  return intents.reduce<number>((total, bit) => total | bit, 0)
}

/**
 * Normalises the two spellings of serial mode into one.
 *
 * @param option - What the caller passed.
 * @returns The resolved depth, or `null` when the mode is off.
 *
 * @remarks
 * `false` and `undefined` both mean off and both resolve to `null`, so every later check is
 * one comparison rather than a three-way discrimination repeated per call site.
 */
function resolveSerialDispatch(
  option: boolean | { maxQueued?: number } | undefined,
): { maxQueued: number } | null {
  if (option === undefined || option === false) return null
  if (option === true) return { maxQueued: DEFAULT_MAX_QUEUED }
  return { maxQueued: option.maxQueued ?? DEFAULT_MAX_QUEUED }
}

/**
 * Applies defaults to client options.
 *
 * @param options - The caller's options.
 * @returns Options with every field populated.
 * @throws When the token is empty, which fails far more clearly here than as a 4004 later.
 */
export function resolveClientOptions(options: ClientOptions): ResolvedClientOptions {
  const token = options.token.trim()
  if (token === '') {
    // Caught here rather than at the gateway, where it arrives as close code 4004 with no
    // indication that the token was blank rather than wrong.
    throw new TypeError('A client needs a token.')
  }

  return {
    token,
    intents: resolveIntents(options.intents),
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
    cache: options.cache ?? {},
    gateway: options.gateway ?? {},
    sweepInterval: options.sweepInterval === undefined ? 60_000 : options.sweepInterval,
    serialDispatch: resolveSerialDispatch(options.serialDispatch),
  }
}
