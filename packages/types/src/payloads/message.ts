import type { APIAttachment } from './attachment.js'
import type { APIEmbed } from './embed.js'
import type { APIGuildMemberPartial } from './member.js'
import type {
  APIMessageApplication,
  APIMessageInteraction,
  APIMessageInteractionMetadata,
  APIMessageResolvedData,
} from './message-interaction.js'
import type { APIMessageComponent } from './component.js'
import type { APIMessagePurchaseNotification, APIRoleSubscriptionData } from './monetisation.js'
import type { APIPoll } from './poll.js'
import type { APIReaction } from './reaction.js'
import type { APISticker, APIStickerItem } from './sticker.js'
import type { APIThreadChannel } from './channel.js'
import type { APIUser } from './user.js'
import type { ChannelType } from '../enums/channel.js'
import type { ISO8601Timestamp, Snowflake } from '../globals.js'
import type { MessageActivityType, MessageReferenceType, MessageType } from '../enums/message.js'

/**
 * A message in a channel.
 */

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
  /**
   * The application's ID.
   *
   * @remarks
   * Present on interaction responses and on messages sent through an
   * application-owned webhook. Not to be confused with
   * `interaction_metadata.authorizing_integration_owners`, which describes installation
   * contexts rather than naming an application.
   */
  application_id?: Snowflake
  /**
   * A Rich Presence activity attached to the message.
   *
   * @remarks
   * Sent with the invite-to-play, spectate and listen-along cards a game integration
   * produces. It describes an activity the reader can join, not the author's presence.
   */
  activity?: APIMessageActivity
  /** The application a Rich Presence chat embed belongs to. */
  application?: APIMessageApplication
  /** The call this message started, in a DM or a group DM. */
  call?: APIMessageCall
  /**
   * The interaction this message is a response to.
   *
   * @deprecated Use `interaction_metadata`, which also covers component and modal
   * interactions. Discord still sends this field, so it is kept for reading old messages.
   */
  interaction?: APIMessageInteraction
  /**
   * The content of the message this one forwards.
   *
   * @remarks
   * Present when `message_reference.type` is `MessageReferenceType.Forward`, alongside the
   * `HAS_SNAPSHOT` message flag (`1 << 14`), which `MessageFlags` does not model yet.
   * Nesting is limited to one level, so the snapshot of a forwarded message never carries
   * snapshots of its own.
   */
  message_snapshots?: APIMessageSnapshot[]
  /**
   * The poll attached to the message.
   *
   * @remarks
   * Omitted entirely — not sent as an empty object — for an application without the
   * `MessageContent` privileged intent, in the same way `content` arrives empty.
   */
  poll?: APIPoll
  /**
   * What was bought, on a purchase notification message.
   *
   * @remarks
   * Accompanies message type `44`, which `MessageType` does not model yet.
   */
  purchase_notification?: APIMessagePurchaseNotification
  /** Objects referenced by the message's auto-populated select menus. */
  resolved?: APIMessageResolvedData
  /** The purchase or renewal behind a `MessageType.RoleSubscriptionPurchase` message. */
  role_subscription_data?: APIRoleSubscriptionData
  /** The stickers sent with the message, reduced to what is needed to render them. */
  sticker_items?: APIStickerItem[]
  /**
   * The stickers sent with the message.
   *
   * @deprecated Use `sticker_items`. Discord kept this field for older messages and does
   * not populate it on new ones.
   */
  stickers?: APISticker[]
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
 * A Rich Presence activity attached to a message.
 *
 * @remarks
 * Only Discord's own Rich Presence integrations produce these; an application cannot send
 * one on a normal message.
 */
export interface APIMessageActivity {
  /** What the activity invites the reader to do. */
  type: MessageActivityType
  /** The `party_id` carried by the Rich Presence event the activity came from. */
  party_id?: string
}

/**
 * A call in a DM or group DM.
 */
export interface APIMessageCall {
  /** The IDs of the users that joined the call. */
  participants: Snowflake[]
  /**
   * When the call ended.
   *
   * @remarks
   * Absent while the call is still ringing or in progress, and `null` on a call that was
   * never answered, so a running call cannot be detected by the key's presence alone.
   */
  ended_timestamp?: ISO8601Timestamp | null
}

/**
 * The copied content of a forwarded message.
 *
 * @remarks
 * A snapshot is taken when the forward is sent and is never updated afterwards: editing
 * or deleting the original leaves the snapshot as it was.
 */
export interface APIMessageSnapshot {
  /**
   * The forwarded message, reduced to the fields Discord snapshots.
   *
   * @remarks
   * There is no `id`, `author` or `channel_id` here, so the source cannot be identified
   * from the snapshot alone — the enclosing message's `message_reference` carries that.
   * Each field keeps the optionality it has on a full message.
   */
  message: Pick<
    APIMessage,
    | 'attachments'
    | 'components'
    | 'content'
    | 'edited_timestamp'
    | 'embeds'
    | 'flags'
    | 'mention_roles'
    | 'mentions'
    | 'sticker_items'
    | 'stickers'
    | 'timestamp'
    | 'type'
  >
}
