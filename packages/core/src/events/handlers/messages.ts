import { Message } from '../../structures/Message.js'
import { defineHandler } from '../EventHandler.js'

/**
 * Message dispatches.
 *
 * @remarks
 * Each handler is a pure function of (cache, data), which is what makes replay after a
 * resume safe without any handler checking a flag. Applying the same `MESSAGE_CREATE`
 * twice writes the same entry twice and emits twice; the cache ends in the same state
 * either way, and the duplicate emit is the router's problem, not the handler's.
 */

/** A message was sent. */
export const messageCreate = defineHandler('MESSAGE_CREATE', (client, data) => {
  const message = client.cache.messages.add(new Message(data, client))
  client.emit('messageCreate', message)
})

/**
 * A message was edited.
 *
 * @remarks
 * Patches the cached message when there is one and constructs from the partial when there
 * is not. Under the default configuration messages are not cached at all, so the second
 * path is the usual one — which is why {@link Message} is built to survive a payload that
 * carries only `id` and `channel_id`.
 */
export const messageUpdate = defineHandler('MESSAGE_UPDATE', (client, data) => {
  const cached = client.cache.messages.get(data.id)
  if (cached === undefined) {
    client.emit('messageUpdate', client.cache.messages.add(new Message(data, client)))
    return
  }

  cached.patch(data)
  client.emit('messageUpdate', cached)
})

/**
 * A message was deleted.
 *
 * @remarks
 * Emits IDs rather than the message. The message may never have been cached — it usually
 * has not been — and an event whose argument is `Message | undefined` puts a check in
 * every listener to serve a case the default configuration makes universal.
 */
export const messageDelete = defineHandler('MESSAGE_DELETE', (client, data) => {
  client.cache.messages.delete(data.id)
  client.emit('messageDelete', data.id, data.channel_id, data.guild_id)
})
