import type { ISO8601Timestamp } from '../globals.js'
import type { EmbedType } from '../enums/message.js'

/**
 * Rich content attached to a message.
 *
 * @remarks
 * A message may carry up to 10 embeds, and their combined character count across all
 * `title`, `description`, field name/value, `footer.text` and `author.name` values must
 * not exceed 6000. Discord rejects the whole message if it does, so a library that
 * silently truncates is doing the user a disservice — Vestra sends what it is given and
 * surfaces the API error.
 */
export interface APIEmbed {
  /** The embed's title, up to 256 characters. */
  title?: string
  /**
   * The embed's type.
   *
   * @deprecated Discord considers this legacy; it is only meaningful on embeds Discord
   * generated itself from a link. Do not set it when sending.
   */
  type?: EmbedType
  /** The embed's description, up to 4096 characters. */
  description?: string
  /** A URL that the title links to. */
  url?: string
  /** A timestamp shown in the embed's footer. */
  timestamp?: ISO8601Timestamp
  /** The colour of the embed's left border, as an integer representation of a hex code. */
  color?: number
  /** Footer information. */
  footer?: APIEmbedFooter
  /** The embed's main image. */
  image?: APIEmbedImage
  /** The embed's thumbnail, shown top-right. */
  thumbnail?: APIEmbedThumbnail
  /** Video information. Only present on embeds Discord generated. */
  video?: APIEmbedVideo
  /** Provider information. Only present on embeds Discord generated. */
  provider?: APIEmbedProvider
  /** Author information, shown above the title. */
  author?: APIEmbedAuthor
  /** Up to 25 fields of additional information. */
  fields?: APIEmbedField[]
}

/**
 * The footer of an embed.
 */
export interface APIEmbedFooter {
  /** The footer text, up to 2048 characters. */
  text: string
  /** A URL for the small footer icon. Supports `http`, `https` and `attachment`. */
  icon_url?: string
  /** A proxied version of `icon_url`. Ignored when sending. */
  proxy_icon_url?: string
}

/**
 * Fields shared by an embed's image, thumbnail and video.
 */
export interface APIEmbedMedia {
  /** The source URL. Supports `http`, `https` and `attachment`. */
  url: string
  /** A proxied version of `url`. Ignored when sending. */
  proxy_url?: string
  /** The height in pixels. Ignored when sending. */
  height?: number
  /** The width in pixels. Ignored when sending. */
  width?: number
}

/** The main image of an embed. */
export type APIEmbedImage = APIEmbedMedia

/** The thumbnail of an embed. */
export type APIEmbedThumbnail = APIEmbedMedia

/** The video of an embed. Only present on embeds Discord generated. */
export interface APIEmbedVideo extends Omit<APIEmbedMedia, 'url'> {
  /** The source URL. Optional, unlike on images. */
  url?: string
}

/**
 * The provider of an embed. Only present on embeds Discord generated.
 */
export interface APIEmbedProvider {
  /** The provider's name. */
  name?: string
  /** The provider's URL. */
  url?: string
}

/**
 * The author line of an embed.
 */
export interface APIEmbedAuthor {
  /** The author's name, up to 256 characters. */
  name: string
  /** A URL that the name links to. Only supports `http` and `https`. */
  url?: string
  /** A URL for the small author icon. Supports `http`, `https` and `attachment`. */
  icon_url?: string
  /** A proxied version of `icon_url`. Ignored when sending. */
  proxy_icon_url?: string
}

/**
 * A name/value pair in an embed.
 */
export interface APIEmbedField {
  /** The field's name, up to 256 characters. */
  name: string
  /** The field's value, up to 1024 characters. */
  value: string
  /** Whether the field renders beside the preceding field rather than below it. */
  inline?: boolean
}
