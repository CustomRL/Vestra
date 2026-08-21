import type { Snowflake } from '@vestra/types'
import type { CacheAdapterFactory } from './CacheAdapter.js'
import { guildUserKey } from './CacheKeys.js'
import { resolveCachePolicy, type CacheOption } from './CachePolicy.js'
import { CacheScope } from './CacheScopes.js'
import { CacheStore } from './CacheStore.js'
import type { Channel } from '../structures/channels/Channel.js'
import type { ThreadChannel } from '../structures/channels/ThreadChannel.js'
import type { Guild } from '../structures/Guild.js'
import type { Emoji } from '../structures/Emoji.js'
import type { Presence } from '../structures/Presence.js'
import type { Sticker } from '../structures/Sticker.js'
import type { VoiceState } from '../structures/VoiceState.js'
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
 * Every scope {@link CacheScope} declares now has an entry here, a row in {@link CacheKeys}
 * and at least one handler that writes to it — `packages/core/test/cache-coverage.test.ts`
 * fails naming any scope where that stops being true. Adding a scope is a line here and a row
 * there, not a change to anything below.
 */
export interface CacheValueMap<Client> {
  /** Guilds, keyed by guild ID. */
  guilds: Guild<Client>
  /** Guild and direct-message channels, keyed by channel ID. Never threads. */
  channels: Channel<Client>
  /** Threads, keyed by channel ID. */
  threads: ThreadChannel<Client>
  /** Users, keyed by user ID. */
  users: User<Client>
  /** Roles, keyed by role ID. */
  roles: Role<Client>
  /** Guild members, keyed by `guildId:userId`. */
  members: GuildMember<Client>
  /** Messages, keyed by message ID. */
  messages: Message<Client>
  /** Custom emojis, keyed by emoji ID. */
  emojis: Emoji<Client>
  /** Guild stickers, keyed by sticker ID. */
  stickers: Sticker<Client>
  /** Presences, keyed by `guildId:userId`. */
  presences: Presence<Client>
  /** Voice states, keyed by `guildId:userId`. */
  voiceStates: VoiceState<Client>
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
  channels: {
    keyOf: (value: Channel) => value.id,
    // A DM has no guild, so it is left ungrouped rather than filed under a made-up key.
    // `group()` on the index skips what it was never told about, so this costs nothing.
    groupKeyOf: (value: Channel) => (value.isGuildBased() ? value.guildId : undefined),
  },
  threads: {
    keyOf: (value: ThreadChannel) => value.id,
    // Grouped by the channel a thread hangs off, not by its guild: the common question is
    // "which threads are in this forum", and the guild is one hop further up.
    groupKeyOf: (value: ThreadChannel) => value.parentId ?? undefined,
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
  emojis: {
    keyOf: (value: Emoji) => value.id,
    groupKeyOf: (value: Emoji) => value.guildId,
  },
  stickers: {
    keyOf: (value: Sticker) => value.id,
    // A standard sticker belongs to a pack rather than a guild, so it is left ungrouped
    // rather than filed under a made-up key.
    groupKeyOf: (value: Sticker) => value.guildId,
  },
  presences: {
    keyOf: (value: Presence) => guildUserKey(value.guildId, value.userId),
    groupKeyOf: (value: Presence) => value.guildId,
  },
  voiceStates: {
    keyOf: (value: VoiceState) => guildUserKey(value.guildId, value.userId),
    groupKeyOf: (value: VoiceState) => value.guildId,
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
 * ADR 4's position: cache what the client needs to function and nothing else. Everything here
 * is Vestra policy rather than protocol, and the four that are on are on for reasons worth
 * restating, because three of them are not in ADR 4.
 *
 * `guilds` is on because ADR 4 says so. `channels`, `roles` and `emojis` share one argument:
 * each is bounded per guild by Discord, each arrives free inside the `GUILD_CREATE` payload
 * the bot already receives, and each is needed to answer questions bots ask constantly —
 * permission computation is impossible offline without roles, and posting a guild's own emoji
 * needs its ID. Caching them costs nothing that was not already paid for.
 *
 * Everything else is off because it is unbounded in exactly the way ADR 4 exists to prevent.
 * `users` grows with every person the bot has ever seen speak; `threads` and `messages` grow
 * without limit within a single guild; `presences` is the largest of all, at one entry per
 * membership rather than per user.
 */
export const DefaultCacheOptions: Record<CachedScope, CacheOption<never>> = {
  guilds: true,
  emojis: true,
  stickers: false,
  presences: false,
  voiceStates: false,
  channels: true,
  threads: false,
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
  /** Guild and DM channels, grouped by guild. On by default, per ADR 4. */
  readonly channels: CacheStore<Channel<Client>>
  /**
   * Threads, grouped by the channel they hang off. Off by default.
   *
   * @remarks
   * Split from `channels` because the bound is far worse: a guild has a fixed, small number
   * of channels and an unbounded number of threads, every one of which is a channel object.
   * One shared scope would mean a `max` that is either useless for channels or ruinous for
   * threads.
   */
  readonly threads: CacheStore<ThreadChannel<Client>>
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
  /**
   * Custom emojis, grouped by guild. On by default.
   *
   * @remarks
   * On for the same reason `roles` is, and ADR 4 does not list either: a bot that posts a
   * guild's own emoji needs the ID, the set is small and bounded, and the alternative is a
   * REST call to learn something every `GUILD_CREATE` already carried.
   */
  readonly emojis: CacheStore<Emoji<Client>>
  /**
   * Guild stickers, grouped by guild. Off by default.
   *
   * @remarks
   * Off where `emojis` is on, and the asymmetry is deliberate: a sticker is a much rarer thing
   * for a bot to send, and the payload is several times larger.
   */
  readonly stickers: CacheStore<Sticker<Client>>
  /**
   * Presences, grouped by guild. Off by default, and the most expensive scope there is.
   *
   * @remarks
   * One entry per *membership*, not per user: a user in five guilds the bot shares produces
   * five presences, each with its own activity list. On a large bot this is the scope that
   * decides the memory footprint, which is why ADR 4 has it off and why `max` and a `filter`
   * are worth reaching for before switching it on.
   */
  readonly presences: CacheStore<Presence<Client>>
  /**
   * Voice states, grouped by guild. Off by default.
   *
   * @remarks
   * Off despite being small and bounded — at most one entry per connected member — because
   * ADR 4's rule is that a scope earns being on by being needed by most bots, and most bots
   * never look at voice. A bot that does turns it on and gets an accurate picture, since
   * Discord seeds the whole set on `GUILD_CREATE`.
   */
  readonly voiceStates: CacheStore<VoiceState<Client>>
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
    this.emojis = build(CacheScope.Emojis)
    this.stickers = build(CacheScope.Stickers)
    this.presences = build(CacheScope.Presences)
    this.voiceStates = build(CacheScope.VoiceStates)
    this.channels = build(CacheScope.Channels)
    this.threads = build(CacheScope.Threads)
    this.users = build(CacheScope.Users)
    this.roles = build(CacheScope.Roles)
    this.members = build(CacheScope.Members)
    this.messages = build(CacheScope.Messages)
  }

  /** Every store, for operations that apply to all of them. */
  get stores(): readonly AnyCacheStore[] {
    return [
      this.guilds,
      this.channels,
      this.threads,
      this.users,
      this.roles,
      this.members,
      this.emojis,
      this.stickers,
      this.presences,
      this.voiceStates,
      this.messages,
    ]
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

  /**
   * A voice state by its two-part key.
   *
   * @param guildId - The guild.
   * @param userId - The user.
   * @returns The cached state, or `undefined`.
   *
   * @remarks
   * Exists for the same reason {@link CacheRegistry.member} does: the key is composite, and
   * making every caller remember the separator is how two spellings of one key appear.
   */
  voiceState(guildId: Snowflake, userId: Snowflake): VoiceState<Client> | undefined {
    return this.voiceStates.get(guildUserKey(guildId, userId))
  }

  /**
   * A presence by its two-part key.
   *
   * @param guildId - The guild.
   * @param userId - The user.
   * @returns The cached presence, or `undefined`.
   */
  presence(guildId: Snowflake, userId: Snowflake): Presence<Client> | undefined {
    return this.presences.get(guildUserKey(guildId, userId))
  }
}
