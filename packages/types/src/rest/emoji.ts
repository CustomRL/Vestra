import type { Snowflake } from '../globals.js'
import type { APIEmoji } from '../payloads/emoji.js'

/**
 * Emoji request bodies and results.
 *
 * @remarks
 * Two resources with nearly the same shape and very different limits. A **guild** emoji
 * counts against the guild's slot allowance, is usable only by members of that guild, and can
 * be restricted to roles. An **application** emoji has no slot limit worth worrying about, is
 * usable by the bot in every guild it is in, and has no role restriction at all — which is why
 * the application bodies are the guild ones minus `roles` rather than an alias of them.
 *
 * `image` is a data URI, not a URL and not bytes: `data:image/png;base64,…`. Discord will not
 * fetch a remote image on the caller's behalf.
 */

/** The result of `GET /guilds/{guild.id}/emojis`. */
export type RESTGetAPIGuildEmojisResult = APIEmoji[]

/** The result of `GET /guilds/{guild.id}/emojis/{emoji.id}`. */
export type RESTGetAPIGuildEmojiResult = APIEmoji

/**
 * `POST /guilds/{guild.id}/emojis`
 */
export interface RESTPostAPIGuildEmojiJSONBody {
  /** The emoji's name. */
  name: string
  /** The image, as a data URI. At most 256 KiB. */
  image: string
  /** Roles allowed to use it. Omit to allow everybody. */
  roles?: Snowflake[]
}

/** The result of `POST /guilds/{guild.id}/emojis`. */
export type RESTPostAPIGuildEmojiResult = APIEmoji

/**
 * `PATCH /guilds/{guild.id}/emojis/{emoji.id}`
 *
 * @remarks
 * `roles` is a whole replacement rather than an addition, and `null` clears the restriction
 * entirely. There is no route for editing an emoji's image — replacing the picture means
 * deleting the emoji and creating another, which changes its ID and breaks every message
 * that used it.
 */
export interface RESTPatchAPIGuildEmojiJSONBody {
  /** A new name. */
  name?: string
  /** The complete new role list, or `null` to let everybody use it. */
  roles?: Snowflake[] | null
}

/** The result of `PATCH /guilds/{guild.id}/emojis/{emoji.id}`. */
export type RESTPatchAPIGuildEmojiResult = APIEmoji

/**
 * The result of `GET /applications/{application.id}/emojis`.
 *
 * @remarks
 * **An object rather than an array**, unlike every other list route in the API. Discord
 * wrapped this one and did not wrap the guild equivalent, so the shapes genuinely differ and
 * a caller cannot treat them interchangeably.
 */
export interface RESTGetAPIApplicationEmojisResult {
  /** The application's emojis. */
  items: APIEmoji[]
}

/** The result of `GET /applications/{application.id}/emojis/{emoji.id}`. */
export type RESTGetAPIApplicationEmojiResult = APIEmoji

/**
 * `POST /applications/{application.id}/emojis`
 *
 * @remarks
 * No `roles`: an application emoji belongs to the bot rather than to a guild, so there is no
 * role in scope to restrict it to.
 */
export interface RESTPostAPIApplicationEmojiJSONBody {
  /** The emoji's name. */
  name: string
  /** The image, as a data URI. At most 256 KiB. */
  image: string
}

/** The result of `POST /applications/{application.id}/emojis`. */
export type RESTPostAPIApplicationEmojiResult = APIEmoji

/**
 * `PATCH /applications/{application.id}/emojis/{emoji.id}`
 */
export interface RESTPatchAPIApplicationEmojiJSONBody {
  /** A new name. */
  name?: string
}

/** The result of `PATCH /applications/{application.id}/emojis/{emoji.id}`. */
export type RESTPatchAPIApplicationEmojiResult = APIEmoji
