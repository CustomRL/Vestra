import type { GatewayDispatchPayload, GatewayReadyDispatchData, Snowflake } from '@vestra/types'
import type { ClientUser } from '../structures/ClientUser.js'
import type { AuditLogEntry } from '../structures/AuditLogEntry.js'
import type {
  AutoModerationActionExecution,
  AutoModerationRule,
} from '../structures/AutoModerationRule.js'
import type { Channel } from '../structures/channels/Channel.js'
import type { ThreadChannel } from '../structures/channels/ThreadChannel.js'
import type { Emoji } from '../structures/Emoji.js'
import type { Guild } from '../structures/Guild.js'
import type { GuildScheduledEvent } from '../structures/GuildScheduledEvent.js'
import type { Interaction } from '../structures/Interaction.js'
import type { GuildMember } from '../structures/GuildMember.js'
import type { Invite } from '../structures/Invite.js'
import type { Message } from '../structures/Message.js'
import type { Presence } from '../structures/Presence.js'
import type { ReactionEmoji } from '../structures/ReactionEmoji.js'
import type { Role } from '../structures/Role.js'
import type { StageInstance } from '../structures/StageInstance.js'
import type { Sticker } from '../structures/Sticker.js'
import type { User } from '../structures/User.js'
import type { VoiceState } from '../structures/VoiceState.js'

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
  /**
   * The bot regained access to a guild's active threads.
   *
   * @remarks
   * Fires on reconnect and when the bot gains access to a channel. Carries the threads the
   * sync covered, which is not necessarily every thread in the guild — Discord scopes the
   * payload by parent channel.
   */
  threadListSync: [guildId: Snowflake, threads: ThreadChannel<Client>[]]

  /**
   * Who is in a thread changed.
   *
   * @remarks
   * Carries user IDs rather than thread members. `ThreadMember` is not modelled, and an event
   * shaped around the raw payload would change shape the day it is — so it carries the part
   * that will not: the IDs, which are what `cache.users` and `guild.members` are keyed by.
   *
   * `added` is empty unless the bot can see the members Discord added, which is Discord's
   * rule and not a Vestra one. `thread.memberCount` is the absolute figure either way.
   */
  threadMembersUpdate: [
    thread: ThreadChannel<Client>,
    added: readonly Snowflake[],
    removed: readonly Snowflake[],
  ]

  /**
   * Somebody reacted to a message.
   *
   * @remarks
   * Carries IDs and an emoji rather than a `Message`. Messages are off by default, so a
   * resolved message would be `undefined` for almost every reaction, and an event whose main
   * argument is usually absent is worse than one that hands over what it actually knows.
   */
  messageReactionAdd: [
    emoji: ReactionEmoji,
    messageId: Snowflake,
    channelId: Snowflake,
    userId: Snowflake,
    guildId: Snowflake | undefined,
  ]
  /** Somebody removed their own reaction. */
  messageReactionRemove: [
    emoji: ReactionEmoji,
    messageId: Snowflake,
    channelId: Snowflake,
    userId: Snowflake,
    guildId: Snowflake | undefined,
  ]
  /**
   * Every reaction on a message was removed at once.
   *
   * @remarks
   * No emoji, because Discord does not say which were removed — the answer is all of them.
   */
  messageReactionRemoveAll: [
    messageId: Snowflake,
    channelId: Snowflake,
    guildId: Snowflake | undefined,
  ]
  /**
   * Every reaction of one emoji was removed from a message.
   *
   * @remarks
   * A moderator clearing everybody's, which is why there is no `userId` — distinct from
   * {@link ClientEvents.messageReactionRemove}, which is one person un-reacting.
   */
  messageReactionRemoveEmoji: [
    emoji: ReactionEmoji,
    messageId: Snowflake,
    channelId: Snowflake,
    guildId: Snowflake | undefined,
  ]

  /** A scheduled event was created. */
  guildScheduledEventCreate: [scheduledEvent: GuildScheduledEvent<Client>]
  /** A scheduled event was updated. */
  guildScheduledEventUpdate: [scheduledEvent: GuildScheduledEvent<Client>]
  /**
   * A scheduled event was deleted.
   *
   * @remarks
   * Carries the whole event, because the dispatch does.
   */
  guildScheduledEventDelete: [scheduledEvent: GuildScheduledEvent<Client>]
  /**
   * Somebody subscribed to a scheduled event.
   *
   * @remarks
   * IDs only, because the dispatch carries only IDs. Deliberately not accumulated into a
   * subscriber count anywhere: a resume replays a contiguous suffix, so replayed additions
   * would double-count — and a derived total is exactly the kind of state the replay guard
   * exists to keep out of the cache.
   */
  guildScheduledEventUserAdd: [
    guildScheduledEventId: Snowflake,
    userId: Snowflake,
    guildId: Snowflake,
  ]
  /** Somebody unsubscribed from a scheduled event. */
  guildScheduledEventUserRemove: [
    guildScheduledEventId: Snowflake,
    userId: Snowflake,
    guildId: Snowflake,
  ]

  /**
   * An interaction was received.
   *
   * @remarks
   * **Three seconds.** A listener that has not responded by then leaves the user looking at
   * "this interaction failed" and the token spent. Anything slower defers first — see
   * {@link Interaction.deferReply} — which buys fifteen minutes.
   */
  interactionCreate: [interaction: Interaction<Client>]

  /**
   * An entry was written to a guild's audit log.
   *
   * @remarks
   * Carries the entry alone, which names its own guild. The entry gives IDs rather than
   * resolved users: the payload has no nested user object, so anything else would be invented.
   */
  guildAuditLogEntryCreate: [entry: AuditLogEntry<Client>]

  /** An Auto Moderation rule was created. */
  autoModerationRuleCreate: [rule: AutoModerationRule<Client>]
  /** An Auto Moderation rule was updated. */
  autoModerationRuleUpdate: [rule: AutoModerationRule<Client>]
  /**
   * An Auto Moderation rule was deleted.
   *
   * @remarks
   * Carries the whole rule, not its ID, because the dispatch does — unlike the message and
   * channel deletes, which have to hand back what they can.
   */
  autoModerationRuleDelete: [rule: AutoModerationRule<Client>]
  /**
   * An Auto Moderation rule matched, and one of its actions ran.
   *
   * @remarks
   * Not a rule: this is one action of one rule firing, with its own payload naming the user,
   * the channel, the matched keyword and the content that triggered it.
   */
  autoModerationActionExecution: [execution: AutoModerationActionExecution<Client>]

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

  /**
   * A guild's emojis changed.
   *
   * @remarks
   * Discord sends the whole set rather than saying what changed, so `emojis` is the guild's
   * complete list. `removed` is what the library dropped from cache as a result — there is no
   * "previous" list, because producing an honest one would mean cloning every surviving emoji
   * on every rename.
   */
  guildEmojisUpdate: [guildId: Snowflake, emojis: Emoji<Client>[], removed: Emoji<Client>[]]
  /** A guild's stickers changed. The same whole-set shape as {@link ClientEvents.guildEmojisUpdate}. */
  guildStickersUpdate: [guildId: Snowflake, stickers: Sticker<Client>[], removed: Sticker<Client>[]]

  /**
   * Somebody was banned from a guild.
   *
   * @remarks
   * Carries no reason and no moderator: Discord puts both in the audit log rather than in this
   * dispatch. `GUILD_MEMBER_REMOVE` fires alongside it and does the cache eviction.
   */
  guildBanAdd: [guildId: Snowflake, user: User<Client>]
  /** A ban was lifted. */
  guildBanRemove: [guildId: Snowflake, user: User<Client>]

  /** A role was created. */
  roleCreate: [role: Role<Client>, guildId: Snowflake]
  /** A role was updated. */
  roleUpdate: [role: Role<Client>, guildId: Snowflake]
  /** A role was deleted. */
  roleDelete: [roleId: Snowflake, guildId: Snowflake]

  /**
   * Somebody's status or activity changed.
   *
   * @remarks
   * The highest-volume event Discord sends. A listener here runs for every status change of
   * every member of every guild the bot is in, so anything expensive in it is expensive at
   * that rate.
   */
  presenceUpdate: [presence: Presence<Client>]

  /**
   * Somebody joined, left or changed their voice state.
   *
   * @remarks
   * **The IDs come first because they are the only arguments always present.** `voiceStates`
   * is off by default, so on most clients a departure has no cached state to report and the
   * pair alone would be `(undefined, undefined)` — an event saying somebody left without
   * saying who. The same reasoning as {@link ClientEvents.messageDelete}, which carries IDs
   * for exactly this reason.
   *
   * `previous` and `current` are the states where they are known: `previous` is `undefined` on
   * a join or when the scope is off, `current` is `undefined` on a leave. This is the one
   * place the library hands a listener an "old" object — see {@link VoiceState.clone} for why
   * the usual objection does not apply.
   */
  voiceStateUpdate: [
    guildId: Snowflake,
    userId: Snowflake,
    previous: VoiceState<Client> | undefined,
    current: VoiceState<Client> | undefined,
  ]

  /**
   * An invite was created.
   *
   * @remarks
   * Needs the `GuildInvites` intent, and fires only for invites made while the bot is
   * connected — so the invites a bot learns of this way are never the guild's whole set.
   */
  inviteCreate: [invite: Invite<Client>]
  /**
   * An invite was deleted, expired, or ran out of uses.
   *
   * @remarks
   * Carries the code rather than an {@link Invite}, because the dispatch carries nothing else
   * and nothing is cached to fill the gap in — the same reasoning as
   * {@link ClientEvents.messageDelete}, and the opposite outcome to
   * {@link ClientEvents.channelDelete}, which has a cached channel to hand over. Discord does
   * not say which of the three things happened, and an invite exhausted by its last use
   * produces no event at all.
   */
  inviteDelete: [code: string, channelId: Snowflake, guildId: Snowflake | undefined]

  /** A stage went live. */
  stageInstanceCreate: [stageInstance: StageInstance<Client>]
  /** A live stage's topic or privacy level changed. */
  stageInstanceUpdate: [stageInstance: StageInstance<Client>]
  /**
   * A stage ended.
   *
   * @remarks
   * Carries the instance, unlike {@link ClientEvents.inviteDelete}, because
   * `STAGE_INSTANCE_DELETE` carries the whole object rather than a stub. Fires when Discord
   * closes a stage that has had no speakers as well as when somebody ends it.
   */
  stageInstanceDelete: [stageInstance: StageInstance<Client>]

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
   * A dispatch was discarded because a serial-mode queue was full.
   *
   * @remarks
   * Only fires when `serialDispatch` is on; the default path has no queue and drops
   * nothing. The discarded payload is the **newest**, not the oldest — a `MESSAGE_DELETE`
   * arriving after its `MESSAGE_CREATE` was thrown away is worse than a contiguous gap.
   *
   * Carries the shard, unlike the spec's original two-argument form. There is one queue per
   * shard, so an event that cannot say which one is backed up cannot be acted on: the
   * consumer's answer is either to speed up a listener on that shard or to raise
   * `maxQueued`, and both need the id. {@link ClientEvents.raw} carries it for the same
   * reason.
   */
  dispatchDropped: [payload: GatewayDispatchPayload, shardId: number, depth: number]

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
