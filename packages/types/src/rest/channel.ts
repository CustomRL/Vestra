import type { Snowflake } from '../globals.js'
import type { APIChannel, APIOverwrite } from '../payloads/channel.js'
import type { APIMessageComponent } from '../payloads/component.js'
import type { APIEmbed } from '../payloads/embed.js'
import type { APIAttachment, APIMessage, APIMessageReference } from '../payloads/message.js'

/**
 * Controls which mentions in a message actually ping.
 *
 * @remarks
 * Without this, any user content echoed by a bot can mass-ping a guild. Vestra does not
 * silently inject a default — that would be a surprising behaviour change from the API —
 * so bots relaying user input should set `parse: []` explicitly.
 */
export interface APIAllowedMentions {
  /** Which broad categories of mention are permitted to ping. */
  parse?: ('everyone' | 'roles' | 'users')[]
  /** Role IDs permitted to ping, up to 100. */
  roles?: Snowflake[]
  /** User IDs permitted to ping, up to 100. */
  users?: Snowflake[]
  /** Whether the author of the message being replied to is pinged. Defaults to `true`. */
  replied_user?: boolean
}

/**
 * An attachment as described when sending or editing a message.
 */
export interface APIAttachmentUpload {
  /** The index of the corresponding file in the multipart body. */
  id: number | string
  /** The filename. */
  filename?: string
  /** Alt text for the file, up to 1024 characters. */
  description?: string
  /** The title shown in place of the filename. */
  title?: string
}

/**
 * `POST /channels/{channel.id}/messages`
 *
 * @remarks
 * At least one of `content`, `embeds`, `components`, `files` or `poll` must be present.
 * The API rejects a message that would render as empty.
 */
export interface RESTPostAPIChannelMessageJSONBody {
  /** The message contents, up to 2000 characters. */
  content?: string
  /** A value echoed back in the resulting `MESSAGE_CREATE` for send deduplication. */
  nonce?: string | number
  /** Whether this is a text-to-speech message. */
  tts?: boolean
  /** Rich content, up to 10 embeds totalling 6000 characters. */
  embeds?: APIEmbed[]
  /** Which mentions are permitted to ping. */
  allowed_mentions?: APIAllowedMentions
  /** The message to reply to or forward. */
  message_reference?: APIMessageReference
  /** Interactive components. */
  components?: APIMessageComponent[]
  /** IDs of stickers to send, up to 3. */
  sticker_ids?: Snowflake[]
  /** Descriptions of the files in the multipart body. */
  attachments?: APIAttachmentUpload[]
  /** The message's flags. Only `SuppressEmbeds` and `SuppressNotifications` are settable. */
  flags?: number
  /** Whether to fail if any mentioned role or user cannot be pinged. */
  enforce_nonce?: boolean
}

/**
 * `PATCH /channels/{channel.id}/messages/{message.id}`
 *
 * @remarks
 * Every field is optional, and omitting one leaves it unchanged — but passing `null`
 * clears it. Notably, editing a message with `attachments` omitted keeps its existing
 * attachments, while passing `[]` removes them all.
 */
export interface RESTPatchAPIChannelMessageJSONBody {
  /** The new contents. */
  content?: string | null
  /** The new embeds. */
  embeds?: APIEmbed[] | null
  /** The new flags. */
  flags?: number | null
  /** Which mentions are permitted to ping. */
  allowed_mentions?: APIAllowedMentions | null
  /** The new components. */
  components?: APIMessageComponent[] | null
  /** Attachments to keep, plus descriptions of newly uploaded files. */
  attachments?: (APIAttachment | APIAttachmentUpload)[]
}

/**
 * `GET /channels/{channel.id}/messages`
 *
 * @remarks
 * `around`, `before` and `after` are mutually exclusive; passing more than one is an
 * error rather than a silent precedence rule.
 */
export interface RESTGetAPIChannelMessagesQuery {
  /** Get messages around this ID. */
  around?: Snowflake
  /** Get messages before this ID. */
  before?: Snowflake
  /** Get messages after this ID. */
  after?: Snowflake
  /** How many messages to return, from 1 to 100. Defaults to 50. */
  limit?: number
}

/** The result of `GET /channels/{channel.id}/messages`. */
export type RESTGetAPIChannelMessagesResult = APIMessage[]

/** The result of `GET /channels/{channel.id}/messages/{message.id}`. */
export type RESTGetAPIChannelMessageResult = APIMessage

/** The result of `POST /channels/{channel.id}/messages`. */
export type RESTPostAPIChannelMessageResult = APIMessage

/** The result of `PATCH /channels/{channel.id}/messages/{message.id}`. */
export type RESTPatchAPIChannelMessageResult = APIMessage

/**
 * `POST /channels/{channel.id}/messages/bulk-delete`
 *
 * @remarks
 * Fails for any message older than two weeks, and for fewer than 2 or more than 100 IDs.
 */
export interface RESTPostAPIChannelMessagesBulkDeleteJSONBody {
  /** The IDs of the messages to delete, from 2 to 100. */
  messages: Snowflake[]
}

/**
 * `PATCH /channels/{channel.id}`
 */
export interface RESTPatchAPIChannelJSONBody {
  /** The channel's new name, from 1 to 100 characters. */
  name?: string
  /** The channel's new type. Only convertible between text and announcement. */
  type?: number
  /** The channel's new position. */
  position?: number | null
  /** The channel's new topic. */
  topic?: string | null
  /** Whether the channel is age-restricted. */
  nsfw?: boolean | null
  /** Seconds a user must wait between messages, from 0 to 21600. */
  rate_limit_per_user?: number | null
  /** The voice channel's bitrate. */
  bitrate?: number | null
  /** The voice channel's user limit. */
  user_limit?: number | null
  /** The new permission overwrites. */
  permission_overwrites?: APIOverwrite[]
  /** The new parent category. */
  parent_id?: Snowflake | null
  /** The voice region, or `null` for automatic. */
  rtc_region?: string | null
  /** The camera video quality mode. */
  video_quality_mode?: number | null
  /** The default auto-archive duration for new threads. */
  default_auto_archive_duration?: number | null
  /** The channel's flags. */
  flags?: number
}

/** The result of `GET /channels/{channel.id}`. */
export type RESTGetAPIChannelResult = APIChannel

/** The result of `PATCH /channels/{channel.id}`. */
export type RESTPatchAPIChannelResult = APIChannel

/** The result of `DELETE /channels/{channel.id}`. */
export type RESTDeleteAPIChannelResult = APIChannel
