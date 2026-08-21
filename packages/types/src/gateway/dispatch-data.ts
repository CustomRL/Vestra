/**
 * The payload shape of each gateway dispatch event.
 *
 * @remarks
 * Split from `dispatch.ts` so that the event map stays readable on one screen. Shapes live
 * here when the event's payload is not simply an API resource — a `THREAD_DELETE` carrying
 * four fields rather than a channel, or a reaction event that exists only on the wire.
 * Where an event does carry a resource unchanged, the map points straight at the `API`
 * type and nothing is added here.
 */

import type { APIAuditLogEntry } from '../payloads/audit-log.js'
import type { APIChannel, APIThreadChannel } from '../payloads/channel.js'
import type { APIEmoji, APIPartialEmoji } from '../payloads/emoji.js'
import type { APIGuild, APIUnavailableGuild } from '../payloads/guild.js'
import type { APIGuildMember, APIVoiceState } from '../payloads/member.js'
import type { APIIntegration } from '../payloads/integration.js'
import type { APIMessage } from '../payloads/message.js'
import type { APIStageInstance } from '../payloads/stage-instance.js'
import type { APIGuildScheduledEvent } from '../payloads/scheduled-event.js'
import type { APIPresenceUpdate } from '../payloads/presence.js'
import type { APIRole } from '../payloads/role.js'
import type { APISoundboardSound } from '../payloads/soundboard.js'
import type { APISticker } from '../payloads/sticker.js'
import type { APIThreadMember } from '../payloads/thread.js'
import type { APIUser } from '../payloads/user.js'
import type { ChannelType } from '../enums/channel.js'
import type { ISO8601Timestamp, Snowflake } from '../globals.js'
import type { InviteTargetType } from '../enums/guild.js'
import type { ReactionType } from '../enums/message.js'

/**
 * A guild as delivered by `GUILD_CREATE`.
 *
 * @remarks
 * Either a full guild, or an unavailable stub during an outage. Narrow before use:
 *
 * ```ts
 * if ('unavailable' in data && data.unavailable === true) {
 *   // outage; the guild is not gone
 * }
 * ```
 *
 * Distinguishing the two is the difference between dropping a guild from cache and
 * waiting for it to come back, and it is what lets a client tell "startup finished" from
 * "still streaming".
 */
export type GatewayGuildCreateDispatchData =
  (APIGuild & GatewayGuildCreateExtraFields) | APIUnavailableGuild

/**
 * Fields present on a guild only when it arrives through `GUILD_CREATE`.
 */
export interface GatewayGuildCreateExtraFields {
  /** When the current user joined the guild. */
  joined_at: ISO8601Timestamp
  /**
   * Whether the guild is considered large.
   *
   * @remarks
   * Large guilds omit offline members from `members`, which is the main lever on memory
   * during startup. The threshold is `large_threshold` from the identify payload.
   */
  large: boolean
  /** Present and `true` only while the guild is unavailable. */
  unavailable?: boolean
  /** The total member count, regardless of how many are included in `members`. */
  member_count: number
  /** Voice states of connected members, without their `guild_id`. */
  voice_states: Omit<APIVoiceState, 'guild_id'>[]
  /** Members of the guild, subject to `large` and the `GuildMembers` intent. */
  members: APIGuildMember[]
  /** The guild's channels. */
  channels: APIChannel[]
  /** Threads the current user can see. */
  threads: APIThreadChannel[]
  /**
   * Presences of members, as partial presence updates.
   *
   * @remarks
   * `guild_id` is omitted because the guild is already known from the payload these are
   * nested in. Was typed `unknown[]` while presences went unmodelled; they are modelled now,
   * and leaving it loose would make the one bulk source of presences the only one a consumer
   * has to narrow by hand.
   */
  presences: Omit<APIPresenceUpdate, 'guild_id'>[]
  /** Stage instances in the guild. */
  stage_instances: APIStageInstance[]
  /** Scheduled events in the guild. */
  guild_scheduled_events: APIGuildScheduledEvent[]
  /** Soundboard sounds in the guild. */
  soundboard_sounds: APISoundboardSound[]
}

/**
 * A page of members returned for a request sent with opcode 8.
 */
export interface GatewayGuildMembersChunkDispatchData {
  /** The guild the members belong to. */
  guild_id: Snowflake
  /** Up to 1000 members. */
  members: APIGuildMember[]
  /** This chunk's index, from `0`. */
  chunk_index: number
  /**
   * How many chunks the response has in total.
   *
   * @remarks
   * A request is complete when `chunk_index === chunk_count - 1`, never when a running
   * count of received chunks reaches `chunk_count` — chunks from concurrent requests
   * interleave on one socket.
   */
  chunk_count: number
  /** IDs from `user_ids` that matched no member. */
  not_found?: Snowflake[]
  /**
   * Presences of the returned members, if requested.
   *
   * @remarks
   * `guild_id` is omitted for the same reason it is on the `GUILD_CREATE` presences: the
   * guild is already named by the payload these arrive in.
   */
  presences?: Omit<APIPresenceUpdate, 'guild_id'>[]
  /** The `nonce` from the request, which is the only way to correlate chunks. */
  nonce?: string
}

/**
 * Notification that a gateway command was rejected for exceeding a rate limit.
 */
export interface GatewayRateLimitedDispatchData {
  /** The opcode of the command that was rejected. */
  opcode: number
  /**
   * How long to wait before retrying, in **seconds**.
   *
   * @remarks
   * Seconds, and fractional. Treating it as milliseconds turns a 30 second backoff into
   * 30 milliseconds and reproduces the limit immediately.
   */
  retry_after: number
  /** Which request was rejected. */
  meta: {
    /** The guild the rejected request concerned. */
    guild_id?: Snowflake
    /** The `nonce` of the rejected request, for correlation. */
    nonce?: string
  }
}

/**
 * The initial state sent after identifying.
 */
export interface GatewayReadyDispatchData {
  /** The API version. */
  v: number
  /** The bot user. */
  user: APIUser
  /**
   * The guilds the bot is in, all unavailable at this point.
   *
   * @remarks
   * Each is followed by a `GUILD_CREATE` as Discord streams the real data. A client that
   * treats `READY` as "startup finished" will see an empty cache; the meaningful signal is
   * having received a `GUILD_CREATE` for every ID listed here.
   */
  guilds: APIUnavailableGuild[]
  /** The session ID, required to resume. */
  session_id: string
  /**
   * The URL to use when resuming.
   *
   * @remarks
   * Must be used in place of the URL from `GET /gateway/bot` when resuming — resuming
   * against the wrong host produces an invalid session.
   */
  resume_gateway_url: string
  /** The shard index and count, if the connection identified with a shard. */
  shard?: [shardId: number, shardCount: number]
  /** The partial application object. */
  application: { id: Snowflake; flags: number }
}

/**
 * A message as delivered by `MESSAGE_CREATE`.
 */
export interface GatewayMessageCreateDispatchData extends Omit<APIMessage, 'mentions'> {
  /** The guild the message was sent in. */
  guild_id?: Snowflake
  /** The author's guild membership, without the nested user. */
  member?: Omit<APIGuildMember, 'user'>
  /** Mentioned users, each carrying their guild membership. */
  mentions: (APIUser & { member?: Omit<APIGuildMember, 'user'> })[]
}

/**
 * A message as delivered by `MESSAGE_UPDATE`.
 *
 * @remarks
 * Only `id` and `channel_id` are guaranteed. Discord sends whichever fields changed, so
 * every other field is optional — an update that only adds an embed will not carry
 * `content` at all. Treating this as a full message is a common source of bugs.
 */
export type GatewayMessageUpdateDispatchData = Partial<GatewayMessageCreateDispatchData> &
  Pick<APIMessage, 'channel_id' | 'id'>

/**
 * The data of a `MESSAGE_DELETE`.
 */
export interface GatewayMessageDeleteDispatchData {
  /** The deleted message's ID. */
  id: Snowflake
  /** The channel it was in. */
  channel_id: Snowflake
  /** The guild it was in. */
  guild_id?: Snowflake
}

/**
 * The data of a `MESSAGE_DELETE_BULK`.
 */
export interface GatewayMessageDeleteBulkDispatchData {
  /** The deleted messages' IDs. */
  ids: Snowflake[]
  /** The channel they were in. */
  channel_id: Snowflake
  /** The guild they were in. */
  guild_id?: Snowflake
}

/**
 * The data of a `GUILD_MEMBER_ADD`.
 */
export interface GatewayGuildMemberAddDispatchData extends APIGuildMember {
  /** The guild the member joined. */
  guild_id: Snowflake
}

/**
 * The data of a `GUILD_MEMBER_UPDATE`.
 */
export interface GatewayGuildMemberUpdateDispatchData extends Partial<
  Omit<APIGuildMember, 'roles' | 'user'>
> {
  /** The guild the member is in. */
  guild_id: Snowflake
  /** The member's roles. */
  roles: Snowflake[]
  /** The user this member represents. */
  user: APIUser
}

/**
 * The data of a `GUILD_MEMBER_REMOVE`.
 */
export interface GatewayGuildMemberRemoveDispatchData {
  /** The guild the member left. */
  guild_id: Snowflake
  /** The user who left. */
  user: APIUser
}

/**
 * The data of a `GUILD_ROLE_CREATE` or `GUILD_ROLE_UPDATE`.
 */
export interface GatewayGuildRoleModifyDispatchData {
  /** The guild the role belongs to. */
  guild_id: Snowflake
  /** The role. */
  role: APIRole
}

/**
 * The data of a `GUILD_ROLE_DELETE`.
 */
export interface GatewayGuildRoleDeleteDispatchData {
  /** The guild the role belonged to. */
  guild_id: Snowflake
  /** The deleted role's ID. */
  role_id: Snowflake
}

/**
 * The data of a `TYPING_START`.
 */
export interface GatewayTypingStartDispatchData {
  /** The channel the user is typing in. */
  channel_id: Snowflake
  /** The guild the user is typing in. */
  guild_id?: Snowflake
  /** The user who started typing. */
  user_id: Snowflake
  /** When they started typing, as a Unix timestamp in seconds. */
  timestamp: number
  /** The typing user's guild membership. */
  member?: APIGuildMember
}

/**
 * A thread as delivered by `THREAD_CREATE`.
 *
 * @remarks
 * The event fires both when a thread is created and when the current user is added to an
 * existing one, and the two are told apart by the extra fields rather than by the event
 * name: `newly_created` marks the first, a `member` marks the second.
 */
export interface GatewayThreadCreateDispatchData extends APIThreadChannel {
  /** Present and `true` only when the thread was just created. */
  newly_created?: boolean
  /** The current user's membership, present when being added to an existing private thread. */
  member?: APIThreadMember
}

/**
 * The subset of a thread delivered by `THREAD_DELETE`.
 *
 * @remarks
 * Deliberately not the full channel. Discord sends only these four fields, so typing this
 * as `APIThreadChannel` would promise data that never arrives.
 */
export interface GatewayThreadDeleteDispatchData {
  /** The thread's ID. */
  id: Snowflake
  /** The guild the thread was in. */
  guild_id: Snowflake
  /** The channel the thread hung off. */
  parent_id: Snowflake
  /** The thread's channel type. */
  type: ChannelType
}

/**
 * The threads the current user can see, sent on gaining access to a channel.
 */
export interface GatewayThreadListSyncDispatchData {
  /** The guild being synced. */
  guild_id: Snowflake
  /**
   * The parent channels whose threads are being synced.
   *
   * @remarks
   * Absent means the entire guild was synced, so an empty `threads` array then means the
   * guild has no active threads — not that nothing was checked.
   */
  channel_ids?: Snowflake[]
  /** The active threads the current user can access. */
  threads: APIThreadChannel[]
  /** The current user's memberships for those threads. */
  members: APIThreadMember[]
}

/**
 * The current user's thread membership, with the guild it belongs to.
 */
export interface GatewayThreadMemberUpdateDispatchData extends APIThreadMember {
  /** The guild the thread is in. */
  guild_id: Snowflake
}

/**
 * A change to who is in a thread.
 */
export interface GatewayThreadMembersUpdateDispatchData {
  /** The thread's ID. */
  id: Snowflake
  /** The guild the thread is in. */
  guild_id: Snowflake
  /** How many members the thread has, capped at 50 by Discord. */
  member_count: number
  /** Members added, present only when the current user can see them. */
  added_members?: APIThreadMember[]
  /** The IDs of members removed. */
  removed_member_ids?: Snowflake[]
}

/**
 * A reaction added to a message.
 */
export interface GatewayMessageReactionAddDispatchData {
  /** The user who reacted. */
  user_id: Snowflake
  /** The channel the message is in. */
  channel_id: Snowflake
  /** The message reacted to. */
  message_id: Snowflake
  /** The guild, absent in a direct message. */
  guild_id?: Snowflake
  /** The reacting user's membership, present only in a guild. */
  member?: APIGuildMember
  /** The emoji used, as a partial. */
  emoji: APIPartialEmoji
  /** Who wrote the message being reacted to. */
  message_author_id?: Snowflake
  /** Whether this is a super-reaction. */
  burst: boolean
  /** Colours for the super-reaction animation, as `#rrggbb` strings. */
  burst_colors?: string[]
  /** Whether the reaction is ordinary or a super-reaction. */
  type: ReactionType
}

/**
 * A reaction removed from a message.
 */
export interface GatewayMessageReactionRemoveDispatchData {
  /** The user whose reaction was removed. */
  user_id: Snowflake
  /** The channel the message is in. */
  channel_id: Snowflake
  /** The message the reaction was on. */
  message_id: Snowflake
  /** The guild, absent in a direct message. */
  guild_id?: Snowflake
  /** The emoji removed, as a partial. */
  emoji: APIPartialEmoji
  /** Whether the removed reaction was a super-reaction. */
  burst: boolean
  /** Whether the reaction was ordinary or a super-reaction. */
  type: ReactionType
}

/**
 * Every reaction cleared from a message at once.
 */
export interface GatewayMessageReactionRemoveAllDispatchData {
  /** The channel the message is in. */
  channel_id: Snowflake
  /** The message cleared. */
  message_id: Snowflake
  /** The guild, absent in a direct message. */
  guild_id?: Snowflake
}

/**
 * Every reaction of one emoji cleared from a message.
 */
export interface GatewayMessageReactionRemoveEmojiDispatchData {
  /** The channel the message is in. */
  channel_id: Snowflake
  /** The guild, absent in a direct message. */
  guild_id?: Snowflake
  /** The message cleared. */
  message_id: Snowflake
  /** The emoji whose reactions were removed. */
  emoji: APIPartialEmoji
}

/**
 * A vote cast on, or withdrawn from, a poll.
 */
export interface GatewayMessagePollVoteDispatchData {
  /** The voting user. */
  user_id: Snowflake
  /** The channel the poll is in. */
  channel_id: Snowflake
  /** The message carrying the poll. */
  message_id: Snowflake
  /** The guild, absent in a direct message. */
  guild_id?: Snowflake
  /** Which answer was voted for. */
  answer_id: number
}

/**
 * A channel's pinned messages changed.
 */
export interface GatewayChannelPinsUpdateDispatchData {
  /** The guild, absent in a direct message. */
  guild_id?: Snowflake
  /** The channel whose pins changed. */
  channel_id: Snowflake
  /**
   * When the most recent pin was pinned.
   *
   * @remarks
   * Optional *and* nullable, and the two mean different things: absent means unchanged,
   * `null` means the channel now has no pinned messages at all.
   */
  last_pin_timestamp?: ISO8601Timestamp | null
}

/**
 * A user banned from or unbanned from a guild.
 */
export interface GatewayGuildBanDispatchData {
  /** The guild. */
  guild_id: Snowflake
  /** The user banned or unbanned. */
  user: APIUser
}

/**
 * A guild's emojis after a change.
 */
export interface GatewayGuildEmojisUpdateDispatchData {
  /** The guild. */
  guild_id: Snowflake
  /** The guild's emojis in full, not a delta. */
  emojis: APIEmoji[]
}

/**
 * A guild's stickers after a change.
 */
export interface GatewayGuildStickersUpdateDispatchData {
  /** The guild. */
  guild_id: Snowflake
  /** The guild's stickers in full, not a delta. */
  stickers: APISticker[]
}

/**
 * A guild's integrations changed.
 *
 * @remarks
 * Carries no detail of what changed — it is a signal to refetch.
 */
export interface GatewayGuildIntegrationsUpdateDispatchData {
  /** The guild. */
  guild_id: Snowflake
}

/**
 * A channel's webhooks changed.
 *
 * @remarks
 * Like the integrations event, a signal to refetch rather than a description of the change.
 */
export interface GatewayWebhooksUpdateDispatchData {
  /** The guild. */
  guild_id: Snowflake
  /** The channel whose webhooks changed. */
  channel_id: Snowflake
}

/**
 * An invite created.
 */
export interface GatewayInviteCreateDispatchData {
  /** The channel the invite is for. */
  channel_id: Snowflake
  /** The invite code, which is its unique identifier. */
  code: string
  /** When the invite was created. */
  created_at: ISO8601Timestamp
  /** The guild, absent for a group direct message invite. */
  guild_id?: Snowflake
  /** Who created the invite. */
  inviter?: APIUser
  /** How long the invite is good for in seconds, where `0` never expires. */
  max_age: number
  /** How many times it may be used, where `0` is unlimited. */
  max_uses: number
  /** What the invite points at, on a voice channel invite. */
  target_type?: InviteTargetType
  /** The user whose stream the invite points at. */
  target_user?: APIUser
  /**
   * The embedded application the invite launches.
   *
   * @remarks
   * `unknown` rather than a guess: this package does not model the application resource
   * yet, and naming a shape it cannot promise would be worse than making the consumer
   * narrow.
   */
  target_application?: unknown
  /** Whether the invite grants temporary membership. */
  temporary: boolean
  /** How many times it has been used, which is always `0` here. */
  uses: number
  /** When the invite expires, or `null` if it never does. */
  expires_at: ISO8601Timestamp | null
  /** Roles assigned to users who join through this invite. */
  role_ids?: Snowflake[]
}

/**
 * An invite deleted.
 */
export interface GatewayInviteDeleteDispatchData {
  /** The channel the invite was for. */
  channel_id: Snowflake
  /** The guild, absent for a group direct message invite. */
  guild_id?: Snowflake
  /** The invite code that was deleted. */
  code: string
}

/**
 * Where to connect for a guild's voice traffic.
 */
export interface GatewayVoiceServerUpdateDispatchData {
  /** The voice connection token. */
  token: string
  /** The guild the voice server serves. */
  guild_id: Snowflake
  /**
   * The voice server host.
   *
   * @remarks
   * Nullable, and `null` is not an error: it means the server is being reallocated, and a
   * client should wait for the next event rather than attempting to connect.
   */
  endpoint: string | null
}

/**
 * An integration as delivered by `INTEGRATION_CREATE` and `INTEGRATION_UPDATE`.
 *
 * @remarks
 * The gateway strips `user` from the integration object on these two events and adds a
 * `guild_id`. Reusing `APIIntegration` unchanged would therefore promise an attached user
 * that never arrives.
 */
export interface GatewayIntegrationCreateDispatchData extends Omit<APIIntegration, 'user'> {
  /** The guild the integration belongs to. */
  guild_id: Snowflake
}

/**
 * An integration removed from a guild.
 */
export interface GatewayIntegrationDeleteDispatchData {
  /** The integration that was deleted. */
  id: Snowflake
  /** The guild it belonged to. */
  guild_id: Snowflake
  /** The application behind it, on a Discord integration. */
  application_id?: Snowflake
}

/**
 * A user added to or removed from a guild scheduled event.
 */
export interface GatewayGuildScheduledEventUserDispatchData {
  /** The scheduled event. */
  guild_scheduled_event_id: Snowflake
  /** The user who subscribed or unsubscribed. */
  user_id: Snowflake
  /** The guild the event belongs to. */
  guild_id: Snowflake
}

/**
 * A guild's soundboard sounds after a change.
 */
export interface GatewayGuildSoundboardSoundsUpdateDispatchData {
  /** The guild's soundboard sounds in full, not a delta. */
  soundboard_sounds: APISoundboardSound[]
  /** The guild. */
  guild_id: Snowflake
}

/**
 * Soundboard sounds returned for the guilds that were asked about.
 */
export interface GatewaySoundboardSoundsDispatchData {
  /** The sounds. */
  soundboard_sounds: APISoundboardSound[]
  /** The guild they belong to. */
  guild_id: Snowflake
}

/**
 * An audit log entry, with the guild it was recorded in.
 */
export interface GatewayGuildAuditLogEntryCreateDispatchData extends APIAuditLogEntry {
  /** The guild the entry was recorded in. */
  guild_id: Snowflake
}
