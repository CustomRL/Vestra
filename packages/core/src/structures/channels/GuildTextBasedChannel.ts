import type {
  APITextBasedChannelBase,
  ChannelType,
  ISO8601Timestamp,
  RESTPostAPIChannelMessageJSONBody,
  Snowflake,
} from '@vestra/types'
import type { TextBased } from './Channel.js'
import type { RestCapable } from '../capabilities.js'
import { Message } from '../Message.js'
import { GuildChannel } from './GuildChannel.js'
import type { ChannelChanges, ChannelChangesDraft } from './ChannelChanges.js'

/**
 * A guild channel that carries messages.
 *
 * @remarks
 * The shared half of text, announcement, voice, stage and thread channels — all five carry
 * messages, and Discord gives all five the same four fields for it. Written once here rather
 * than five times, which is also what stops the five drifting apart.
 *
 * Satisfies {@link TextBased}, the interface `Channel.isTextBased()` narrows to. A DM carries
 * messages too and cannot extend this, which is exactly why that predicate narrows to an
 * interface rather than to this class.
 */
export abstract class GuildTextBasedChannel<Client = unknown>
  extends GuildChannel<Client>
  implements TextBased
{
  /**
   * The ID of the last message sent here.
   *
   * @remarks
   * May name a message that has since been deleted, so fetching it blindly is a 404 waiting
   * to happen. Discord does not clear this when the message goes.
   */
  declare lastMessageId: Snowflake | null | undefined
  /** When the last pinned message here was pinned, as the raw ISO string. */
  declare lastPinTimestamp: ISO8601Timestamp | null | undefined
  /**
   * Seconds a member must wait between messages, from 0 to 21600.
   *
   * @remarks
   * Does not apply to anyone with `ManageMessages` or `ManageChannel`, so a bot with either
   * will not observe the delay it reads here.
   */
  declare rateLimitPerUser: number | undefined
  /** The channel's topic. */
  declare topic: string | null | undefined

  /**
   * @param data - The payload to mirror.
   * @param guildId - The guild the channel belongs to.
   * @param client - The client that produced this structure.
   */
  protected constructor(
    data: APITextBasedChannelBase<ChannelType>,
    guildId: Snowflake,
    client: Client,
  ) {
    super(data, guildId, client)

    this.lastMessageId = data.last_message_id
    this.lastPinTimestamp = data.last_pin_timestamp
    this.rateLimitPerUser = data.rate_limit_per_user
    this.topic = data.topic
  }

  /**
   * Sends a message here.
   *
   * @param body - What to send.
   * @param options - Request options, such as an abort signal.
   * @returns The message that was sent.
   *
   * @remarks
   * Named `send` rather than `createMessage`, which is what the REST route is called. The two
   * names keep the two vocabularies visibly apart: the route hands back an `APIMessage` and
   * this hands back a {@link Message}. Giving them one name would make "I fetched it through
   * REST, why is my cache stale" a question people have to ask.
   */
  async send<C extends RestCapable>(
    this: GuildTextBasedChannel<C>,
    body: RESTPostAPIChannelMessageJSONBody,
    options: { signal?: AbortSignal } = {},
  ): Promise<Message<C>> {
    const sent = await this.client.rest.channels.createMessage(this.id, body, options)
    return new Message(sent, this.client)
  }

  /** When the last pinned message here was pinned, or `null` if nothing is pinned. Allocates. */
  get lastPinAt(): Date | null {
    const raw = this.lastPinTimestamp
    return raw === undefined || raw === null ? null : new Date(raw)
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   */
  override patch(data: APITextBasedChannelBase<ChannelType>): ChannelChanges<Client> | null {
    let changes: ChannelChangesDraft<Client> | null = super.patch(data)

    if (data.last_message_id !== this.lastMessageId) {
      ;(changes ??= {}).lastMessageId = this.lastMessageId
    }
    this.lastMessageId = data.last_message_id
    if (data.last_pin_timestamp !== this.lastPinTimestamp) {
      ;(changes ??= {}).lastPinTimestamp = this.lastPinTimestamp
    }
    this.lastPinTimestamp = data.last_pin_timestamp
    if (data.rate_limit_per_user !== this.rateLimitPerUser) {
      ;(changes ??= {}).rateLimitPerUser = this.rateLimitPerUser
    }
    this.rateLimitPerUser = data.rate_limit_per_user
    if (data.topic !== this.topic) (changes ??= {}).topic = this.topic
    this.topic = data.topic

    return changes
  }
}
