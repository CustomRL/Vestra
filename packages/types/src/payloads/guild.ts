import type { ISO8601Timestamp, Permissions, Snowflake } from '../globals.js'
import type {
  DefaultMessageNotificationLevel,
  ExplicitContentFilterLevel,
  GuildNSFWLevel,
  MFALevel,
  PremiumTier,
  VerificationLevel,
} from '../enums/guild.js'
import type { APIChannelPartial } from './channel.js'
import type { APIEmoji } from './emoji.js'
import type { APIRole } from './role.js'
import type { APISticker } from './sticker.js'
import type { APIUser } from './user.js'

/**
 * A guild, known in the client as a server.
 */
export interface APIGuild {
  /** The guild's ID. */
  id: Snowflake
  /** The guild's name, from 2 to 100 characters. */
  name: string
  /** The guild's icon hash. */
  icon: string | null
  /** The guild's icon hash, returned when in the template object. */
  icon_hash?: string | null
  /** The guild's splash image hash. */
  splash: string | null
  /** The guild's discovery splash hash. Only present for discoverable guilds. */
  discovery_splash: string | null
  /**
   * The hash of the guild's home header image, shown to new members on the server guide.
   *
   * @remarks
   * Not listed in Discord's guild object table, but declared on every guild response in
   * its OpenAPI specification. `null` when no home header has been uploaded.
   */
  home_header: string | null
  /**
   * Whether the current user owns the guild.
   *
   * @remarks
   * Only sent on `GET /users/@me/guilds`, where it describes the OAuth2 user rather than
   * the bot.
   */
  owner?: boolean
  /** The ID of the guild's owner. */
  owner_id: Snowflake
  /** The current user's permissions in the guild, excluding channel overwrites. */
  permissions?: Permissions
  /**
   * The guild's voice region ID.
   *
   * @remarks
   * Documented as both optional and nullable, so it may be missing as well as `null`,
   * even though Discord's OpenAPI specification still declares it a required string.
   *
   * @deprecated Voice regions moved from the guild to the channel. Read `rtc_region` on
   * the voice or stage channel instead.
   */
  region?: string | null
  /** The ID of the AFK voice channel. */
  afk_channel_id: Snowflake | null
  /** How long a member must be idle before being moved to the AFK channel, in seconds. */
  afk_timeout: number
  /** Whether the guild has the server widget enabled. */
  widget_enabled?: boolean
  /** The channel the widget generates an invite to. */
  widget_channel_id?: Snowflake | null
  /** How verified a member must be before they can speak. */
  verification_level: VerificationLevel
  /** The default notification setting for members. */
  default_message_notifications: DefaultMessageNotificationLevel
  /** Whose messages Discord scans for explicit content. */
  explicit_content_filter: ExplicitContentFilterLevel
  /** The guild's roles. */
  roles: APIRole[]
  /** The guild's custom emojis. */
  emojis: APIEmoji[]
  /**
   * The guild's custom stickers.
   *
   * @remarks
   * Documented as optional, and sent on full guild payloads such as `GUILD_CREATE` and
   * `GET /guilds/{id}`. An absent field means Discord did not send the list, which is not
   * the same as the guild having no stickers.
   */
  stickers?: APISticker[]
  /**
   * The features the guild has enabled.
   *
   * @remarks
   * Deliberately `string[]` rather than a closed union. Discord adds and removes features
   * without notice, and a closed union would make a new feature a compile error for every
   * consumer rather than a value they can simply test for.
   */
  features: string[]
  /** Whether two-factor authentication is required for moderation actions. */
  mfa_level: MFALevel
  /** The application that created the guild, if it is bot-created. */
  application_id: Snowflake | null
  /** The channel system messages such as join notices are sent to. */
  system_channel_id: Snowflake | null
  /** Which system messages are suppressed. A bit set of `SystemChannelFlags`. */
  system_channel_flags: number
  /** The channel where community guilds display rules. */
  rules_channel_id: Snowflake | null
  /** The maximum number of presences for the guild. Effectively always `null`. */
  max_presences?: number | null
  /** The maximum number of members for the guild. */
  max_members?: number
  /** The guild's vanity invite code. */
  vanity_url_code: string | null
  /** The guild's description, for discoverable guilds. */
  description: string | null
  /** The guild's banner hash. */
  banner: string | null
  /** The guild's server boost tier. */
  premium_tier: PremiumTier
  /** The number of boosts the guild currently has. */
  premium_subscription_count?: number
  /** The preferred locale of a community guild, used in discovery and notices. */
  preferred_locale: string
  /** The channel that receives Discord's community update notices. */
  public_updates_channel_id: Snowflake | null
  /** The maximum concurrent users in a video channel. */
  max_video_channel_users?: number
  /** The maximum concurrent users in a stage video channel. */
  max_stage_video_channel_users?: number
  /** An approximate member count, when requested with counts. */
  approximate_member_count?: number
  /** An approximate count of non-offline members, when requested with counts. */
  approximate_presence_count?: number
  /**
   * Whether the guild is considered NSFW.
   *
   * @deprecated Derived from `nsfw_level`, and `true` for both `Explicit` and
   * `AgeRestricted`. Read `nsfw_level`, which tells the two apart.
   */
  nsfw: boolean
  /** The guild's NSFW classification. */
  nsfw_level: GuildNSFWLevel
  /** Whether the guild has the boost progress bar enabled. */
  premium_progress_bar_enabled: boolean
  /**
   * When the boost progress bar was last enabled by a user.
   *
   * @remarks
   * Discord's OpenAPI specification does not list this among the required fields, and it
   * is `null` on guilds where the bar has never been enabled, so both cases have to be
   * handled. Not part of the documented guild object table.
   */
  premium_progress_bar_enabled_user_updated_at?: ISO8601Timestamp | null
  /** The channel receiving safety alerts from Discord. */
  safety_alerts_channel_id: Snowflake | null
  /** The guild's safety incident actions, or `null` if none have ever been set. */
  incidents_data: APIIncidentsData | null
}

/**
 * The safety incident actions in force in a guild.
 *
 * @remarks
 * Moderators pause invites or direct messages from the guild's safety settings, and
 * Discord itself pauses them on detecting a raid or a wave of DM spam. Each timestamp is
 * the moment that pause lifts, so a value in the past means the pause has already
 * expired; `null` means that pause is not in force at all.
 */
export interface APIIncidentsData {
  /** When invites to the guild are re-enabled. `null` if invites are not paused. */
  invites_disabled_until: ISO8601Timestamp | null
  /** When direct messages between members are re-enabled. `null` if they are not paused. */
  dms_disabled_until: ISO8601Timestamp | null
  /**
   * When Discord detected DM spam originating from the guild.
   *
   * @remarks
   * Documented as both optional and nullable, and absent from the incidents data schema
   * in Discord's OpenAPI specification altogether, so it may be missing as well as
   * `null`.
   */
  dm_spam_detected_at?: ISO8601Timestamp | null
  /**
   * When Discord detected a raid on the guild.
   *
   * @remarks
   * Optional as well as nullable, on the same terms as `dm_spam_detected_at`.
   */
  raid_detected_at?: ISO8601Timestamp | null
}

/**
 * A guild that is offline or that the current user was removed from.
 *
 * @remarks
 * Sent in `READY` for every guild the bot is in, then replaced by a full `APIGuild` as
 * each `GUILD_CREATE` arrives. Also sent as `GUILD_DELETE` when a guild outage begins —
 * in that case `unavailable` is `true`, whereas an actual removal from the guild omits
 * the field entirely. Distinguishing the two is the difference between dropping a guild
 * from cache and waiting for it to come back.
 */
export interface APIUnavailableGuild {
  /** The guild's ID. */
  id: Snowflake
  /** Always `true` when present. */
  unavailable?: true
}

/**
 * The reduced guild form returned by `GET /users/@me/guilds`.
 */
export interface APIGuildPartial {
  /** The guild's ID. */
  id: Snowflake
  /** The guild's name. */
  name: string
  /** The guild's icon hash. */
  icon: string | null
  /** The guild's banner hash. */
  banner?: string | null
  /** Whether the current user owns the guild. */
  owner?: boolean
  /** The current user's permissions in the guild. */
  permissions?: Permissions
  /** The features the guild has enabled. */
  features: string[]
  /** An approximate member count. */
  approximate_member_count?: number
  /** An approximate count of non-offline members. */
  approximate_presence_count?: number
}

/**
 * A ban on a user in a guild.
 */
export interface APIBan {
  /** The reason recorded for the ban. */
  reason: string | null
  /** The banned user. */
  user: APIUser
}

/**
 * An invite to a guild channel.
 */
export interface APIInvite {
  /** The invite's code, which is its unique identifier. */
  code: string
  /** The guild the invite is for. */
  guild?: APIGuildPartial
  /** The channel the invite is for. */
  channel: APIChannelPartial | null
  /** The user who created the invite. */
  inviter?: APIUser
  /** An approximate count of non-offline members. */
  approximate_presence_count?: number
  /** An approximate total member count. */
  approximate_member_count?: number
  /** When the invite expires. */
  expires_at?: ISO8601Timestamp | null
}

/**
 * The public face of a discoverable guild.
 *
 * @remarks
 * What `GET /guilds/{id}/preview` returns, and the only guild shape readable without being a
 * member — a bot can fetch this for any guild with `DISCOVERABLE`, which is what makes it
 * useful for a "should I join" check. It is a strict subset of {@link APIGuild} plus two
 * counts, both approximate.
 */
export interface APIGuildPreview {
  /** The guild's ID. */
  id: Snowflake
  /** The guild's name. */
  name: string
  /** The icon hash. */
  icon: string | null
  /** The splash hash. */
  splash: string | null
  /** The discovery splash hash. */
  discovery_splash: string | null
  /** The guild's custom emojis. */
  emojis: APIEmoji[]
  /** The guild's feature flags. */
  features: string[]
  /** Roughly how many members it has. */
  approximate_member_count: number
  /** Roughly how many are online. */
  approximate_presence_count: number
  /** The description shown in discovery. */
  description: string | null
  /** The guild's stickers. */
  stickers: APISticker[]
}

/**
 * One channel offered on a guild's welcome screen.
 */
export interface APIGuildWelcomeScreenChannel {
  /** The channel to show. */
  channel_id: Snowflake
  /** The blurb beside it. */
  description: string
  /** The custom emoji to show, or `null` for a unicode one. */
  emoji_id: Snowflake | null
  /** The emoji's name, or the unicode character itself. */
  emoji_name: string | null
}

/**
 * The panel a community guild shows somebody who has just joined.
 */
export interface APIGuildWelcomeScreen {
  /** The text above the channels. */
  description: string | null
  /** The channels offered, at most five. */
  welcome_channels: APIGuildWelcomeScreenChannel[]
}

/**
 * A voice server region.
 *
 * @remarks
 * `id` is what a voice channel's `rtc_region` holds. `deprecated` regions still work and still
 * appear, so filtering on it is the caller's decision rather than the API's.
 */
export interface APIVoiceRegion {
  /** The region's ID, as used by `rtc_region`. */
  id: string
  /** A human-readable name. */
  name: string
  /** Whether this is the closest region to the current user. */
  optimal: boolean
  /** Whether Discord considers the region deprecated. */
  deprecated: boolean
  /** Whether it is a custom region for an event rather than a general one. */
  custom: boolean
}
