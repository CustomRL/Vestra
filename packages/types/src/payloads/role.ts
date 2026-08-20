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
  /**
   * The role's full colour definition, covering the gradient and holographic styles.
   *
   * @remarks
   * This is the field to read and to send; `color` is Discord's deprecated single-colour
   * predecessor and carries the same value as `colors.primary_color`. It cannot express a
   * gradient or a holographic role at all, so on any role using those styles `color`
   * describes only part of the appearance. Discord still returns `color` on every role and
   * still accepts it on requests, but where an endpoint takes both, `colors` is the one to
   * populate.
   *
   * Always sent, including for roles with no colour, where `colors.primary_color` is `0`.
   */
  colors: APIRoleColors
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
 * The colours applied to a role.
 *
 * @remarks
 * Which style a role uses is implied by which fields are non-null rather than stated:
 * `primary_color` alone is a flat colour, `primary_color` with `secondary_color` is a
 * gradient between the two, and all three set is the holographic style.
 *
 * `secondary_color` and `tertiary_color` are only non-null in guilds with the
 * `ENHANCED_ROLE_COLORS` feature. Everywhere else Discord sends them as `null`, so testing
 * for a gradient means testing for `null`, not for the field's presence.
 *
 * The holographic palette is fixed: sending `tertiary_color` makes Discord overwrite all
 * three with `primary_color: 11127295`, `secondary_color: 16759788` and
 * `tertiary_color: 16761760`, whatever was supplied.
 */
export interface APIRoleColors {
  /**
   * The role's primary colour as an integer representation of a hex code.
   *
   * @remarks
   * `0` means no colour. A role with no colour is skipped when Discord works out which of
   * a member's roles supplies their displayed colour, rather than colouring them black.
   */
  primary_color: number
  /** The second colour of a gradient role, or `null` if the role is not a gradient. */
  secondary_color: number | null
  /**
   * The third colour, which turns a gradient into the holographic style, or `null` if the
   * role is not holographic.
   */
  tertiary_color: number | null
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
