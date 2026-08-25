import type { Snowflake } from '../globals.js'
import type { APIAttachment } from '../payloads/attachment.js'
import type { APIMessageComponent } from '../payloads/component.js'
import type { APIEmbed } from '../payloads/embed.js'
import type { APIMessage } from '../payloads/message.js'
import type { APIWebhook } from '../payloads/webhook.js'
import type { APIAllowedMentions } from './channel.js'

/**
 * Webhook request bodies and results.
 *
 * @remarks
 * The token routes are the reason this file is not simply part of `channel.ts`. A webhook
 * carries its own credential, and `GET|PATCH|DELETE /webhooks/{id}/{token}` are
 * **unauthenticated** — they take no bot token and must not be sent one, exactly like the
 * interaction callback routes. The bodies are shared with the authorised forms; what differs
 * is the credential and what comes back, since a token-fetched webhook omits `user` so the
 * route cannot leak its creator.
 */

/** `POST /channels/{channel.id}/webhooks` */
export interface RESTPostAPIChannelWebhookJSONBody {
  /** The webhook's name, 1 to 80 characters. `clyde` and `discord` are rejected. */
  name: string
  /** The default avatar, as a data URI. */
  avatar?: string | null
}

/** `PATCH /webhooks/{webhook.id}` */
export interface RESTPatchAPIWebhookJSONBody {
  /** The webhook's name. */
  name?: string
  /** The default avatar, as a data URI. */
  avatar?: string | null
  /** Move the webhook to a different channel. Not accepted on the token route. */
  channel_id?: Snowflake
}

/**
 * `POST /webhooks/{webhook.id}/{webhook.token}`
 *
 * @remarks
 * One of `content`, `embeds`, `components`, `files` or `poll` is required, which no type can
 * express usefully — Discord answers an empty execute with `50006`.
 *
 * `username` and `avatar_url` override the webhook's defaults **per message**, which is the
 * capability a bot cannot get any other way.
 */
export interface RESTPostAPIWebhookExecuteJSONBody {
  /** The message content, up to 2000 characters. */
  content?: string
  /** Override the webhook's name for this message. */
  username?: string
  /** Override the webhook's avatar for this message. */
  avatar_url?: string
  /** Whether to read the message aloud. */
  tts?: boolean
  /** Rich embeds, up to 10. */
  embeds?: APIEmbed[]
  /** Which mentions in the content actually ping. */
  allowed_mentions?: APIAllowedMentions
  /** Interactive components. */
  components?: APIMessageComponent[]
  /** Attachment metadata, paired with uploaded files by index. */
  attachments?: APIAttachment[]
  /** Message flags, as a bit set. */
  flags?: number
  /** Post into a thread of the webhook's channel. */
  thread_id?: Snowflake
  /** Name a thread to create, for a webhook on a forum channel. */
  thread_name?: string
}

/**
 * `POST /webhooks/{webhook.id}/{webhook.token}?wait=true`
 *
 * @remarks
 * Without `wait`, Discord answers `204` and the message is **not** returned — the request
 * only reports that it was accepted. `wait=true` costs a round trip and is the only way to
 * learn the message's ID, which is what editing or deleting it later needs.
 */
export interface RESTPostAPIWebhookExecuteQuery {
  /** Wait for the message to be created and return it. */
  wait?: boolean
  /** Post into this thread of the webhook's channel. */
  thread_id?: Snowflake
}

/** The result of `POST /channels/{channel.id}/webhooks`. */
export type RESTPostAPIChannelWebhookResult = APIWebhook

/** The result of `GET /channels/{channel.id}/webhooks`. */
export type RESTGetAPIChannelWebhooksResult = APIWebhook[]

/** The result of `GET /guilds/{guild.id}/webhooks`. */
export type RESTGetAPIGuildWebhooksResult = APIWebhook[]

/** The result of `GET /webhooks/{webhook.id}`. */
export type RESTGetAPIWebhookResult = APIWebhook

/** The result of `PATCH /webhooks/{webhook.id}`. */
export type RESTPatchAPIWebhookResult = APIWebhook

/**
 * The result of executing a webhook.
 *
 * @remarks
 * `undefined` unless `wait=true` was asked for, because Discord answers `204` otherwise.
 */
export type RESTPostAPIWebhookExecuteResult = APIMessage | undefined
