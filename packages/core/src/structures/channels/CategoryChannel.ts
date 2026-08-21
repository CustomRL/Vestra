import type { APICategoryChannel, Snowflake } from '@vestra/types'
import { GuildChannel } from './GuildChannel.js'

/**
 * An organisational category holding other channels.
 *
 * @remarks
 * Adds nothing to {@link GuildChannel}: a category is the guild channel fields and no more.
 *
 * There is deliberately no `children` accessor. It would need the category to reach its
 * client's cache, which `Base` is generic over the client precisely to avoid, and an accessor
 * that returned an empty array when channels are not cached would read as "this category is
 * empty" — a worse answer than making the caller ask the cache. Same trade-off as
 * `Guild#roles`.
 */
export class CategoryChannel<Client = unknown> extends GuildChannel<Client> {
  /**
   * @param data - The payload to mirror.
   * @param guildId - The guild the channel belongs to.
   * @param client - The client that produced this structure.
   *
   * @remarks
   * Not redundant, whatever it looks like: {@link GuildChannel}'s constructor is `protected`,
   * and an inherited one keeps that accessibility — so without this, `new CategoryChannel(…)`
   * is a compile error and `createChannel` cannot build one. Verified by deleting it.
   */
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- see above
  constructor(data: APICategoryChannel, guildId: Snowflake, client: Client) {
    super(data, guildId, client)
  }
}
