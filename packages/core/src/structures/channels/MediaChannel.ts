import type { APIMediaChannel, Snowflake } from '@vestra/types'
import { ThreadOnlyChannel } from './ThreadOnlyChannel.js'

/**
 * A thread-only channel laid out as a media gallery.
 *
 * @remarks
 * The forum payload without `default_forum_layout`, which the gallery layout replaces.
 */
export class MediaChannel<Client = unknown> extends ThreadOnlyChannel<Client> {
  /**
   * @param data - The payload to mirror.
   * @param guildId - The guild the channel belongs to.
   * @param client - The client that produced this structure.
   *
   * @remarks
   * Not redundant: {@link ThreadOnlyChannel}'s constructor is `protected` and an inherited
   * one keeps that accessibility, so without this the class cannot be constructed at all.
   */
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- see above
  constructor(data: APIMediaChannel, guildId: Snowflake, client: Client) {
    super(data, guildId, client)
  }
}
