import type { APIChannel, Snowflake } from '@vestra/types'
import { evictChannel } from '../../cache/evictGuild.js'
import type { Channel } from '../../structures/channels/Channel.js'
import type { ThreadChannel } from '../../structures/channels/ThreadChannel.js'
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
    if (channel !== undefined) client.emit('channelUpdate', channel, null)
    return
  }

  // **A type change is a rebuild, not a patch.** Converting a text channel to an announcement
  // channel is a supported Discord operation and arrives as a `CHANNEL_UPDATE` with a new
  // `type`. Patching cannot express it: `type` is readonly, and the object is the wrong class
  // now — `isTextBased()` and friends would keep answering from the old one. A held reference
  // does go stale, and that is the truth rather than a cost: Discord converted the channel.
  if (cached.type !== data.type) {
    evictChannel(client.cache, data.id)
    const rebuilt = cacheChannel(client, data)
    // A rebuild reports nothing. The old object described a channel of a different type, so
    // its field values are not the previous state of this one.
    if (rebuilt !== undefined) client.emit('channelUpdate', rebuilt, null)
    return
  }

  const changes = cached.patch(data)
  // Back through whichever store holds it, so the scope's filter, ttl and max see the write.
  client.emit('channelUpdate', recache(client, cached), changes)
})

/** A channel or thread was deleted. */
export const channelDelete = defineHandler('CHANNEL_DELETE', (client, data) => {
  const cached = findChannel(client, data.id)

  // Both scopes, because the dispatch does not say which one held it — and everything that
  // hung off the channel, because its messages and threads are unreachable the moment it goes.
  evictChannel(client.cache, data.id)

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
    client.emit('threadUpdate', client.cache.threads.add(channel), null)
    return
  }

  const changes = cached.patch(data)
  client.emit('threadUpdate', client.cache.threads.add(cached), changes)
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
  // A thread is a channel, so its messages are grouped under its own ID and go with it.
  evictChannel(client.cache, data.id)

  if (cached === undefined) return
  client.emit('threadDelete', cached)
})

/**
 * The bot regained access to threads, or joined a channel that has some.
 *
 * @remarks
 * **Reconciles rather than adds, and only within the channels the payload names.** Discord
 * sends the active threads it can see, and `channel_ids` says which parent channels that
 * covers — so a thread cached under one of those parents that is *not* in the payload has been
 * archived or lost, and stays cached forever if this only adds. Same shape as the emoji
 * reconciliation, and for the same reason.
 *
 * `channel_ids` being absent means the whole guild was synced, which makes an empty `threads`
 * array mean "this guild has no active threads" rather than "nothing to report". Treating the
 * two the same would either leave every thread cached forever or drop threads that are still
 * live, depending on which way it was got wrong.
 */
export const threadListSync = defineHandler('THREAD_LIST_SYNC', (client, data) => {
  const scoped = data.channel_ids
  const arrived = new Set<Snowflake>()
  const synced: ThreadChannel<EventContext>[] = []

  for (const payload of data.threads) {
    const channel = createChannel(payload, client, data.guild_id)
    if (channel?.isThread() !== true) continue

    arrived.add(channel.id)
    const cached = client.cache.threads.get(channel.id)
    if (cached === undefined) {
      synced.push(client.cache.threads.add(channel))
      continue
    }

    cached.patch(payload)
    synced.push(client.cache.threads.add(cached))
  }

  for (const thread of client.cache.threads.values()) {
    if (arrived.has(thread.id)) continue
    // Only threads this sync actually covers. A guild-wide sync covers all of them; a scoped
    // one must leave the rest alone, or regaining access to one channel would evict the
    // threads of every other.
    if (thread.guildId !== data.guild_id) continue
    if (scoped !== undefined && !scoped.includes(thread.parentId ?? '')) continue

    client.cache.threads.delete(thread.id)
  }

  client.emit('threadListSync', data.guild_id, synced)
})

/**
 * Who is in a thread changed.
 *
 * @remarks
 * **Assigns `member_count`, never adjusts it.** The dispatch carries the absolute figure, so
 * the tempting `+= added.length - removed.length` is both unnecessary and the one write that
 * would break replay: a resumed session redelivers the dispatch and a counter adjusted twice
 * is wrong forever. §5.2's idempotency table names this event as the case that proves the
 * rule.
 *
 * **Emits user IDs rather than thread members.** `added_members` carries `APIThreadMember`
 * objects and `ThreadMember` is not modelled, so emitting them would put a raw payload in a
 * typed event and make modelling it later a breaking change. The IDs are what a bot acts on —
 * they are what `guild.members` and `cache.users` are keyed by — and they stay correct
 * whatever `ThreadMember` becomes. `added_members` is also absent unless the bot can see the
 * members, so an event built around it would be empty for most consumers anyway.
 *
 * An uncached thread emits nothing: the payload has no name, parent or type to build one
 * from, and a thread with only an ID is not something a listener can use.
 */
export const threadMembersUpdate = defineHandler('THREAD_MEMBERS_UPDATE', (client, data) => {
  const cached = client.cache.threads.get(data.id)
  if (cached === undefined) return

  cached.memberCount = data.member_count
  client.cache.threads.add(cached)

  const added = (data.added_members ?? [])
    .map((member) => member.user_id)
    .filter((id): id is Snowflake => id !== undefined)

  client.emit('threadMembersUpdate', cached, added, data.removed_member_ids ?? [])
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
): Channel<EventContext> | undefined {
  const channel = createChannel(data, client, guildId)
  if (channel === undefined) return undefined

  if (channel.isThread()) return client.cache.threads.add(channel)
  return client.cache.channels.add(channel)
}

/**
 * Puts a patched channel back in whichever scope holds it.
 *
 * @param client - The handler context.
 * @param channel - The channel that was just mutated in place.
 * @returns The channel.
 *
 * @remarks
 * A patch that only mutates the object skips `CacheStore.set`, so the scope's `filter` never
 * runs on the new value, its `ttl` stays measured from the original write, and its
 * write-recency stays at the original insertion — which is backwards for a bounded cache.
 */
function recache(client: EventContext, channel: Channel<EventContext>): Channel<EventContext> {
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
function findChannel(client: EventContext, id: Snowflake): Channel<EventContext> | undefined {
  return client.cache.channels.get(id) ?? client.cache.threads.get(id)
}
