import type { APISticker, APIStickerPack } from '../payloads/sticker.js'

/**
 * Sticker request bodies and results.
 *
 * @remarks
 * **Creating one is the only route in the API whose fields are form parts rather than JSON.**
 * Every other multipart endpoint takes its JSON in a `payload_json` part beside the files;
 * this one takes `name`, `description` and `tags` as three separate text parts. Sending them
 * as `payload_json` gets a validation error naming fields the caller did think it sent, which
 * is why {@link RESTPostAPIGuildStickerFormFields} is named for what it is rather than called
 * a JSON body.
 */

/** The result of `GET /stickers/{sticker.id}`. */
export type RESTGetAPIStickerResult = APISticker

/**
 * The result of `GET /sticker-packs`.
 *
 * @remarks
 * Wrapped in an object, like the application emoji listing and unlike most of the API.
 */
export interface RESTGetAPIStickerPacksResult {
  /** The packs Discord ships. */
  sticker_packs: APIStickerPack[]
}

/** The result of `GET /sticker-packs/{pack.id}`. */
export type RESTGetAPIStickerPackResult = APIStickerPack

/** The result of `GET /guilds/{guild.id}/stickers`. */
export type RESTGetAPIGuildStickersResult = APISticker[]

/** The result of `GET /guilds/{guild.id}/stickers/{sticker.id}`. */
export type RESTGetAPIGuildStickerResult = APISticker

/**
 * The text parts of `POST /guilds/{guild.id}/stickers`, sent beside the file.
 *
 * @remarks
 * Not a JSON body. See this module's remarks for why that distinction is load-bearing.
 *
 * The file itself is a PNG, APNG, GIF or Lottie JSON of at most 512 KiB, and Lottie is
 * accepted only from a guild with the `VERIFIED` or `PARTNERED` feature.
 */
export interface RESTPostAPIGuildStickerFormFields {
  /** The sticker's name, 2 to 30 characters. */
  name: string
  /** The description, empty or 2 to 100 characters. */
  description: string
  /** Autocomplete keywords, at most 200 characters. Required, and may not be empty. */
  tags: string
}

/** The result of `POST /guilds/{guild.id}/stickers`. */
export type RESTPostAPIGuildStickerResult = APISticker

/**
 * `PATCH /guilds/{guild.id}/stickers/{sticker.id}`
 *
 * @remarks
 * JSON, unlike the create route, because there is no route for replacing the image — the
 * asset is fixed at upload and only the metadata can be edited afterwards.
 */
export interface RESTPatchAPIGuildStickerJSONBody {
  /** A new name. */
  name?: string
  /** A new description, or `null` to clear it. */
  description?: string | null
  /** New autocomplete keywords. */
  tags?: string
}

/** The result of `PATCH /guilds/{guild.id}/stickers/{sticker.id}`. */
export type RESTPatchAPIGuildStickerResult = APISticker
