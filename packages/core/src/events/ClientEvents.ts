import type { GatewayDispatchPayload, GatewayReadyDispatchData, Snowflake } from '@vestra/types'
import type { ClientUser } from '../structures/ClientUser.js'
import type { Channel } from '../structures/channels/Channel.js'
import type { ThreadChannel } from '../structures/channels/ThreadChannel.js'
import type { Guild } from '../structures/Guild.js'
import type { GuildMember } from '../structures/GuildMember.js'
import type { Message } from '../structures/Message.js'
import type { Role } from '../structures/Role.js'
import type { User } from '../structures/User.js'

/**
 * What the client emits, and what each event carries.
 *
 * @remarks
 * **Hand-written rather than derived from `GatewayDispatchEvents`.** A mechanical
 * transform — uncapitalise, camelCase — cannot express the cases that matter: one gateway
 * event can produce two client events, and an event whose payload is upgraded from a raw
 * type to a structure would change its own signature. `packages/core/test/naming.test.ts`
 * guards the mapping instead, so the drift the transform was protecting against is still
 * caught without the type-level cleverness.
 *
 * **Only handled events appear here.** An event with no handler emits nothing rather than
 * emitting its raw payload under a derived name. Emitting the raw form would mean that
 * adding a handler later changes the argument from `APIEntitlement` to `Entitlement` — a
 * breaking change for an event nobody asked for. Emitting nothing makes adding a handler
 * purely additive. Everything unhandled is still reachable through {@link ClientEvents.raw}.
 */
export interface ClientEvents<Client = unknown> {
  /**
   * The client is connected and its identity is known.
   *
   * @remarks
   * Fired once per client, not once per shard, and **not** the same thing as every guild
   * having arrived — the guild stream is still draining when this fires. An event for that
   * belongs with the readiness tracker.
   */
  ready: [user: ClientUser<Client>]

  /**
   * A guild became available, or the bot joined one.
   *
   * @remarks
   * Fires for every guild during the startup stream as well as on an actual join. The
   * payload is identical either way, so a bot that treats this as "joined a new server"
   * will greet every guild it is already in on every reconnect.
   */
  guildCreate: [guild: Guild<Client>]
  /** A guild was updated. */
  guildUpdate: [guild: Guild<Client>]
  /** The bot was removed from a guild, or it was deleted. */
  guildDelete: [guildId: Snowflake]
  /**
   * A guild went unavailable during a Discord outage.
   *
   * @remarks
   * Distinct from {@link ClientEvents.guildDelete} because the guild is coming back. The
   * cache keeps it; treating an outage as a departure empties the cache during every
   * incident and refills it minutes later.
   */
  guildUnavailable: [guildId: Snowflake]

  /** A channel was created. */
  channelCreate: [channel: Channel<Client>]
  /** A channel was updated. */
  channelUpdate: [channel: Channel<Client>]
  /**
   * A channel was deleted.
   *
   * @remarks
   * Carries the channel rather than its ID, unlike {@link ClientEvents.messageDelete}. The
   * difference is what a listener can do afterwards: a deleted message can at least be named
   * by ID, but nothing resolves a deleted channel — no REST route returns one — so an ID here
   * would be permanently opaque. The cost is that an uncached channel emits nothing.
   */
  channelDelete: [channel: Channel<Client>]

  /** A thread was created, or the bot gained access to one. */
  threadCreate: [thread: ThreadChannel<Client>]
  /** A thread was updated. */
  threadUpdate: [thread: ThreadChannel<Client>]
  /** A thread was deleted, or the bot lost access to it. */
  threadDelete: [thread: ThreadChannel<Client>]

  /** A message was sent. */
  messageCreate: [message: Message<Client>]
  /**
   * A message was edited.
   *
   * @remarks
   * Carries the message as it now is. There is no "old message" argument: producing one
   * needs a clone, and a partial update means most of the old message was never known.
   */
  messageUpdate: [message: Message<Client>]
  /** A message was deleted. Carries IDs, because the message itself may never have been cached. */
  messageDelete: [messageId: Snowflake, channelId: Snowflake, guildId: Snowflake | undefined]
  /**
   * Several messages were deleted at once.
   *
   * @remarks
   * Fires once for the batch rather than once per message. A moderator clearing a hundred
   * messages would otherwise fire a hundred delete listeners, and a bot that logs deletions
   * gets rate-limited by its own audit channel.
   */
  messageDeleteBulk: [
    messageIds: readonly Snowflake[],
    channelId: Snowflake,
    guildId: Snowflake | undefined,
  ]

  /**
   * A channel's pinned messages changed.
   *
   * @remarks
   * Discord does not say which message was pinned or unpinned, only that something did — so
   * neither does this. The timestamp is `null` when the channel now has nothing pinned.
   */
  channelPinsUpdate: [
    channelId: Snowflake,
    guildId: Snowflake | undefined,
    lastPinTimestamp: string | null,
  ]

  /**
   * Somebody started typing.
   *
   * @remarks
   * The timestamp is in milliseconds, converted from the seconds Discord sends, so this is
   * not the one event in the library with a different time unit. There is no matching
   * "stopped typing": Discord sends none, and inventing one from a timer would be the library
   * guessing.
   */
  typingStart: [
    channelId: Snowflake,
    userId: Snowflake,
    guildId: Snowflake | undefined,
    startedTimestamp: number,
  ]

  /** A member joined a guild. */
  guildMemberAdd: [member: GuildMember<Client>]
  /** A member was updated. */
  guildMemberUpdate: [member: GuildMember<Client>]
  /** A member left or was removed. */
  guildMemberRemove: [guildId: Snowflake, user: User<Client>]

  /** A role was created. */
  roleCreate: [role: Role<Client>, guildId: Snowflake]
  /** A role was updated. */
  roleUpdate: [role: Role<Client>, guildId: Snowflake]
  /** A role was deleted. */
  roleDelete: [roleId: Snowflake, guildId: Snowflake]

  /** The current user was updated. */
  userUpdate: [user: ClientUser<Client>]

  /**
   * Every dispatch, before anything is done with it.
   *
   * @remarks
   * The escape hatch, and the only place an unhandled event surfaces. Carries the payload
   * exactly as it arrived, plus whether it is a replay after a resume — which the typed
   * events deliberately do not, because threading it through every signature would put a
   * flag nobody reads on all of them.
   */
  raw: [payload: GatewayDispatchPayload, shardId: number, replayed: boolean]

  /**
   * A handler threw.
   *
   * @remarks
   * A handler failing must not take the connection with it, so the router contains the
   * throw and reports it here. Node's `EventEmitter` throws on an unhandled `'error'`, and
   * Vestra does not deviate: a client whose errors are silently swallowed is worse than one
   * that stops.
   */
  error: [error: Error, context: { event: string; shardId: number }]
}

/** Any event the client can emit. */
export type ClientEventName = keyof ClientEvents

/**
 * The READY payload, kept out of the public event so it can change.
 *
 * @internal
 */
export type ReadyData = GatewayReadyDispatchData
