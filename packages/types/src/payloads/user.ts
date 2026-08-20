import type { Snowflake } from '../globals.js'
import type { PremiumType } from '../enums/user.js'

/**
 * A Discord user.
 *
 * @remarks
 * Which fields are present depends on how the object was obtained. Everything past
 * `avatar` requires either the `identify` OAuth2 scope or that the user is the
 * current user; `email` additionally requires the `email` scope. Objects arriving on
 * gateway events carry only the public fields.
 */
export interface APIUser {
  /** The user's ID. */
  id: Snowflake
  /**
   * The user's username. Not unique across the platform.
   *
   * @remarks
   * Since the move away from discriminators this is the account's unique handle for
   * migrated users, but it is not safe to treat it as stable — users can change it.
   */
  username: string
  /**
   * The user's four-digit tag, or `'0'` if they have migrated to the new username system.
   *
   * @remarks
   * Effectively legacy. Check for `'0'` rather than assuming a real discriminator.
   */
  discriminator: string
  /** The user's display name. For bots, this is the application name. */
  global_name: string | null
  /** The user's avatar hash, or `null` if they use a default avatar. */
  avatar: string | null
  /** Whether the user belongs to an OAuth2 application. */
  bot?: boolean
  /** Whether the user is one of Discord's own system accounts. */
  system?: boolean
  /** Whether the account has two-factor authentication enabled. */
  mfa_enabled?: boolean
  /** The user's banner hash. */
  banner?: string | null
  /** The user's banner colour as an integer representation of a hex code. */
  accent_color?: number | null
  /** The user's chosen language, as an IETF language tag. */
  locale?: string
  /** Whether the account's email is verified. Requires the `email` OAuth2 scope. */
  verified?: boolean
  /** The account's email. Requires the `email` OAuth2 scope. */
  email?: string | null
  /** The flags on the account. A bit set of `UserFlags`. */
  flags?: number
  /** The account's Nitro subscription tier. */
  premium_type?: PremiumType
  /**
   * The public flags on the account. A bit set of `UserFlags`.
   *
   * @remarks
   * This is the field present on users received from the gateway. `flags` is only
   * populated for the current user.
   */
  public_flags?: number
  /** The user's avatar decoration. */
  avatar_decoration_data?: APIAvatarDecorationData | null
  /**
   * The cosmetic collectibles the user has equipped on their profile.
   *
   * @remarks
   * Sent as `null` for a user with nothing equipped. Every cosmetic inside the object is
   * itself optional, so a present `collectibles` can still be empty.
   */
  collectibles?: APICollectibles | null
  /**
   * The user's primary guild, which is what backs the server tag shown beside their name.
   *
   * @remarks
   * Sent as `null` for a user who has not set one. Every field inside the object is
   * optional and nullable, so a present `primary_guild` does not by itself mean there is a
   * tag to render.
   */
  primary_guild?: APIUserPrimaryGuild | null
}

/**
 * The cosmetic frame rendered around a user's avatar.
 */
export interface APIAvatarDecorationData {
  /** The decoration's asset hash. */
  asset: string
  /** The ID of the SKU the decoration came from. */
  sku_id: Snowflake
}

/**
 * The cosmetic collectibles equipped on a user's profile.
 *
 * @remarks
 * Discord adds categories of collectible over time and each one is optional, so an absent
 * key means "nothing equipped" rather than a malformed payload.
 */
export interface APICollectibles {
  /** The user's equipped nameplate. */
  nameplate?: APINameplate
}

/**
 * A nameplate: the decorated background drawn behind a user's name in the member list.
 */
export interface APINameplate {
  /** The ID of the SKU the nameplate came from. */
  sku_id: Snowflake
  /**
   * The path to the nameplate asset.
   *
   * @remarks
   * A path fragment, not a bare hash like `avatar` or `banner`, so it does not slot into
   * the usual image routes.
   */
  asset: string
  /**
   * The nameplate's label.
   *
   * @remarks
   * Documented by Discord as currently unused.
   */
  label: string
  /**
   * The nameplate's background colour, given as one of Discord's palette names.
   *
   * @remarks
   * The palettes documented so far are `crimson`, `berry`, `sky`, `teal`, `forest`,
   * `bubble_gum`, `violet`, `cobalt`, `clover`, `lemon` and `white`. This is typed as
   * `string` rather than a union of those names because Discord adds palettes whenever it
   * ships a nameplate collection, and a closed union would reject valid payloads.
   */
  palette: string
}

/**
 * A user's primary guild — the server whose tag can be displayed beside their name.
 *
 * @remarks
 * This is the feature previously called a clan, and the field was named `clan` before it
 * was renamed. Discord documents all four fields as both optional and nullable, so read
 * each one defensively. Changes arrive on `GUILD_MEMBER_UPDATE`.
 */
export interface APIUserPrimaryGuild {
  /** The ID of the user's primary guild. */
  identity_guild_id?: Snowflake | null
  /**
   * Whether the user is displaying their primary guild's server tag.
   *
   * @remarks
   * `false` means the user removed the tag themselves; `null` means Discord cleared the
   * identity for them, for example because the guild no longer supports tags. Only treat
   * `true` as a reason to render the tag.
   */
  identity_enabled?: boolean | null
  /** The text of the user's server tag. At most four characters. */
  tag?: string | null
  /**
   * The server tag badge hash.
   *
   * @remarks
   * The CDN route for it is keyed by guild rather than by user, so rendering the badge
   * needs `identity_guild_id` as well as this hash.
   */
  badge?: string | null
}

/**
 * A connection between a Discord account and an external service.
 */
export interface APIConnection {
  /** The ID on the external service. */
  id: string
  /** The username on the external service. */
  name: string
  /** The service, for example `github` or `twitch`. */
  type: string
  /** Whether the connection has been revoked. */
  revoked?: boolean
  /** Whether the connection is verified. */
  verified: boolean
  /** Whether Discord syncs friends over this connection. */
  friend_sync: boolean
  /** Whether activity from this connection is shown as presence. */
  show_activity: boolean
  /** Whether the connection has a corresponding third-party OAuth2 token. */
  two_way_link: boolean
  /** Whether the connection is visible on the user's profile. */
  visibility: number
}
