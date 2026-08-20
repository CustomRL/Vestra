import type { Permissions, Snowflake } from '../globals.js'

/**
 * A set of permissions attached to a group of guild members.
 */
export interface APIRole {
  /** The role's ID. */
  id: Snowflake
  /** The role's name. */
  name: string
  /** The role's colour as an integer representation of a hex code. `0` means no colour. */
  color: number
  /** Whether members with this role are listed separately in the member sidebar. */
  hoist: boolean
  /** The role's icon hash. */
  icon?: string | null
  /** The role's unicode emoji, shown in place of an icon. */
  unicode_emoji?: string | null
  /**
   * The role's position.
   *
   * @remarks
   * Higher is more senior. Positions are not guaranteed unique — several roles can share
   * one, in which case Discord breaks the tie by ID.
   */
  position: number
  /** The role's permission bit set, as a decimal string. */
  permissions: Permissions
  /** Whether the role is managed by an integration and so cannot be edited. */
  managed: boolean
  /** Whether the role can be mentioned by anyone. */
  mentionable: boolean
  /** What this role is attached to, if it is managed. */
  tags?: APIRoleTags
  /** The role's flags. A bit set of {@link RoleFlags}. */
  flags: number
}

/**
 * What a managed role is attached to.
 *
 * @remarks
 * The boolean-ish fields here are Discord's "null means true" pattern: `premium_subscriber`
 * is present and `null` when the role *is* the booster role, and absent otherwise. It is
 * never `true`. Test with `'premium_subscriber' in tags`, not for truthiness.
 */
export interface APIRoleTags {
  /** The ID of the bot this role belongs to. */
  bot_id?: Snowflake
  /** The ID of the integration this role belongs to. */
  integration_id?: Snowflake
  /** Present and `null` if this is the guild's booster role. */
  premium_subscriber?: null
  /** The ID of the subscription SKU and listing this role is purchasable through. */
  subscription_listing_id?: Snowflake
  /** Present and `null` if this role is available for purchase. */
  available_for_purchase?: null
  /** Present and `null` if this role is a guild's linked role. */
  guild_connections?: null
}
