/**
 * The cached entity types, and what each is keyed by.
 *
 * @remarks
 * A scope is one cached entity type, and it is the unit everything else in the cache is
 * per: one policy, one adapter instance, one entry in `client.cache`. Splitting on entity
 * type rather than on storage is what lets a consumer keep members in Redis and everything
 * else in memory.
 *
 * See ADR 4 for why caching is opt-in per scope at all, and `docs/design/phase-4-core.md`
 * §4.9 for the default table and the two places it deviates from ADR 4.
 */
export const CacheScope = {
  /** Guilds, keyed by guild ID. */
  Guilds: 'guilds',
  /** Guild and direct-message channels, keyed by channel ID. Never threads. */
  Channels: 'channels',
  /** Threads, keyed by channel ID. Separate from channels because the bound is far worse. */
  Threads: 'threads',
  /** Roles, keyed by role ID. */
  Roles: 'roles',
  /** Guild members, keyed by `guildId:userId`. */
  Members: 'members',
  /** Users, keyed by user ID. */
  Users: 'users',
  /** Messages, keyed by message ID. */
  Messages: 'messages',
  /** Presences, keyed by `guildId:userId` — one entry per membership, not per user. */
  Presences: 'presences',
  /** Voice states, keyed by `guildId:userId`. */
  VoiceStates: 'voiceStates',
  /** Custom emojis, keyed by emoji ID. */
  Emojis: 'emojis',
  /** Guild stickers, keyed by sticker ID. */
  Stickers: 'stickers',
} as const

/**
 * One cached entity type.
 */
export type CacheScope = (typeof CacheScope)[keyof typeof CacheScope]

/**
 * Every scope, in declaration order.
 *
 * @remarks
 * Derived rather than written out a second time, so a scope cannot be added to the object
 * above and forgotten here.
 */
export const CacheScopes: readonly CacheScope[] = Object.values(CacheScope)
