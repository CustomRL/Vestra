/**
 * Sticker-related enumerations.
 */

/**
 * Where a sticker came from.
 *
 * @remarks
 * The two types carry different fields on the sticker object: a `Standard` sticker has
 * `pack_id` and `sort_value`, a `Guild` sticker has `guild_id`, `available` and
 * (with the right permissions) `user`.
 */
export const StickerType = {
  /** An official sticker, part of a Discord-provided pack. */
  Standard: 1,
  /** A sticker uploaded to a guild for that guild's members. */
  Guild: 2,
} as const

/**
 * A sticker type.
 */
export type StickerType = (typeof StickerType)[keyof typeof StickerType]

/**
 * The file format a sticker's asset is stored in.
 *
 * @remarks
 * This decides how the asset is fetched from the CDN. `PNG` and `APNG` are both served
 * from `/stickers/{id}.png`, `Lottie` as a JSON animation document, and `GIF` from
 * `media.discordapp.net` rather than the usual CDN host. The `size` query parameter is
 * ignored on sticker assets.
 *
 * Uploading a `Lottie` sticker requires the guild to have the `VERIFIED` or `PARTNERED`
 * guild feature.
 */
export const StickerFormatType = {
  /** A static PNG image. */
  PNG: 1,
  /** An animated PNG. Still served with a `.png` extension. */
  APNG: 2,
  /** A Lottie vector animation, served as JSON rather than an image. */
  Lottie: 3,
  /** An animated GIF. */
  GIF: 4,
} as const

/**
 * A sticker format type.
 */
export type StickerFormatType = (typeof StickerFormatType)[keyof typeof StickerFormatType]
