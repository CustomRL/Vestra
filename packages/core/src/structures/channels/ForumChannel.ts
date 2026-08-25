import type { APIForumChannel, ForumLayoutType, Snowflake } from '@vestra/types'
import { ThreadOnlyChannel } from './ThreadOnlyChannel.js'
import type { ChannelChanges, ChannelChangesDraft } from './ChannelChanges.js'

/**
 * A channel that can only contain threads.
 */
export class ForumChannel<Client = unknown> extends ThreadOnlyChannel<Client> {
  /** The default layout of posts. */
  declare defaultForumLayout: ForumLayoutType | undefined

  /**
   * @param data - The payload to mirror.
   * @param guildId - The guild the channel belongs to.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIForumChannel, guildId: Snowflake, client: Client) {
    super(data, guildId, client)

    this.defaultForumLayout = data.default_forum_layout
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   */
  override patch(data: APIForumChannel): ChannelChanges<Client> | null {
    let changes: ChannelChangesDraft<Client> | null = super.patch(data)

    if (data.default_forum_layout !== this.defaultForumLayout) {
      ;(changes ??= {}).defaultForumLayout = this.defaultForumLayout
    }
    this.defaultForumLayout = data.default_forum_layout

    return changes
  }
}
