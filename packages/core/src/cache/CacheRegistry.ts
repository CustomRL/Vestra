import type { Snowflake } from '@vestra/types'
import type { CacheAdapterFactory } from './CacheAdapter.js'
import { guildUserKey } from './CacheKeys.js'
import { resolveCachePolicy, type CacheOption } from './CachePolicy.js'
import { CacheScope } from './CacheScopes.js'
import { CacheStore } from './CacheStore.js'
import type { Guild } from '../structures/Guild.js'
import type { GuildMember } from '../structures/GuildMember.js'
import type { Message } from '../structures/Message.js'
import type { Role } from '../structures/Role.js'
import type { User } from '../structures/User.js'

/**
 * What each scope stores.
 *
 * @remarks
 * One line per scope, and a scope with no line is not yet reachable through the registry.
 * That is deliberate staging rather than an oversight: a scope is added here when its
 * structure exists, so the map never promises a type nothing can produce.
 *
 * The scopes still to arrive are `channels`, `threads`, `presences`,
 * `voiceStates`, `emojis` and `stickers` — each lands with its structure. Adding one is a
 * line here and a row in {@link CacheKeys}, not a change to anything below.
 */
export interface CacheValueMap<Client> {
  /** Guilds, keyed by guild ID. */
  guilds: Guild<Client>
  /** Users, keyed by user ID. */
  users: User<Client>
  /** Roles, keyed by role ID. */
  roles: Role<Client>
  /** Guild members, keyed by `guildId:userId`. */
  members: GuildMember<Client>
  /** Messages, keyed by message ID. */
  messages: Message<Client>
}

/** The scopes the registry currently serves. */
export type CachedScope = keyof CacheValueMap<unknown>

/** What a given scope stores. */
export type CacheValue<S extends CachedScope, Client> = CacheValueMap<Client>[S]

/**
 * How each scope derives its key, and the group it belongs to.
 *
 * @remarks
 * Kept beside the value map because the two must agree: a scope's key has to be derivable
 * from the value the map says it holds, or `CacheStore.add` cannot work.
 */
const CacheKeys = {
  guilds: {
    keyOf: (value: Guild) => value.id,
  },
  users: {
    keyOf: (value: User) => value.id,
  },
  roles: {
    keyOf: (value: Role) => value.id,
    groupKeyOf: (value: Role) => value.guildId,
  },
  members: {
    keyOf: (value: GuildMember) => guildUserKey(value.guildId, value.userId),
    groupKeyOf: (value: GuildMember) => value.guildId,
  },
  messages: {
    keyOf: (value: Message) => value.id,
    groupKeyOf: (value: Message) => value.channelId,
  },
} as const

/**
 * What a consumer may say about caching.
 */
export type CacheOptions<Client = unknown> = {
  [S in CachedScope]?: CacheOption<CacheValue<S, Client>>
} & {
  /** Swaps the storage implementation for every scope. */
  adapter?: CacheAdapterFactory
  /** The clock, injectable so expiry can be driven in tests. */
  now?: () => number
}

/**
 * What each scope does when the consumer says nothing.
 *
 * @remarks
 * ADR 4's position: cache what the client needs to function and nothing else. Everything
 * here is Vestra policy rather than protocol, and the two that are on are on for reasons
 * worth restating.
 *
 * `guilds` is on because ADR 4 says so. `roles` is on and ADR 4 does not list it — permission computation is the most common
 * thing a bot does and is impossible offline without roles, and roles are bounded at 250
 * per guild by Discord and arrive inside the guild payload anyway. `users` stays off
 * because it is unbounded in exactly the way ADR 4 exists to prevent: it grows with every
 * person the bot has ever seen speak.
 */
export const DefaultCacheOptions: Record<CachedScope, CacheOption<never>> = {
  guilds: true,
  users: false,
  roles: true,
  members: false,
  messages: false,
}

/**
 * The parts of a store that do not depend on what it holds.
 *
 * @remarks
 * Lets the registry sweep and clear every scope without knowing their value types, and
 * without a cast. `CacheStore<T>` satisfies this structurally for any `T`, whereas a
 * `CacheStore<never>` array does not describe a heterogeneous collection — `never` is a
 * subtype of everything, not a supertype, so the cast it needed was unsound.
 */
export interface AnyCacheStore {
  /** Which entity type the store holds. */
  readonly scope: CacheScope
  /** Whether it stores anything at all. */
  readonly enabled: boolean
  /** Whether its entries can expire. */
  readonly expires: boolean
  /** How many entries it holds. */
  readonly size: number
  /** Drops expired entries, returning how many. */
  sweep: (now: number) => number
  /** Drops everything. */
  clear: () => void
}

/**
 * Every scope's cache, in one place.
 *
 * @remarks
 * This is `client.cache`. Each scope is always present, even when disabled — a disabled
 * scope is a store over a {@link NullCacheAdapter}, never `undefined` — so no handler ever
 * writes `if (client.cache.members)`.
 */
export class CacheRegistry<Client = unknown> {
  /** Guilds the bot is in. On by default, per ADR 4. */
  readonly guilds: CacheStore<Guild<Client>>
  /** Users the bot has seen. Off by default. */
  readonly users: CacheStore<User<Client>>
  /** Roles, which permission checks need. On by default. */
  readonly roles: CacheStore<Role<Client>>
  /**
   * Guild members, grouped by guild. Off by default.
   *
   * @remarks
   * Seeded from `GUILD_CREATE` and then kept current by the member dispatches. How much the
   * seed contains is Discord's decision and not an intuitive one: measured live, a guild well
   * under `large_threshold` sends **only the bot** when the connection has `GuildMembers` but
   * not `GuildPresences`, and sends every member once `GuildPresences` is added. Discord
   * builds that list from the presence set. Switching this scope on and finding one member
   * per guild is that, not a cache fault; the full list needs a member request, which is
   * `client.fetchMembers()`.
   */
  readonly members: CacheStore<GuildMember<Client>>
  /** Messages, grouped by channel. Off by default. */
  readonly messages: CacheStore<Message<Client>>

  /**
   * @param options - What the consumer asked for.
   */
  constructor(options: CacheOptions<Client> = {}) {
    const build = <S extends CachedScope>(scope: S): CacheStore<CacheValue<S, Client>> => {
      const keys = CacheKeys[scope] as {
        keyOf: (value: CacheValue<S, Client>) => string
        groupKeyOf?: (value: CacheValue<S, Client>) => string | undefined
      }

      return new CacheStore<CacheValue<S, Client>>({
        scope,
        policy: resolveCachePolicy<CacheValue<S, Client>>(
          scope,
          options[scope] as CacheOption<CacheValue<S, Client>> | undefined,
          DefaultCacheOptions[scope] as CacheOption<CacheValue<S, Client>>,
        ),
        keyOf: keys.keyOf,
        ...(keys.groupKeyOf === undefined ? {} : { groupKeyOf: keys.groupKeyOf }),
        ...(options.adapter === undefined ? {} : { adapter: options.adapter }),
        ...(options.now === undefined ? {} : { now: options.now }),
      })
    }

    this.guilds = build(CacheScope.Guilds)
    this.users = build(CacheScope.Users)
    this.roles = build(CacheScope.Roles)
    this.members = build(CacheScope.Members)
    this.messages = build(CacheScope.Messages)
  }

  /** Every store, for operations that apply to all of them. */
  get stores(): readonly AnyCacheStore[] {
    return [this.guilds, this.users, this.roles, this.members, this.messages]
  }

  /**
   * Drops expired entries from every scope.
   *
   * @param now - The current epoch millisecond.
   * @returns How many entries were dropped in total.
   */
  sweep(now: number = Date.now()): number {
    let dropped = 0
    for (const store of this.stores) dropped += store.sweep(now)
    return dropped
  }

  /**
   * Drops everything from every scope.
   *
   * @remarks
   * Used on a fresh identify, where the session that produced the cached state is gone. A
   * resume does not clear: the session survived, so the state is still current.
   */
  clear(): void {
    for (const store of this.stores) store.clear()
  }

  /**
   * A member, by the two IDs that key it.
   *
   * @param guildId - The guild.
   * @param userId - The user.
   * @returns The member, if cached.
   *
   * @remarks
   * A named accessor because the composite key is an implementation detail nobody should
   * have to reproduce at a call site, and reproducing it wrongly fails silently as a miss.
   */
  member(guildId: Snowflake, userId: Snowflake): GuildMember<Client> | undefined {
    return this.members.get(guildUserKey(guildId, userId))
  }
}
