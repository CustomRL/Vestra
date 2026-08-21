import { GuildTextBasedChannel } from '../../structures/channels/GuildTextBasedChannel.js'
import { GuildMember } from '../../structures/GuildMember.js'
import { defineHandler } from '../EventHandler.js'
import { upsertUser } from '../upsert.js'

/**
 * Dispatches that touch the cache or carry a member, but need no structure of their own.
 *
 * @remarks
 * Grouped because each is two or three lines and a file apiece would be filing for its own
 * sake. What they share is the shape of the answer: none of them has an entity Discord would
 * call a resource, so each emits the identifiers it was given rather than a structure built
 * from nothing.
 */

/**
 * Several messages were deleted at once.
 *
 * @remarks
 * Emits the IDs rather than the messages, and does so **once** rather than as a burst of
 * `messageDelete` events. Both halves matter. A moderator clearing a hundred messages would
 * otherwise fire a hundred delete listeners, which is how a bot that logs deletions ends up
 * rate-limited by its own audit channel; and a listener that wants the per-message behaviour
 * can still loop, while one that wants "a bulk delete happened" cannot reassemble it from a
 * hundred singles.
 */
export const messageDeleteBulk = defineHandler('MESSAGE_DELETE_BULK', (client, data) => {
  for (const id of data.ids) client.cache.messages.delete(id)

  client.emit('messageDeleteBulk', data.ids, data.channel_id, data.guild_id)
})

/**
 * A channel's pinned messages changed.
 *
 * @remarks
 * Updates the cached channel's `lastPinTimestamp` so the cache does not keep insisting on a
 * pin time the event just changed. Discord sends no `CHANNEL_UPDATE` alongside this, so
 * without it the field goes stale the first time anyone pins anything.
 *
 * `last_pin_timestamp` is optional **and** nullable, and the two differ: absent means the
 * payload said nothing, `null` means the channel now has no pinned messages. Only the second
 * is written through, or an event that said nothing would blank the field.
 */
export const channelPinsUpdate = defineHandler('CHANNEL_PINS_UPDATE', (client, data) => {
  // Both scopes, because threads are pinnable and are a separate scope. Looking only in
  // `channels` silently dropped every pin update in a thread, and the field then said the
  // thread had never had anything pinned.
  const channel =
    client.cache.channels.get(data.channel_id) ?? client.cache.threads.get(data.channel_id)
  if (channel instanceof GuildTextBasedChannel && data.last_pin_timestamp !== undefined) {
    channel.lastPinTimestamp = data.last_pin_timestamp
  }

  client.emit('channelPinsUpdate', data.channel_id, data.guild_id, data.last_pin_timestamp ?? null)
})

/**
 * Somebody started typing.
 *
 * @remarks
 * The only dispatch whose whole content is transient — there is nothing to cache about the
 * act of typing, and Discord sends no matching "stopped typing". What it does carry is a full
 * member object in a guild, which is worth keeping: a bot that reacts to typing usually wants
 * to know who, and this is often the first time it has seen them.
 */
export const typingStart = defineHandler('TYPING_START', (client, data) => {
  const member = data.member
  if (member !== undefined && data.guild_id !== undefined) {
    if (member.user !== undefined) upsertUser(client, member.user)
    client.cache.members.add(new GuildMember(member, data.guild_id, data.user_id, client))
  }

  // Seconds on the wire, milliseconds everywhere else in the library. Converting here rather
  // than in a listener stops `typingStart` being the one event with a different time unit.
  client.emit('typingStart', data.channel_id, data.user_id, data.guild_id, data.timestamp * 1000)
})
