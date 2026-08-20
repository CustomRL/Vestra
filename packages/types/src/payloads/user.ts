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
