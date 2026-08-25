import type { APIAnnouncementChannel, Snowflake, ThreadAutoArchiveDuration } from '@vestra/types'
import { GuildTextBasedChannel } from './GuildTextBasedChannel.js'
import type { ChannelChanges, ChannelChangesDraft } from './ChannelChanges.js'

/**
 * A channel other guilds can follow and crosspost from.
 *
 * @remarks
 * Identical in shape to {@link TextChannel} and deliberately a separate class rather than an
 * alias: the two differ in what you may do with them — crossposting, follower webhooks — and
 * a caller who has narrowed to this type has established the difference matters.
 */
export class AnnouncementChannel<Client = unknown> extends GuildTextBasedChannel<Client> {
  /** How long new threads here stay inactive before archiving, in minutes. */
  declare defaultAutoArchiveDuration: ThreadAutoArchiveDuration | undefined

  /**
   * @param data - The payload to mirror.
   * @param guildId - The guild the channel belongs to.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIAnnouncementChannel, guildId: Snowflake, client: Client) {
    super(data, guildId, client)

    this.defaultAutoArchiveDuration = data.default_auto_archive_duration
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   */
  override patch(data: APIAnnouncementChannel): ChannelChanges<Client> | null {
    let changes: ChannelChangesDraft<Client> | null = super.patch(data)

    if (data.default_auto_archive_duration !== this.defaultAutoArchiveDuration) {
      ;(changes ??= {}).defaultAutoArchiveDuration = this.defaultAutoArchiveDuration
    }
    this.defaultAutoArchiveDuration = data.default_auto_archive_duration

    return changes
  }
}
