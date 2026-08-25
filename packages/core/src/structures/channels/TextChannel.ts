import type { APITextChannel, Snowflake, ThreadAutoArchiveDuration } from '@vestra/types'
import { GuildTextBasedChannel } from './GuildTextBasedChannel.js'
import type { ChannelChanges, ChannelChangesDraft } from './ChannelChanges.js'

/**
 * A text channel within a guild.
 */
export class TextChannel<Client = unknown> extends GuildTextBasedChannel<Client> {
  /** How long new threads here stay inactive before archiving, in minutes. */
  declare defaultAutoArchiveDuration: ThreadAutoArchiveDuration | undefined

  /**
   * @param data - The payload to mirror.
   * @param guildId - The guild the channel belongs to.
   * @param client - The client that produced this structure.
   */
  constructor(data: APITextChannel, guildId: Snowflake, client: Client) {
    super(data, guildId, client)

    this.defaultAutoArchiveDuration = data.default_auto_archive_duration
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   */
  override patch(data: APITextChannel): ChannelChanges<Client> | null {
    let changes: ChannelChangesDraft<Client> | null = super.patch(data)

    if (data.default_auto_archive_duration !== this.defaultAutoArchiveDuration) {
      ;(changes ??= {}).defaultAutoArchiveDuration = this.defaultAutoArchiveDuration
    }
    this.defaultAutoArchiveDuration = data.default_auto_archive_duration

    return changes
  }
}
