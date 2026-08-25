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
import { sameStrings, type Changes, type ChangesDraft } from './Changes.js'
import {
  guildBannerUrl,
  guildDiscoverySplashUrl,
  guildIconUrl,
  guildSplashUrl,
  type ImageOptions,
} from './cdn.js'
import type { CacheCapable } from './capabilities.js'
import type { Channel } from './channels/Channel.js'
import type { GuildMember } from './GuildMember.js'
import type { Role } from './Role.js'
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
/**
 * The fields a {@link Guild.patch} can report as changed.
 *
 * @remarks
 * Every field the structure mirrors. `GUILD_UPDATE` sends a whole guild, so the comparison
 * decides rather than the presence — except for the last three, which only `GUILD_CREATE`
 * carries and which an update therefore says nothing about either way.
 */
export type GuildChangeField =
  | 'name'
  | 'icon'
  | 'splash'
  | 'discoverySplash'
  | 'ownerId'
  | 'afkChannelId'
  | 'afkTimeout'
  | 'verificationLevel'
  | 'defaultMessageNotifications'
  | 'explicitContentFilter'
  | 'mfaLevel'
  | 'features'
  | 'applicationId'
  | 'systemChannelId'
  | 'systemChannelFlags'
  | 'rulesChannelId'
  | 'publicUpdatesChannelId'
  | 'vanityUrlCode'
  | 'description'
  | 'banner'
  | 'premiumTier'
  | 'premiumSubscriptionCount'
  | 'preferredLocale'
  | 'nsfwLevel'
  | 'joinedTimestamp'
  | 'large'
  | 'memberCount'

/**
 * What a guild edit displaced.
 *
 * @typeParam Client - The client type the guild is bound to.
 *
 * @remarks
 * The second argument to `guildUpdate`, and `null` when the guild was not cached or when the
 * update changed nothing. Guilds are cached by default, so this is usually populated. See
 * {@link Changes}.
 */
export type GuildChanges<Client = unknown> = Changes<Guild<Client>, GuildChangeField>

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
   * The guild's icon, or `undefined` if it has none.
   *
   * @param options - The format and size to request.
   * @returns The URL, or `undefined`.
   *
   * @remarks
   * Unlike a user's avatar there is no default to fall back to — Discord renders a guild
   * without an icon as its initials, client-side, and the CDN serves nothing for it.
   */
  iconUrl(options?: ImageOptions): string | undefined {
    return this.icon === null ? undefined : guildIconUrl(this.id, this.icon, options)
  }

  /** The guild's banner, or `undefined` if it has none. */
  bannerUrl(options?: ImageOptions): string | undefined {
    return this.banner === null ? undefined : guildBannerUrl(this.id, this.banner, options)
  }

  /** The guild's invite splash, or `undefined` if it has none. */
  splashUrl(options?: ImageOptions): string | undefined {
    return this.splash === null ? undefined : guildSplashUrl(this.id, this.splash, options)
  }

  /** The guild's discovery splash, or `undefined` if it has none. */
  discoverySplashUrl(options?: ImageOptions): string | undefined {
    return this.discoverySplash === null
      ? undefined
      : guildDiscoverySplashUrl(this.id, this.discoverySplash, options)
  }

  /**
   * The guild's cached roles.
   *
   * @param this - A structure whose client can reach the cache.
   * @returns The roles, or an empty array when the scope is off.
   *
   * @remarks
   * A method rather than a getter, and it takes no arguments — the `this` parameter is a type
   * constraint, not something a caller passes. A getter cannot carry one, and without it this
   * would have to either import the client (closing a module cycle) or promise a cache the
   * structure has no way to reach.
   *
   * An empty array means "nothing cached", which under `roles: false` is every guild. That is
   * ADR 4 rather than caution, and it is why this is not called `getRoles`: it reads the cache
   * and never fetches, so a caller who needs the authoritative list uses
   * `client.rest.guilds.getRoles(guild.id)`.
   */
  roles<C extends CacheCapable>(this: Guild<C>): Role[] {
    return this.client.cache.roles.group(this.id)
  }

  /**
   * The guild's cached channels, threads excluded.
   *
   * @param this - A structure whose client can reach the cache.
   * @returns The channels, or an empty array when the scope is off.
   *
   * @remarks
   * Threads are a separate scope with a separate bound, so they are not folded in here — see
   * {@link CacheRegistry.threads} for why.
   */
  channels<C extends CacheCapable>(this: Guild<C>): Channel[] {
    return this.client.cache.channels.group(this.id)
  }

  /**
   * The guild's cached members.
   *
   * @param this - A structure whose client can reach the cache.
   * @returns The members, or an empty array when the scope is off.
   *
   * @remarks
   * Off by default, and even switched on this is only who the library has seen. What arrives at
   * startup depends on an intent in a way that surprises people — see
   * {@link CacheRegistry.members}. `client.fetchMembers(guild.id)` is the way to ask Discord.
   */
  members<C extends CacheCapable>(this: Guild<C>): GuildMember[] {
    return this.client.cache.members.group(this.id)
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
  patch(data: APIGuildLike): GuildChanges<Client> | null {
    // Record conditionally, assign unconditionally, for the twenty-four fields GUILD_UPDATE
    // always carries. The three below them are guarded on both, because they arrive only on
    // GUILD_CREATE and an absent one is not a cleared one.
    let changes: ChangesDraft<Guild<Client>, GuildChangeField> | null = null

    if (data.name !== this.name) (changes ??= {}).name = this.name
    this.name = data.name
    if (data.icon !== this.icon) (changes ??= {}).icon = this.icon
    this.icon = data.icon
    if (data.splash !== this.splash) (changes ??= {}).splash = this.splash
    this.splash = data.splash
    if (data.discovery_splash !== this.discoverySplash)
      (changes ??= {}).discoverySplash = this.discoverySplash
    this.discoverySplash = data.discovery_splash
    if (data.owner_id !== this.ownerId) (changes ??= {}).ownerId = this.ownerId
    this.ownerId = data.owner_id
    if (data.afk_channel_id !== this.afkChannelId) (changes ??= {}).afkChannelId = this.afkChannelId
    this.afkChannelId = data.afk_channel_id
    if (data.afk_timeout !== this.afkTimeout) (changes ??= {}).afkTimeout = this.afkTimeout
    this.afkTimeout = data.afk_timeout
    if (data.verification_level !== this.verificationLevel)
      (changes ??= {}).verificationLevel = this.verificationLevel
    this.verificationLevel = data.verification_level
    if (data.default_message_notifications !== this.defaultMessageNotifications)
      (changes ??= {}).defaultMessageNotifications = this.defaultMessageNotifications
    this.defaultMessageNotifications = data.default_message_notifications
    if (data.explicit_content_filter !== this.explicitContentFilter)
      (changes ??= {}).explicitContentFilter = this.explicitContentFilter
    this.explicitContentFilter = data.explicit_content_filter
    if (data.mfa_level !== this.mfaLevel) (changes ??= {}).mfaLevel = this.mfaLevel
    this.mfaLevel = data.mfa_level
    // Compared by value: the payload array is freshly parsed on every dispatch, so a
    // reference test would report a feature change on every guild update.
    if (!sameStrings(this.features, data.features)) {
      ;(changes ??= {}).features = this.features
    }
    this.features = data.features
    if (data.application_id !== this.applicationId)
      (changes ??= {}).applicationId = this.applicationId
    this.applicationId = data.application_id
    if (data.system_channel_id !== this.systemChannelId)
      (changes ??= {}).systemChannelId = this.systemChannelId
    this.systemChannelId = data.system_channel_id
    if (data.system_channel_flags !== this.systemChannelFlags)
      (changes ??= {}).systemChannelFlags = this.systemChannelFlags
    this.systemChannelFlags = data.system_channel_flags
    if (data.rules_channel_id !== this.rulesChannelId)
      (changes ??= {}).rulesChannelId = this.rulesChannelId
    this.rulesChannelId = data.rules_channel_id
    if (data.public_updates_channel_id !== this.publicUpdatesChannelId)
      (changes ??= {}).publicUpdatesChannelId = this.publicUpdatesChannelId
    this.publicUpdatesChannelId = data.public_updates_channel_id
    if (data.vanity_url_code !== this.vanityUrlCode)
      (changes ??= {}).vanityUrlCode = this.vanityUrlCode
    this.vanityUrlCode = data.vanity_url_code
    if (data.description !== this.description) (changes ??= {}).description = this.description
    this.description = data.description
    if (data.banner !== this.banner) (changes ??= {}).banner = this.banner
    this.banner = data.banner
    if (data.premium_tier !== this.premiumTier) (changes ??= {}).premiumTier = this.premiumTier
    this.premiumTier = data.premium_tier
    if (data.premium_subscription_count !== this.premiumSubscriptionCount)
      (changes ??= {}).premiumSubscriptionCount = this.premiumSubscriptionCount
    this.premiumSubscriptionCount = data.premium_subscription_count
    if (data.preferred_locale !== this.preferredLocale)
      (changes ??= {}).preferredLocale = this.preferredLocale
    this.preferredLocale = data.preferred_locale
    if (data.nsfw_level !== this.nsfwLevel) (changes ??= {}).nsfwLevel = this.nsfwLevel
    this.nsfwLevel = data.nsfw_level

    // Left alone rather than blanked when absent: only GUILD_CREATE sends these, so an
    // update saying nothing about them is not an update clearing them.
    if (data.joined_at !== undefined && data.joined_at !== this.joinedTimestamp) {
      ;(changes ??= {}).joinedTimestamp = this.joinedTimestamp
      this.joinedTimestamp = data.joined_at
    }
    if (data.large !== undefined && data.large !== this.large) {
      ;(changes ??= {}).large = this.large
      this.large = data.large
    }
    if (data.member_count !== undefined && data.member_count !== this.memberCount) {
      ;(changes ??= {}).memberCount = this.memberCount
      this.memberCount = data.member_count
    }

    return changes
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
