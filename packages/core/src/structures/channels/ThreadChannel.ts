import type {
  APIThreadChannel,
  APIThreadMetadata,
  ISO8601Timestamp,
  Snowflake,
  ThreadAutoArchiveDuration,
} from '@vestra/types'
import { GuildTextBasedChannel } from './GuildTextBasedChannel.js'

/**
 * A thread within a text, announcement, forum or media channel.
 *
 * @remarks
 * **The metadata is flattened.** Discord nests `archived`, `locked` and the rest inside
 * `thread_metadata`, and a thread is the one channel type where those fields are read
 * constantly — `thread.archived` rather than `thread.threadMetadata?.archived`, which is two
 * optional hops for something always present on a real thread. The nested object is not kept
 * beside the flattened fields: two spellings of one fact drift the moment one is patched.
 *
 * **`parentId` is the channel the thread lives in**, inherited from {@link GuildChannel}
 * where it means the category. Discord uses one field for both, so this follows the payload
 * rather than inventing a second name that would disagree with every other channel type.
 */
export class ThreadChannel<Client = unknown> extends GuildTextBasedChannel<Client> {
  /** The user who created the thread. */
  declare ownerId: Snowflake | undefined
  /** Whether the thread is archived. */
  declare archived: boolean | undefined
  /** How long the thread stays inactive before archiving, in minutes. */
  declare autoArchiveDuration: ThreadAutoArchiveDuration | undefined
  /** When the archive status last changed, as the raw ISO string. */
  declare archiveTimestamp: ISO8601Timestamp | undefined
  /** Whether only moderators can unarchive the thread. */
  declare locked: boolean | undefined
  /** Whether non-moderators can add others. Private threads only. */
  declare invitable: boolean | undefined
  /** When the thread was created, for threads created after 9 January 2022. */
  declare createTimestamp: ISO8601Timestamp | null | undefined
  /**
   * An approximate count of messages in the thread.
   *
   * @remarks
   * Stops at 50 for threads created before 1 July 2022. {@link ThreadChannel.totalMessageSent}
   * is the uncapped figure.
   */
  declare messageCount: number | undefined
  /** An approximate count of members in the thread. Stops counting at 50. */
  declare memberCount: number | undefined
  /** Every message ever sent here, including deleted ones. */
  declare totalMessageSent: number | undefined
  /** The tags applied to this thread. Forum and media threads only. */
  declare appliedTags: Snowflake[]

  /**
   * @param data - The payload to mirror.
   * @param guildId - The guild the thread belongs to.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIThreadChannel, guildId: Snowflake, client: Client) {
    super(data, guildId, client)

    this.ownerId = data.owner_id
    this.#applyMetadata(data.thread_metadata)
    this.messageCount = data.message_count
    this.memberCount = data.member_count
    this.totalMessageSent = data.total_message_sent
    this.appliedTags = data.applied_tags === undefined ? [] : [...data.applied_tags]
  }

  /** When the archive status last changed. Allocates. */
  get archivedAt(): Date | null {
    const raw = this.archiveTimestamp
    return raw === undefined ? null : new Date(raw)
  }

  /** When the thread was created, if Discord recorded it. Allocates. */
  get createdAtExact(): Date | null {
    const raw = this.createTimestamp
    return raw === undefined || raw === null ? null : new Date(raw)
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   */
  override patch(data: APIThreadChannel): void {
    super.patch(data)

    this.ownerId = data.owner_id
    this.#applyMetadata(data.thread_metadata)
    this.messageCount = data.message_count
    this.memberCount = data.member_count
    this.totalMessageSent = data.total_message_sent
    this.appliedTags = data.applied_tags === undefined ? [] : [...data.applied_tags]
  }

  /**
   * Spreads `thread_metadata` across the flattened fields.
   *
   * @param metadata - The nested object, if it arrived.
   *
   * @remarks
   * Assigns every field on both paths rather than only when the metadata is present. Skipping
   * the absent case would give a thread built without metadata a different property set from
   * one built with it, which is the shape instability the whole `declare`-plus-assign rule
   * exists to prevent.
   */
  #applyMetadata(metadata: APIThreadMetadata | undefined): void {
    this.archived = metadata?.archived
    this.autoArchiveDuration = metadata?.auto_archive_duration
    this.archiveTimestamp = metadata?.archive_timestamp
    this.locked = metadata?.locked
    this.invitable = metadata?.invitable
    this.createTimestamp = metadata?.create_timestamp
  }
}
