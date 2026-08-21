import type { APIChannel, Snowflake } from '@vestra/types'
import type { Channel } from '../../structures/channels/Channel.js'
import { createChannel } from '../../structures/channels/createChannel.js'
import type { EventContext } from '../EventHandler.js'
import { defineHandler } from '../EventHandler.js'

/**
 * Channel and thread dispatches.
 *
 * @remarks
 * Threads and channels are one payload type on the wire and two cache scopes here, so every
 * handler routes on {@link Channel.isThread} rather than on which dispatch it came from.
 * `THREAD_CREATE` is not the only way a thread arrives — one nested in a `GUILD_CREATE`, or a
 * `CHANNEL_UPDATE` on a thread, would land in the wrong store if the dispatch name decided.
 *
 * **Delete handlers read before they delete.** The listener gets the channel that was there,
 * not just an ID: the object is gone after this and no REST route returns a deleted channel,
 * so an ID-only event would be permanently unresolvable.
 */

/** A channel or thread was created. */
export const channelCreate = defineHandler('CHANNEL_CREATE', (client, data) => {
  const channel = cacheChannel(client, data)
  if (channel === undefined) return

  client.emit('channelCreate', channel)
})

/**
 * A channel or thread was updated.
 *
 * @remarks
 * Patches the cached channel in place when there is one, so a held reference stays live, and
 * constructs when there is not. `patch` is dispatched dynamically, so the cached object's own
 * class handles the payload even though this only knows it as a {@link Channel}.
 */
export const channelUpdate = defineHandler('CHANNEL_UPDATE', (client, data) => {
  const cached = findChannel(client, data.id)
  if (cached === undefined) {
    const channel = cacheChannel(client, data)
    if (channel !== undefined) client.emit('channelUpdate', channel)
    return
  }

  cached.patch(data)
  client.emit('channelUpdate', cached)
})

/** A channel or thread was deleted. */
export const channelDelete = defineHandler('CHANNEL_DELETE', (client, data) => {
  const cached = findChannel(client, data.id)

  // Both scopes, because the dispatch does not say which one held it and deleting from the
  // wrong one would leave the channel cached forever.
  client.cache.channels.delete(data.id)
  client.cache.threads.delete(data.id)

  if (cached === undefined) return
  client.emit('channelDelete', cached)
})

/** A thread was created, or the bot gained access to one. */
export const threadCreate = defineHandler('THREAD_CREATE', (client, data) => {
  const channel = createChannel(data, client)
  if (channel?.isThread() !== true) return

  client.emit('threadCreate', client.cache.threads.add(channel))
})

/** A thread was updated. */
export const threadUpdate = defineHandler('THREAD_UPDATE', (client, data) => {
  const cached = client.cache.threads.get(data.id)
  if (cached === undefined) {
    const channel = createChannel(data, client)
    if (channel?.isThread() !== true) return
    client.emit('threadUpdate', client.cache.threads.add(channel))
    return
  }

  cached.patch(data)
  client.emit('threadUpdate', cached)
})

/**
 * A thread was deleted, or the bot lost access to it.
 *
 * @remarks
 * The payload is a stub — `id`, `guild_id`, `parent_id` and `type` — so a cached thread is the
 * only source of anything else, and an uncached one emits nothing rather than an ID nothing
 * can resolve later.
 */
export const threadDelete = defineHandler('THREAD_DELETE', (client, data) => {
  const cached = client.cache.threads.get(data.id)
  client.cache.threads.delete(data.id)

  if (cached === undefined) return
  client.emit('threadDelete', cached)
})

/**
 * Puts a channel in whichever of the two scopes it belongs to.
 *
 * @param client - The handler context.
 * @param data - The channel payload.
 * @param guildId - The guild, for a payload that omits it.
 * @returns The structure, or `undefined` for a channel this version cannot build.
 */
export function cacheChannel(
  client: EventContext,
  data: APIChannel,
  guildId?: Snowflake,
): Channel | undefined {
  const channel = createChannel(data, client, guildId)
  if (channel === undefined) return undefined

  if (channel.isThread()) return client.cache.threads.add(channel)
  return client.cache.channels.add(channel)
}

/**
 * Finds a channel in either scope.
 *
 * @param client - The handler context.
 * @param id - The channel's ID.
 * @returns The cached channel, from whichever scope holds it.
 *
 * @remarks
 * Both are checked because the dispatch does not say which store to look in, and a thread
 * arriving as a `CHANNEL_UPDATE` is a real payload rather than a hypothetical.
 */
function findChannel(client: EventContext, id: Snowflake): Channel | undefined {
  return client.cache.channels.get(id) ?? client.cache.threads.get(id)
}
