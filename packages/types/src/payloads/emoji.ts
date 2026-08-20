import type { Snowflake } from '../globals.js'
import type { APIUser } from './user.js'

/**
 * A custom guild emoji.
 */
export interface APIEmoji {
  /** The emoji's ID. `null` for a standard unicode emoji. */
  id: Snowflake | null
  /**
   * The emoji's name.
   *
   * @remarks
   * `null` only in reaction objects for an emoji that has since been deleted.
   */
  name: string | null
  /** The IDs of roles allowed to use this emoji. */
  roles?: Snowflake[]
  /** The user who uploaded the emoji. Requires `ManageGuildExpressions`. */
  user?: APIUser
  /** Whether the emoji must be wrapped in colons to be used. */
  require_colons?: boolean
  /** Whether the emoji is managed by an integration. */
  managed?: boolean
  /**
   * Whether the emoji is animated.
   *
   * @remarks
   * Determines the `a:` prefix in the mention form and the CDN file extension, so it must
   * be carried through anywhere an emoji is rendered.
   */
  animated?: boolean
  /** Whether the emoji is usable. `false` when a guild has lost boost levels. */
  available?: boolean
}

/**
 * The reduced emoji form used in reactions and components.
 *
 * @remarks
 * Discord sends only these three fields in most embedded positions. For a unicode emoji,
 * `id` is `null` and `name` is the character itself.
 */
export interface APIPartialEmoji {
  /** The emoji's ID, or `null` for a standard unicode emoji. */
  id: Snowflake | null
  /** The emoji's name, or the unicode character. */
  name: string | null
  /** Whether the emoji is animated. */
  animated?: boolean
}
