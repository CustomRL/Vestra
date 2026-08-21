import type {
  APIGuild,
  DefaultMessageNotificationLevel,
  ExplicitContentFilterLevel,
  GatewayGuildCreateExtraFields,
  GuildNSFWLevel,
  ISO8601Timestamp,
  MFALevel,
  PremiumTier,
  Snowflake,
  VerificationLevel,
} from '@vestra/types'
import { Base } from './Base.js'
import { snowflakeDate, snowflakeTimestamp } from './snowflake.js'

/**
 * A guild.
 *
 * @remarks
 * **A curated field set, not all forty-six.** `APIGuild` carries a great deal that a bot
 * reads once a year — `home_header`, `max_stage_video_channel_users`, the widget fields, the
 * deprecated `region`. Mirroring everything would put `Guild.ts` past six hundred lines and
 * pay a slot per field on every cached guild, which under ADR 4's defaults is every guild
 * the bot is in. What is here is what a bot actually reaches for; the rest is one REST call
 * away and `docs/design/phase-4-core.md` §8-A15 records that this cut needs a review rather
 * than being final.
 *
 * **`unavailable` is not a field here.** A `GUILD_DELETE` carrying `unavailable: true` is an
 * outage, not a departure, and telling the two apart decides whether to drop a guild from
 * cache or wait for it to come back. That decision belongs to the handler that receives the
 * dispatch, which can see which event it was; a boolean on the structure would let it be
 * read as "this guild is currently down" long after the payload that said so.
 *
 * **`nsfw` is not mirrored, only `nsfw_level`.** The boolean is deprecated upstream because
 * it is derived: it reads `true` for both `Explicit` and `AgeRestricted`, so a bot branching
 * on it cannot tell an age-gated guild from one Discord flagged. Mirroring it would put a
 * field that gives the wrong answer on every cached guild.
 *
 * **Roles and channels are not held here either.** They are their own cache scopes, grouped
 * by guild ID: `client.cache.roles.group(guild.id)`. Nesting them would make them invisible
 * to a third-party adapter, unserialisable, and exempt from policy and sweeping — a special
 * case in every mechanism.
 *
 * There is deliberately no `guild.roles` accessor yet. It needs the guild to reach its
 * client's cache, and `Base` is generic over the client precisely to avoid importing it, so
 * the lookup stays at the call site until that is resolved. An accessor that returned an
 * empty array regardless would read as "this guild has no roles", which is a worse answer
 * than making the caller ask the cache.
 */
export class Guild<Client = unknown> extends Base<Client> {
  /** The guild's ID. */
  declare readonly id: Snowflake
  /** The guild's name. */
  declare name: string
  /** The icon hash. */
  declare icon: string | null
  /** The splash hash. */
  declare splash: string | null
  /** The discovery splash hash. */
  declare discoverySplash: string | null
  /** The owner's user ID. */
  declare ownerId: Snowflake
  /** The AFK voice channel, or `null` if none is set. */
  declare afkChannelId: Snowflake | null
  /** How long before an idle member is moved to the AFK channel, in seconds. */
  declare afkTimeout: number
  /** How thoroughly members must verify before they can talk. */
  declare verificationLevel: VerificationLevel
  /** What members are notified about by default. */
  declare defaultMessageNotifications: DefaultMessageNotificationLevel
  /** Whose messages are scanned for explicit content. */
  declare explicitContentFilter: ExplicitContentFilterLevel
  /** Whether moderators must have two-factor authentication. */
  declare mfaLevel: MFALevel
  /** The guild's feature flags, as Discord's own strings. */
  declare features: readonly string[]
  /** The application that created the guild, when a bot did. */
  declare applicationId: Snowflake | null
  /** Where Discord posts join and boost messages. */
  declare systemChannelId: Snowflake | null
  /** Which system messages are suppressed, as a bit set. */
  declare systemChannelFlags: number
  /** The rules channel, on a community guild. */
  declare rulesChannelId: Snowflake | null
  /** Where Discord posts community updates. */
  declare publicUpdatesChannelId: Snowflake | null
  /** The vanity invite code. */
  declare vanityUrlCode: string | null
  /** The guild's description, on a discoverable guild. */
  declare description: string | null
  /** The banner hash. */
  declare banner: string | null
  /** The boost tier. */
  declare premiumTier: PremiumTier
  /** How many boosts the guild has. */
  declare premiumSubscriptionCount: number | undefined
  /** The locale Discord uses for community features. */
  declare preferredLocale: string
  /** How age-restricted Discord considers the guild. */
  declare nsfwLevel: GuildNSFWLevel
  /**
   * When the bot joined, as the raw ISO string.
   *
   * @remarks
   * Only ever sent on `GUILD_CREATE`, so it is absent on a guild built from a REST fetch.
   */
  declare joinedTimestamp: ISO8601Timestamp | undefined
  /**
   * Whether the guild is large enough that Discord withheld its offline members.
   *
   * @remarks
   * `GUILD_CREATE` only. Above `large_threshold` the member list arrives incomplete and
   * must be filled in with a member request, so a bot that assumes otherwise silently sees
   * a fraction of the guild.
   */
  declare large: boolean | undefined
  /** How many members the guild has, on `GUILD_CREATE`. */
  declare memberCount: number | undefined

  /**
   * @param data - The payload to mirror.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIGuildLike, client: Client) {
    super(client)

    this.id = data.id
    this.name = data.name
    this.icon = data.icon
    this.splash = data.splash
    this.discoverySplash = data.discovery_splash
    this.ownerId = data.owner_id
    this.afkChannelId = data.afk_channel_id
    this.afkTimeout = data.afk_timeout
    this.verificationLevel = data.verification_level
    this.defaultMessageNotifications = data.default_message_notifications
    this.explicitContentFilter = data.explicit_content_filter
    this.mfaLevel = data.mfa_level
    this.features = data.features
    this.applicationId = data.application_id
    this.systemChannelId = data.system_channel_id
    this.systemChannelFlags = data.system_channel_flags
    this.rulesChannelId = data.rules_channel_id
    this.publicUpdatesChannelId = data.public_updates_channel_id
    this.vanityUrlCode = data.vanity_url_code
    this.description = data.description
    this.banner = data.banner
    this.premiumTier = data.premium_tier
    this.premiumSubscriptionCount = data.premium_subscription_count
    this.preferredLocale = data.preferred_locale
    this.nsfwLevel = data.nsfw_level
    this.joinedTimestamp = data.joined_at
    this.large = data.large
    this.memberCount = data.member_count
  }

  /** When the guild was created, in epoch milliseconds. */
  get createdTimestamp(): number {
    return snowflakeTimestamp(this.id)
  }

  /** When the guild was created. Allocates. */
  get createdAt(): Date {
    return snowflakeDate(this.id)
  }

  /** When the bot joined, or `null` if the payload never said. Allocates. */
  get joinedAt(): Date | null {
    const raw = this.joinedTimestamp
    return raw === undefined ? null : new Date(raw)
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   *
   * @remarks
   * `GUILD_UPDATE` carries a whole guild, so this assigns unconditionally — unlike
   * {@link Message} and {@link GuildMember}, whose updates are partial. The three fields
   * only `GUILD_CREATE` sends are left alone rather than blanked, because an update saying
   * nothing about them is not an update clearing them.
   */
  patch(data: APIGuildLike): void {
    this.name = data.name
    this.icon = data.icon
    this.splash = data.splash
    this.discoverySplash = data.discovery_splash
    this.ownerId = data.owner_id
    this.afkChannelId = data.afk_channel_id
    this.afkTimeout = data.afk_timeout
    this.verificationLevel = data.verification_level
    this.defaultMessageNotifications = data.default_message_notifications
    this.explicitContentFilter = data.explicit_content_filter
    this.mfaLevel = data.mfa_level
    this.features = data.features
    this.applicationId = data.application_id
    this.systemChannelId = data.system_channel_id
    this.systemChannelFlags = data.system_channel_flags
    this.rulesChannelId = data.rules_channel_id
    this.publicUpdatesChannelId = data.public_updates_channel_id
    this.vanityUrlCode = data.vanity_url_code
    this.description = data.description
    this.banner = data.banner
    this.premiumTier = data.premium_tier
    this.premiumSubscriptionCount = data.premium_subscription_count
    this.preferredLocale = data.preferred_locale
    this.nsfwLevel = data.nsfw_level

    // Left alone rather than blanked when absent: only GUILD_CREATE sends these, so an
    // update saying nothing about them is not an update clearing them.
    if (data.joined_at !== undefined) this.joinedTimestamp = data.joined_at
    if (data.large !== undefined) this.large = data.large
    if (data.member_count !== undefined) this.memberCount = data.member_count
  }
}

/**
 * A guild payload in either of the forms a structure is built from.
 *
 * @remarks
 * `GUILD_CREATE` adds `joined_at`, `large` and `member_count` to the resource; `GUILD_UPDATE`
 * sends the resource alone. Expressed as the resource plus optional extras rather than as
 * `Exclude<…, APIUnavailableGuild>`, because that exclusion does not work: `unavailable` is
 * optional on the stub, so the two members are not discriminated and the exclusion removes
 * nothing while making the result demand fields `GUILD_UPDATE` never sends.
 */
export type APIGuildLike = APIGuild & Partial<GatewayGuildCreateExtraFields>
