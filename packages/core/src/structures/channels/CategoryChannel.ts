import type { APICategoryChannel, Snowflake } from '@vestra/types'
import type { CacheCapable } from '../capabilities.js'
import type { Channel } from './Channel.js'
import { GuildChannel } from './GuildChannel.js'

/**
 * An organisational category holding other channels.
 *
 * @remarks
 * Adds nothing to {@link GuildChannel}: a category is the guild channel fields and no more.
 *
 * {@link CategoryChannel.children} reads the cache through a constrained `this`, the same
 * mechanism {@link Guild} uses — see {@link CacheCapable}. An earlier note here said no such
 * accessor could exist without importing the client; the constraint is how it exists without.
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

  /**
   * The cached channels sitting under this category.
   *
   * @param this - A structure whose client can reach the cache.
   * @returns The channels, in no particular order.
   *
   * @remarks
   * An index scan over the guild's channels rather than a lookup: the channels scope groups by
   * guild, and a second index keyed by parent would have to be maintained for a question asked
   * far less often than "which channels are in this guild". Documented rather than hidden,
   * because it is linear in the guild's channel count.
   *
   * Empty means nothing is cached, which under `channels: false` is always. Sorting is left to
   * the caller, who has to sort by `position` then `id` to match what Discord shows — position
   * alone leaves ties in an arbitrary order.
   */
  children<C extends CacheCapable>(this: CategoryChannel<C>): Channel[] {
    const children: Channel[] = []
    for (const channel of this.client.cache.channels.group(this.guildId)) {
      if (channel.isGuildBased() && channel.parentId === this.id) children.push(channel)
    }
    return children
  }
}
