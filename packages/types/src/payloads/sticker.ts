import type { Snowflake } from '../globals.js'
import type { StickerFormatType, StickerType } from '../enums/sticker.js'
import type { APIUser } from './user.js'

/**
 * A sticker that can be sent in a message.
 *
 * @remarks
 * One shape covers two quite different things, so most fields are conditional on `type`:
 *
 * - `Standard` stickers live in Discord's own Nitro packs. They carry `pack_id` and
 *   `sort_value`, and never carry `guild_id`, `user` or `available`.
 * - `Guild` stickers are uploaded to a single guild. They carry `guild_id` and
 *   `available`, and carry `user` only when the requesting bot has
 *   `CreateGuildExpressions` or `ManageGuildExpressions`.
 *
 * Nothing in the type system enforces that split — check `type` before reading a field
 * that only one kind of sticker has.
 */
export interface APISticker {
  /** The sticker's ID. Also the CDN filename for its asset. */
  id: Snowflake
  /** The ID of the pack the sticker belongs to. Standard stickers only. */
  pack_id?: Snowflake
  /** The sticker's name. */
  name: string
  /** The sticker's description. */
  description: string | null
  /**
   * Autocomplete and suggestion tags, at most 200 characters.
   *
   * @remarks
   * A single string, not an array. Standard stickers use a comma-separated list of
   * keywords by convention, but that is only a convention and nothing guarantees it.
   * The client sets this to a name derived from an emoji when creating or modifying a
   * guild sticker.
   */
  tags: string
  /** Whether the sticker is a standard pack sticker or a guild upload. */
  type: StickerType
  /** The format the sticker's asset is stored in. */
  format_type: StickerFormatType
  /**
   * Whether the sticker can be used. Guild stickers only.
   *
   * @remarks
   * Goes `false` when the guild loses boost levels and drops below the sticker slots it
   * was using. The sticker is not deleted — it stays on the guild, unusable, and becomes
   * available again if the guild regains the levels.
   */
  available?: boolean
  /** The ID of the guild that owns the sticker. Guild stickers only. */
  guild_id?: Snowflake
  /**
   * The user who uploaded the sticker. Guild stickers only.
   *
   * @remarks
   * Present only when the request was made with `CreateGuildExpressions` or
   * `ManageGuildExpressions`; absent otherwise, including on gateway payloads.
   */
  user?: APIUser
  /** The sticker's sort order within its pack. Standard stickers only. */
  sort_value?: number
}

/**
 * The reduced sticker form sent on messages.
 *
 * @remarks
 * The smallest amount of data needed to render a sticker. This is what arrives in a
 * message's `sticker_items`, so a message alone never tells you whether a sticker is
 * standard or guild-owned, nor whether it is still available — fetch the full
 * {@link APISticker} if you need that.
 */
export interface APIStickerItem {
  /** The sticker's ID. */
  id: Snowflake
  /** The sticker's name. */
  name: string
  /** The format the sticker's asset is stored in. */
  format_type: StickerFormatType
}

/**
 * A pack of standard stickers.
 *
 * @remarks
 * Packs exist only for standard stickers; guild stickers are never part of one.
 */
export interface APIStickerPack {
  /** The pack's ID. */
  id: Snowflake
  /** The stickers in the pack. */
  stickers: APISticker[]
  /** The pack's name. */
  name: string
  /** The ID of the pack's SKU. */
  sku_id: Snowflake
  /** The ID of the sticker shown as the pack's icon. */
  cover_sticker_id?: Snowflake
  /** The pack's description. */
  description: string
  /**
   * The asset ID of the pack's banner image.
   *
   * @remarks
   * A snowflake, not an image hash. The banner is served from the store assets of
   * application `710982414301790216` rather than from a path under the pack's own ID.
   */
  banner_asset_id?: Snowflake
}
