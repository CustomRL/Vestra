import type {
  APIDefaultReaction,
  APIForumTag,
  APIThreadOnlyChannelBase,
  ChannelType,
  Snowflake,
  SortOrderType,
  ThreadAutoArchiveDuration,
} from '@vestra/types'
import { GuildChannel } from './GuildChannel.js'

/**
 * A channel whose contents are threads rather than messages.
 *
 * @remarks
 * The shared half of forum and media channels. Deliberately **not** a text-based channel: it
 * has `last_message_id`, `topic` and `rate_limit_per_user` like one, and they mean different
 * things — `lastThreadId` is the last *post*, the topic is the posting guidelines shown above
 * the list, and the rate limit governs how often a member may create a thread. Inheriting the
 * text-based base would have named all three wrongly and made `isTextBased()` true of a
 * channel that cannot receive a message.
 */
export abstract class ThreadOnlyChannel<Client = unknown> extends GuildChannel<Client> {
  /** The posting guidelines shown above the post list. */
  declare topic: string | null | undefined
  /** Seconds a member must wait between creating threads. */
  declare rateLimitPerUser: number | undefined
  /**
   * The ID of the most recently created thread.
   *
   * @remarks
   * Discord sends this as `last_message_id`, which is what it is not: the posts in a forum
   * are threads, and this names the newest one.
   */
  declare lastThreadId: Snowflake | null | undefined
  /** How long new threads stay inactive before archiving, in minutes. */
  declare defaultAutoArchiveDuration: ThreadAutoArchiveDuration | undefined
  /** The tags that may be applied to threads here. */
  declare availableTags: APIForumTag[]
  /** The emoji shown on the add-reaction button of posts. */
  declare defaultReactionEmoji: APIDefaultReaction | null | undefined
  /** The rate limit applied to newly created threads. */
  declare defaultThreadRateLimitPerUser: number | undefined
  /** The default sort order of posts, or `null` if Discord has not set one. */
  declare defaultSortOrder: SortOrderType | null | undefined

  /**
   * @param data - The payload to mirror.
   * @param guildId - The guild the channel belongs to.
   * @param client - The client that produced this structure.
   */
  protected constructor(
    data: APIThreadOnlyChannelBase<ChannelType>,
    guildId: Snowflake,
    client: Client,
  ) {
    super(data, guildId, client)

    this.topic = data.topic
    this.rateLimitPerUser = data.rate_limit_per_user
    this.lastThreadId = data.last_message_id
    this.defaultAutoArchiveDuration = data.default_auto_archive_duration
    this.availableTags = data.available_tags === undefined ? [] : [...data.available_tags]
    this.defaultReactionEmoji = data.default_reaction_emoji
    this.defaultThreadRateLimitPerUser = data.default_thread_rate_limit_per_user
    this.defaultSortOrder = data.default_sort_order
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   */
  override patch(data: APIThreadOnlyChannelBase<ChannelType>): void {
    super.patch(data)

    this.topic = data.topic
    this.rateLimitPerUser = data.rate_limit_per_user
    this.lastThreadId = data.last_message_id
    this.defaultAutoArchiveDuration = data.default_auto_archive_duration
    this.availableTags = data.available_tags === undefined ? [] : [...data.available_tags]
    this.defaultReactionEmoji = data.default_reaction_emoji
    this.defaultThreadRateLimitPerUser = data.default_thread_rate_limit_per_user
    this.defaultSortOrder = data.default_sort_order
  }
}
