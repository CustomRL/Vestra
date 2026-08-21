import { guildUserKey } from '../../cache/CacheKeys.js'
import { Presence } from '../../structures/Presence.js'
import { defineHandler } from '../EventHandler.js'

/**
 * Presence dispatches.
 *
 * @remarks
 * The highest-volume event Discord sends by a wide margin — every status change, every game
 * started and stopped, for every member of every guild — which is why the scope is off by
 * default and why this handler does as little as possible.
 *
 * In particular it does **not** upsert the user. `PRESENCE_UPDATE` carries a user object
 * Discord documents as partial, with `id` the only guaranteed field and the rest unvalidated,
 * so upserting would overwrite a complete cached user with a near-empty one on every status
 * change. That is the one thing this event could plausibly do that would corrupt another
 * scope, so it is worth saying out loud rather than leaving as an absence.
 */

/**
 * Somebody's status or activity changed.
 *
 * @remarks
 * Patches in place when the presence is already cached, so a held reference stays live.
 * Offline is cached like any other status rather than deleted: "we know they are offline" and
 * "we have never seen them" are different answers, and a bot checking whether somebody is
 * around needs to tell them apart.
 */
export const presenceUpdate = defineHandler('PRESENCE_UPDATE', (client, data) => {
  const cached = client.cache.presences.get(guildUserKey(data.guild_id, data.user.id))
  if (cached === undefined) {
    client.emit('presenceUpdate', client.cache.presences.add(new Presence(data, client)))
    return
  }

  cached.patch(data)
  client.emit('presenceUpdate', cached)
})
