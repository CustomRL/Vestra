import type { ISO8601Timestamp, Permissions, Snowflake } from '../globals.js'
import type { ChannelType } from '../enums/channel.js'
import type {
  DefaultMessageNotificationLevel,
  ExplicitContentFilterLevel,
  VerificationLevel,
} from '../enums/guild.js'
import type { APIChannel, APIOverwrite } from '../payloads/channel.js'
import type { APIIntegration } from '../payloads/integration.js'
import type {
  APIBan,
  APIGuild,
  APIGuildPreview,
  APIGuildWelcomeScreen,
  APIGuildWelcomeScreenChannel,
  APIVoiceRegion,
} from '../payloads/guild.js'
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

/**
 * `PATCH /guilds/{guild.id}`
 *
 * @remarks
 * **Every field is optional and every one is a whole replacement.** `features` in particular
 * is the complete list — sending one feature removes the rest, and only a handful are settable
 * at all (`COMMUNITY`, `DISCOVERABLE`, `INVITES_DISABLED`, `RAID_ALERTS_DISABLED`); the others
 * are granted by Discord and rejected here.
 *
 * Several fields depend on each other. Turning `COMMUNITY` on requires `rules_channel_id` and
 * `public_updates_channel_id` in the same request, and turning it off clears them. The image
 * fields take data URIs, and `banner` and `splash` need the guild to have the corresponding
 * feature or boost level.
 */
export interface RESTPatchAPIGuildJSONBody {
  /** A new name. */
  name?: string
  /** How strictly Discord verifies members, or `null` for the default. */
  verification_level?: VerificationLevel | null
  /** Which messages notify by default, or `null` for the default. */
  default_message_notifications?: DefaultMessageNotificationLevel | null
  /** How aggressively Discord scans attachments, or `null` for the default. */
  explicit_content_filter?: ExplicitContentFilterLevel | null
  /** The AFK voice channel, or `null` for none. */
  afk_channel_id?: Snowflake | null
  /** Seconds of silence before somebody is moved to the AFK channel. */
  afk_timeout?: number
  /** A new icon as a data URI, or `null` to remove it. */
  icon?: string | null
  /** The new owner. Only the current owner may send this, and it needs MFA. */
  owner_id?: Snowflake
  /** A new invite splash as a data URI. Needs the `INVITE_SPLASH` feature. */
  splash?: string | null
  /** A new discovery splash as a data URI. Needs `DISCOVERABLE`. */
  discovery_splash?: string | null
  /** A new banner as a data URI. Needs the `BANNER` feature or boost level two. */
  banner?: string | null
  /** Where Discord posts join and boost messages, or `null` for nowhere. */
  system_channel_id?: Snowflake | null
  /** Which system messages to suppress, as a bit set. */
  system_channel_flags?: number
  /** The rules channel. Required while `COMMUNITY` is on. */
  rules_channel_id?: Snowflake | null
  /** Where Discord sends community updates. Required while `COMMUNITY` is on. */
  public_updates_channel_id?: Snowflake | null
  /** The locale Discord uses for community features. */
  preferred_locale?: string | null
  /** The complete feature list. Only a few are settable. */
  features?: string[]
  /** The description shown in discovery. */
  description?: string | null
  /** Whether boosts pay for the boost progress bar. */
  premium_progress_bar_enabled?: boolean
  /** Where Discord sends safety alerts, or `null` for nowhere. */
  safety_alerts_channel_id?: Snowflake | null
}

/** The result of `PATCH /guilds/{guild.id}`. */
export type RESTPatchAPIGuildResult = APIGuild

/** The result of `GET /guilds/{guild.id}/preview`. */
export type RESTGetAPIGuildPreviewResult = APIGuildPreview

/**
 * `GET /guilds/{guild.id}/prune`
 *
 * @remarks
 * **A dry run, and the only safe way to find out what a prune would do.** `include_roles` is
 * the field that decides whether the number means anything: by default a prune counts only
 * members with *no* roles at all, so on a guild that auto-assigns a role the answer is zero
 * and the prune that follows removes nobody.
 */
export interface RESTGetAPIGuildPruneCountQuery {
  /** How many days of inactivity count as inactive, 1 to 30. Defaults to 7. */
  days?: number
  /** Roles to count as prunable, comma-separated. Members with any other role are spared. */
  include_roles?: string
}

/** The result of `GET /guilds/{guild.id}/prune`. */
export interface RESTGetAPIGuildPruneCountResult {
  /** How many members the prune would remove. */
  pruned: number
}

/**
 * `POST /guilds/{guild.id}/prune`
 *
 * @remarks
 * `compute_prune_count` defaults to `true` and is the wrong default on a large guild: it makes
 * the request wait for a count Discord has to compute, and the route times out rather than
 * failing to prune. Send `false` on anything big and read the result as `null`.
 */
export interface RESTPostAPIGuildPruneJSONBody {
  /** Days of inactivity, 1 to 30. */
  days?: number
  /** Whether to count what was removed. Defaults to `true`. */
  compute_prune_count?: boolean
  /** Roles to count as prunable. Members with any other role are spared. */
  include_roles?: Snowflake[]
}

/** The result of `POST /guilds/{guild.id}/prune`. */
export interface RESTPostAPIGuildPruneResult {
  /** How many were removed, or `null` when the count was not computed. */
  pruned: number | null
}

/** The result of `GET /guilds/{guild.id}/regions`. */
export type RESTGetAPIGuildVoiceRegionsResult = APIVoiceRegion[]

/**
 * The result of `GET /guilds/{guild.id}/vanity-url`.
 *
 * @remarks
 * A partial invite rather than a full one: only the code and its use count. `code` is `null`
 * on a guild that has the feature and has not set one.
 */
export interface RESTGetAPIGuildVanityURLResult {
  /** The vanity code, or `null` if unset. */
  code: string | null
  /** How many times it has been used. */
  uses: number
}

/** The result of `GET /guilds/{guild.id}/welcome-screen`. */
export type RESTGetAPIGuildWelcomeScreenResult = APIGuildWelcomeScreen

/**
 * `PATCH /guilds/{guild.id}/welcome-screen`
 *
 * @remarks
 * `welcome_channels` replaces the list. `enabled` is what actually shows the panel — a screen
 * with channels configured and `enabled: false` is invisible, which is the state a caller who
 * only sent channels ends up in.
 */
export interface RESTPatchAPIGuildWelcomeScreenJSONBody {
  /** Whether the screen is shown at all. */
  enabled?: boolean | null
  /** The complete channel list, at most five. */
  welcome_channels?: APIGuildWelcomeScreenChannel[] | null
  /** The text above the channels. */
  description?: string | null
}

/** The result of `PATCH /guilds/{guild.id}/welcome-screen`. */
export type RESTPatchAPIGuildWelcomeScreenResult = APIGuildWelcomeScreen

/**
 * One entry of `PATCH /guilds/{guild.id}/channels`.
 *
 * @remarks
 * Positions are per-category and contiguous, so moving one channel renumbers its siblings.
 * `parent_id` moves a channel between categories, and `lock_permissions` decides whether it
 * inherits the new category's overwrites — omitting it keeps the old ones, which is how a
 * channel ends up in a private category and still publicly readable.
 */
export interface RESTPatchAPIGuildChannelPositionsEntry {
  /** The channel to move. */
  id: Snowflake
  /** Its new position, or `null` to leave it. */
  position?: number | null
  /** Whether to adopt the new parent's permission overwrites. */
  lock_permissions?: boolean | null
  /** The category to move it into, or `null` for none. */
  parent_id?: Snowflake | null
}

/** `PATCH /guilds/{guild.id}/channels` */
export type RESTPatchAPIGuildChannelPositionsJSONBody = RESTPatchAPIGuildChannelPositionsEntry[]

/**
 * The result of `GET /guilds/{guild.id}/integrations`.
 *
 * @remarks
 * **Partial integrations.** Discord omits `user` and the OAuth-only fields here, and returns
 * at most fifty — a guild with more has no way to list the rest, which is a limit of the route
 * rather than of the type.
 */
export type RESTGetAPIGuildIntegrationsResult = APIIntegration[]
