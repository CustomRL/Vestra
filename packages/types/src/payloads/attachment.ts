import type { ISO8601Timestamp, Snowflake } from '../globals.js'
import type { APIUser } from './user.js'

/**
 * Files attached to a message.
 */

/**
 * A file attached to a message.
 */
export interface APIAttachment {
  /** The attachment's ID. */
  id: Snowflake
  /** The name of the attached file. */
  filename: string
  /** The title of the file, shown in place of the filename when set. */
  title?: string
  /** A description of the file, used as alt text, up to 1024 characters. */
  description?: string
  /** The attachment's media type. */
  content_type?: string
  /** The file's size in bytes. */
  size: number
  /** The source URL of the file. */
  url: string
  /** A proxied URL of the file. */
  proxy_url: string
  /** The image height, for images. */
  height?: number | null
  /** The image width, for images. */
  width?: number | null
  /** Whether the attachment is a voice message recording. */
  ephemeral?: boolean
  /** The duration of a voice message, in seconds. */
  duration_secs?: number
  /** A base64 waveform summary of a voice message. */
  waveform?: string
  /** The attachment's flags. A bit set of `AttachmentFlags`. */
  flags?: number
  /**
   * A compact thumbhash of the image, for rendering a blurred preview before it loads.
   *
   * @remarks
   * Base64. Decode with a thumbhash implementation; it is not a normal image.
   */
  placeholder?: string
  /** Which thumbhash version `placeholder` uses. */
  placeholder_version?: number
  /** When the clip was recorded. Only on stream clips. */
  clip_created_at?: ISO8601Timestamp
  /** The users visible in the clip. Only on stream clips. */
  clip_participants?: APIUser[]
  /** The application that was being streamed. Only on stream clips. */
  application?: APIAttachmentApplication
}

/**
 * The application a stream clip was captured from.
 *
 * @remarks
 * A partial application object; Discord does not document which subset appears here, so
 * only the fields consistently observed are modelled.
 */
export interface APIAttachmentApplication {
  /** The application's ID. */
  id: Snowflake
  /** The application's name. */
  name: string
  /** The application's icon hash. */
  icon: string | null
  /** The application's description. */
  description: string
}
