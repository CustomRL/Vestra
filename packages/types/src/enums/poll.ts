/**
 * Poll-related enumerations.
 */

/**
 * The layout a poll is rendered with.
 *
 * @remarks
 * Discord has only ever shipped one layout, so every poll sent or received today has
 * `layout_type` of `Default`. The field exists so further layouts can be introduced
 * without a breaking change; treat an unrecognised value as a poll you cannot render
 * rather than as an error.
 */
export const PollLayoutType = {
  /** The only layout Discord currently renders. */
  Default: 1,
} as const

/**
 * A poll layout.
 */
export type PollLayoutType = (typeof PollLayoutType)[keyof typeof PollLayoutType]
