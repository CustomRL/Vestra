import type { APIPartialEmoji } from './emoji.js'

/**
 * Reactions on a message.
 */

/**
 * A reaction on a message.
 */
export interface APIReaction {
  /** The number of times this emoji has been used. */
  count: number
  /** A breakdown of the count into normal and super reactions. */
  count_details: APIReactionCountDetails
  /** Whether the current user reacted with this emoji. */
  me: boolean
  /** Whether the current user super-reacted with this emoji. */
  me_burst: boolean
  /** The emoji, in its partial form. */
  emoji: APIPartialEmoji
  /** Hex colours used for the super-reaction animation. */
  burst_colors: string[]
}

/**
 * How a reaction's count splits between normal and super reactions.
 */
export interface APIReactionCountDetails {
  /** The number of super reactions. */
  burst: number
  /** The number of normal reactions. */
  normal: number
}
