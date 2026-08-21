import { ClientUser } from '../../structures/ClientUser.js'
import { defineHandler } from '../EventHandler.js'

/**
 * The dispatches that decide who the client is.
 *
 * @remarks
 * These two are the only handlers that write to the context, because `client.user` is the
 * only member of it they may assign. The current user is a field rather than a cache entry
 * on purpose: an entry in the `users` scope would be evicted the moment a consumer set
 * `users: false`, taking with it the one user the client cannot work without.
 */

/**
 * The connection is live and the client's identity is known.
 *
 * @remarks
 * READY arrives once per shard, and every shard's payload carries the same user, so the
 * assignment is idempotent — a shard re-identifying replaces the identity with an equal one
 * rather than racing the others for it. How often `ready` should then reach a listener on a
 * sharded bot is not something a handler can decide, because a handler cannot see the fleet.
 *
 * The payload's `guilds` are unavailable stubs that Discord streams in afterwards, so this
 * is the handshake succeeding and not the cache being populated.
 */
export const ready = defineHandler('READY', (client, data) => {
  const user = new ClientUser(data.user, client)
  client.user = user
  client.emit('ready', user)
})

/**
 * The current user was updated.
 *
 * @remarks
 * Patches in place when the IDs agree, so `client.user` stays the same object across a
 * username or avatar change and every reference a consumer stored keeps seeing the truth.
 *
 * Replaces it otherwise, which covers two cases. A dispatch arriving before READY has
 * nothing to patch, and loses nothing by being built from — `USER_UPDATE` carries a complete
 * user rather than the changed fields. A dispatch whose ID disagrees should be impossible,
 * since Discord sends this only for the connected account; patching through it anyway would
 * graft one account's name and avatar onto another account's ID, and an identity that is
 * half of each is worse than one that at least matches the payload.
 */
export const userUpdate = defineHandler('USER_UPDATE', (client, data) => {
  const current = client.user
  if (current?.id !== data.id) {
    const user = new ClientUser(data, client)
    client.user = user
    client.emit('userUpdate', user)
    return
  }

  current.patch(data)
  client.emit('userUpdate', current)
})
