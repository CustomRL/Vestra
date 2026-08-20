import type { ISO8601Timestamp, Snowflake } from '../globals.js'
import type { APIChannel, APIThreadChannel } from '../payloads/channel.js'
import type { APIGuild, APIUnavailableGuild } from '../payloads/guild.js'
import type { APIGuildMember, APIVoiceState } from '../payloads/member.js'
import type { APIMessage } from '../payloads/message.js'
import type { APIRole } from '../payloads/role.js'
import type { APIUser } from '../payloads/user.js'

/**
 * Data carried by each dispatch event.
 *
 * @remarks
 * An interface rather than a type alias, so a downstream package can extend it by
 * declaration merging while Vestra fills in the remainder.
 *
 * Events absent from this map resolve to `unknown` through {@link GatewayDispatchData}.
 * That is deliberate: `unknown` forces a consumer to narrow, which is honest, whereas
 * `any` would silently claim a precision these typings do not yet have. The gaps are
 * tracked, and the event-coverage test in `@vestra/core` keeps them visible.
 */
export interface GatewayDispatchEventMap {
  /** The initial state after identifying. */
  READY: GatewayReadyDispatchData
  /** Sent after a successful resume; carries no data. */
  RESUMED: undefined

  /** A guild became available, or the bot joined one. */
  GUILD_CREATE: GatewayGuildCreateDispatchData
  /** A guild was updated. */
  GUILD_UPDATE: APIGuild
  /** A guild became unavailable, or the bot was removed from one. */
  GUILD_DELETE: APIUnavailableGuild

  /** A channel was created. */
  CHANNEL_CREATE: APIChannel
  /** A channel was updated. */
  CHANNEL_UPDATE: APIChannel
  /** A channel was deleted. */
  CHANNEL_DELETE: APIChannel

  /** A message was sent. */
  MESSAGE_CREATE: GatewayMessageCreateDispatchData
  /** A message was edited. */
  MESSAGE_UPDATE: GatewayMessageUpdateDispatchData
  /** A message was deleted. */
  MESSAGE_DELETE: GatewayMessageDeleteDispatchData
  /** Several messages were deleted at once. */
  MESSAGE_DELETE_BULK: GatewayMessageDeleteBulkDispatchData

  /** A member joined a guild. */
  GUILD_MEMBER_ADD: GatewayGuildMemberAddDispatchData
  /** A member was updated. */
  GUILD_MEMBER_UPDATE: GatewayGuildMemberUpdateDispatchData
  /** A member left or was removed from a guild. */
  GUILD_MEMBER_REMOVE: GatewayGuildMemberRemoveDispatchData

  /** A role was created. */
  GUILD_ROLE_CREATE: GatewayGuildRoleModifyDispatchData
  /** A role was updated. */
  GUILD_ROLE_UPDATE: GatewayGuildRoleModifyDispatchData
  /** A role was deleted. */
  GUILD_ROLE_DELETE: GatewayGuildRoleDeleteDispatchData

  /** The current user was updated. */
  USER_UPDATE: APIUser
  /** A user joined, left or moved between voice channels. */
  VOICE_STATE_UPDATE: APIVoiceState
  /** A user started typing. */
  TYPING_START: GatewayTypingStartDispatchData
  /** A page of members requested with opcode 8. */
  GUILD_MEMBERS_CHUNK: GatewayGuildMembersChunkDispatchData
  /** A gateway command was rejected for exceeding a rate limit. */
  RATE_LIMITED: GatewayRateLimitedDispatchData
}

/**
 * The data type for a dispatch event, or `unknown` if it is not yet modelled.
 */
export type GatewayDispatchData<Event extends string> = Event extends keyof GatewayDispatchEventMap
  ? GatewayDispatchEventMap[Event]
  : unknown

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
   * Typed loosely because presences are not modelled yet; `unknown` forces a consumer to
   * narrow rather than trusting a shape this package cannot yet promise.
   */
  presences: unknown[]
  /** Stage instances in the guild. Not modelled yet. */
  stage_instances: unknown[]
  /** Scheduled events in the guild. Not modelled yet. */
  guild_scheduled_events: unknown[]
  /** Soundboard sounds in the guild. Not modelled yet. */
  soundboard_sounds: unknown[]
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
  /** Presences of the returned members, if requested. */
  presences?: unknown[]
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
