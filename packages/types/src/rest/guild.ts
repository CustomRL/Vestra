import type { ISO8601Timestamp, Permissions, Snowflake } from '../globals.js'
import type { ChannelType } from '../enums/channel.js'
import type { APIChannel, APIOverwrite } from '../payloads/channel.js'
import type { APIBan, APIGuild } from '../payloads/guild.js'
import type { APIGuildMember } from '../payloads/member.js'
import type { APIRole } from '../payloads/role.js'

/**
 * `GET /guilds/{guild.id}`
 */
export interface RESTGetAPIGuildQuery {
  /** Whether to include approximate member and presence counts. */
  with_counts?: boolean
}

/** The result of `GET /guilds/{guild.id}`. */
export type RESTGetAPIGuildResult = APIGuild

/**
 * `GET /guilds/{guild.id}/members`
 */
export interface RESTGetAPIGuildMembersQuery {
  /** How many members to return, from 1 to 1000. Defaults to 1. */
  limit?: number
  /** The highest user ID from the previous page. */
  after?: Snowflake
}

/** The result of `GET /guilds/{guild.id}/members`. */
export type RESTGetAPIGuildMembersResult = APIGuildMember[]

/** The result of `GET /guilds/{guild.id}/members/{user.id}`. */
export type RESTGetAPIGuildMemberResult = APIGuildMember

/**
 * `PATCH /guilds/{guild.id}/members/{user.id}`
 *
 * @remarks
 * Each field requires a different permission, so a partial update can fail wholesale on
 * one field the bot cannot change. Send only what is actually being modified.
 */
export interface RESTPatchAPIGuildMemberJSONBody {
  /** The member's new nickname. Requires `ManageNicknames`. */
  nick?: string | null
  /** The member's new roles. Requires `ManageRoles`. */
  roles?: Snowflake[] | null
  /** Whether the member is server-muted. Requires `MuteMembers`. */
  mute?: boolean | null
  /** Whether the member is server-deafened. Requires `DeafenMembers`. */
  deaf?: boolean | null
  /** The voice channel to move the member to. Requires `MoveMembers`. */
  channel_id?: Snowflake | null
  /**
   * When the member's timeout expires, up to 28 days ahead.
   *
   * @remarks
   * Requires `ModerateMembers`. Pass `null` to clear an active timeout.
   */
  communication_disabled_until?: ISO8601Timestamp | null
  /** The member's new flags. */
  flags?: number | null
}

/** The result of `PATCH /guilds/{guild.id}/members/{user.id}`. */
export type RESTPatchAPIGuildMemberResult = APIGuildMember

/**
 * `PUT /guilds/{guild.id}/bans/{user.id}`
 */
export interface RESTPutAPIGuildBanJSONBody {
  /**
   * Seconds of the user's message history to delete, from 0 to 604800.
   *
   * @remarks
   * Applies across every channel in the guild, and is irreversible.
   */
  delete_message_seconds?: number
}

/** The result of `GET /guilds/{guild.id}/bans/{user.id}`. */
export type RESTGetAPIGuildBanResult = APIBan

/**
 * `GET /guilds/{guild.id}/bans`
 */
export interface RESTGetAPIGuildBansQuery {
  /** How many bans to return, from 1 to 1000. Defaults to 1000. */
  limit?: number
  /** Return bans before this user ID. */
  before?: Snowflake
  /** Return bans after this user ID. */
  after?: Snowflake
}

/** The result of `GET /guilds/{guild.id}/bans`. */
export type RESTGetAPIGuildBansResult = APIBan[]

/**
 * `POST /guilds/{guild.id}/roles`
 */
export interface RESTPostAPIGuildRoleJSONBody {
  /** The role's name. Defaults to "new role". */
  name?: string
  /** The role's permission bit set, as a decimal string. */
  permissions?: Permissions
  /** The role's colour as an integer representation of a hex code. */
  color?: number
  /** Whether members with this role are listed separately in the sidebar. */
  hoist?: boolean
  /** The role's icon, as a data URI. Requires the guild to have `ROLE_ICONS`. */
  icon?: string | null
  /** The role's unicode emoji. */
  unicode_emoji?: string | null
  /** Whether the role can be mentioned by anyone. */
  mentionable?: boolean
}

/** `PATCH /guilds/{guild.id}/roles/{role.id}` */
export type RESTPatchAPIGuildRoleJSONBody = RESTPostAPIGuildRoleJSONBody

/** The result of `POST /guilds/{guild.id}/roles`. */
export type RESTPostAPIGuildRoleResult = APIRole

/** The result of `PATCH /guilds/{guild.id}/roles/{role.id}`. */
export type RESTPatchAPIGuildRoleResult = APIRole

/** The result of `GET /guilds/{guild.id}/roles`. */
export type RESTGetAPIGuildRolesResult = APIRole[]

/**
 * `POST /guilds/{guild.id}/channels`
 *
 * @remarks
 * `name` and nothing else is required; Discord defaults `type` to a text channel. `position`
 * is advisory — creating a channel renumbers its siblings, so the value that comes back is
 * the one to believe.
 */
export interface RESTPostAPIGuildChannelJSONBody {
  /** The channel's name, 1 to 100 characters. */
  name: string
  /** What kind of channel to create. Defaults to a guild text channel. */
  type?: ChannelType
  /** The channel topic, 0 to 1024 characters. */
  topic?: string | null
  /** Bitrate in bits per second, for a voice channel. */
  bitrate?: number
  /** How many users may join a voice channel, or `0` for no limit. */
  user_limit?: number
  /** Seconds a member must wait between messages, 0 to 21600. */
  rate_limit_per_user?: number
  /** Sorting position among its siblings. */
  position?: number
  /** Explicit permission overwrites. */
  permission_overwrites?: APIOverwrite[]
  /** The category to place it under. */
  parent_id?: Snowflake | null
  /** Whether the channel is age-restricted. */
  nsfw?: boolean
  /** The voice region, or `null` to let Discord choose. */
  rtc_region?: string | null
  /** The default auto-archive duration for threads, in minutes. */
  default_auto_archive_duration?: number
}

/** The result of `POST /guilds/{guild.id}/channels`. */
export type RESTPostAPIGuildChannelResult = APIChannel

/** The result of `GET /guilds/{guild.id}/channels`. */
export type RESTGetAPIGuildChannelsResult = APIChannel[]

/**
 * `GET /guilds/{guild.id}/members/search`
 *
 * @remarks
 * A prefix search on username and nickname, capped at 1000 results and **not** requiring the
 * `GuildMembers` intent — which is what makes it the practical way to resolve a name to a
 * member without fetching the guild. It is a prefix match, not a fuzzy one: `nel` finds
 * `nelly` and nothing finds `elly`.
 */
export interface RESTGetAPIGuildMembersSearchQuery {
  /** The username or nickname prefix to match. */
  query: string
  /** How many to return, 1 to 1000. Defaults to 1. */
  limit?: number
}

/** The result of `GET /guilds/{guild.id}/members/search`. */
export type RESTGetAPIGuildMembersSearchResult = APIGuildMember[]

/**
 * `PATCH /guilds/{guild.id}/members/@me`
 *
 * @remarks
 * The bot's own membership, and the only way to set its own nickname — the general member
 * edit needs `ManageNicknames`, which a bot renaming itself should not have to hold.
 */
export interface RESTPatchAPICurrentGuildMemberJSONBody {
  /** The nickname to show, or `null` to clear it. */
  nick?: string | null
}

/** The result of `PATCH /guilds/{guild.id}/members/@me`. */
export type RESTPatchAPICurrentGuildMemberResult = APIGuildMember

/**
 * `POST /guilds/{guild.id}/bulk-ban`
 *
 * @remarks
 * **Partial success is the normal outcome**, which is why the result names both halves rather
 * than throwing. A user already banned, or one the bot cannot ban because of role hierarchy,
 * lands in `failed_users` while the rest go through; only a request where *every* ban fails
 * answers an error.
 *
 * Needs both `BanMembers` and `ManageGuild`, unlike the single ban.
 */
export interface RESTPostAPIGuildBulkBanJSONBody {
  /** The users to ban, at most 200. */
  user_ids: Snowflake[]
  /** How much of their recent history to delete, in seconds. At most 604800. */
  delete_message_seconds?: number
}

/** The result of `POST /guilds/{guild.id}/bulk-ban`. */
export interface RESTPostAPIGuildBulkBanResult {
  /** The users who were banned. */
  banned_users: Snowflake[]
  /** The users who were not, for any reason. */
  failed_users: Snowflake[]
}

/**
 * One entry of `PATCH /guilds/{guild.id}/roles`.
 *
 * @remarks
 * Positions are guild-wide and contiguous, so moving one role renumbers others. Sending only
 * the roles that move is correct and is what the route is for; Discord works out the rest.
 */
export interface RESTPatchAPIGuildRolePositionsEntry {
  /** The role to move. */
  id: Snowflake
  /** Its new position, or `null` to leave it where it is. */
  position?: number | null
}

/** `PATCH /guilds/{guild.id}/roles` */
export type RESTPatchAPIGuildRolePositionsJSONBody = RESTPatchAPIGuildRolePositionsEntry[]

/** The result of `PATCH /guilds/{guild.id}/roles`, which is every role in its new order. */
export type RESTPatchAPIGuildRolePositionsResult = APIRole[]
