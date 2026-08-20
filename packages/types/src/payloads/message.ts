import type { ISO8601Timestamp, Snowflake } from '../globals.js'
import type { ChannelType } from '../enums/channel.js'
import type { MessageReferenceType, MessageType } from '../enums/message.js'
import type { InteractionType } from '../enums/interaction.js'
import type { APIMessageComponent } from './component.js'
import type { APIEmbed } from './embed.js'
import type { APIPartialEmoji } from './emoji.js'
import type { APIGuildMemberPartial } from './member.js'
import type { APIThreadChannel } from './channel.js'
import type { APIUser } from './user.js'

/**
 * A message in a channel.
 */
export interface APIMessage {
  /** The message's ID. */
  id: Snowflake
  /** The ID of the channel the message was sent in. */
  channel_id: Snowflake
  /**
   * The author of the message.
   *
   * @remarks
   * Not guaranteed to be a real user. For webhook messages this is a synthetic object
   * carrying the webhook's ID in `id`, and it will not exist as a user in any guild.
   * Check `webhook_id` before treating the author as fetchable.
   */
  author: APIUser
  /**
   * The message's text content.
   *
   * @remarks
   * Empty string unless the application has the `MessageContent` privileged intent, or
   * the message is in a DM, mentions the bot, or was sent by the bot itself. An empty
   * string here usually means a missing intent rather than an empty message.
   */
  content: string
  /** When the message was sent. */
  timestamp: ISO8601Timestamp
  /** When the message was last edited, or `null` if it never was. */
  edited_timestamp: ISO8601Timestamp | null
  /** Whether the message was sent as text-to-speech. */
  tts: boolean
  /** Whether the message mentions everyone. */
  mention_everyone: boolean
  /**
   * The users specifically mentioned in the message.
   *
   * @remarks
   * Does not include users covered by a role mention or by `@everyone`.
   */
  mentions: APIUser[]
  /** The IDs of roles specifically mentioned in the message. */
  mention_roles: Snowflake[]
  /** Channels specifically mentioned, cross-guild only. */
  mention_channels?: APIChannelMention[]
  /** Files attached to the message. */
  attachments: APIAttachment[]
  /** Rich content attached to the message. */
  embeds: APIEmbed[]
  /** Reactions on the message. */
  reactions?: APIReaction[]
  /** A nonce echoed back for validating that a message was sent. */
  nonce?: string | number
  /** Whether the message is pinned in its channel. */
  pinned: boolean
  /** The ID of the webhook that sent the message, if it was webhook-generated. */
  webhook_id?: Snowflake
  /** The message's type. */
  type: MessageType
  /** The ID of the guild the message was sent in. */
  guild_id?: Snowflake
  /**
   * The author's guild membership.
   *
   * @remarks
   * Present on messages from a guild channel, and never carries a `user` — the author is
   * already at the top level.
   */
  member?: APIGuildMemberPartial
  /** The message's flags. A bit set of `MessageFlags`. */
  flags?: number
  /** The source of a crosspost, a reply, a pin, or a forward. */
  message_reference?: APIMessageReference
  /**
   * The message being replied to.
   *
   * @remarks
   * `null` when the referenced message was deleted; absent when Discord did not attempt
   * to resolve it. The two cases mean different things and must not be conflated.
   */
  referenced_message?: APIMessage | null
  /** Metadata about the interaction that produced this message. */
  interaction_metadata?: APIMessageInteractionMetadata
  /** The thread started from this message, with the current user's thread member. */
  thread?: APIThreadChannel
  /** Interactive components attached to the message. */
  components?: APIMessageComponent[]
  /** Approximate position of the message in a thread. */
  position?: number
  /** The IDs of application integrations owning the resources in the message. */
  application_id?: Snowflake
}

/**
 * A channel mentioned across guilds.
 */
export interface APIChannelMention {
  /** The channel's ID. */
  id: Snowflake
  /** The ID of the guild containing the channel. */
  guild_id: Snowflake
  /** The channel's type. */
  type: ChannelType
  /** The channel's name. */
  name: string
}

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
}

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

/**
 * A pointer from one message to another.
 */
export interface APIMessageReference {
  /** What the reference means. Defaults to a reply when absent. */
  type?: MessageReferenceType
  /** The ID of the originating message. */
  message_id?: Snowflake
  /** The ID of the originating message's channel. */
  channel_id?: Snowflake
  /** The ID of the originating message's guild. */
  guild_id?: Snowflake
  /**
   * Whether to error if the referenced message does not exist.
   *
   * @remarks
   * Send-only, and defaults to `true`. Set it to `false` to reply to a message that may
   * have been deleted rather than having the send fail.
   */
  fail_if_not_exists?: boolean
}

/**
 * Metadata about the interaction that produced a message.
 */
export interface APIMessageInteractionMetadata {
  /** The interaction's ID. */
  id: Snowflake
  /** The interaction's type. */
  type: InteractionType
  /** The user who triggered the interaction. */
  user: APIUser
  /** The IDs of installation contexts the interaction was authorised for. */
  authorizing_integration_owners: Record<string, Snowflake>
  /** The ID of the original response message, for follow-ups. */
  original_response_message_id?: Snowflake
  /** The ID of the message containing the component that was interacted with. */
  interacted_message_id?: Snowflake
}
