import type { Snowflake } from '../globals.js'
import type { APIChannel } from '../payloads/channel.js'
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
  GUILD_CREATE: APIGuild
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
}

/**
 * The data type for a dispatch event, or `unknown` if it is not yet modelled.
 */
export type GatewayDispatchData<Event extends string> = Event extends keyof GatewayDispatchEventMap
  ? GatewayDispatchEventMap[Event]
  : unknown

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
