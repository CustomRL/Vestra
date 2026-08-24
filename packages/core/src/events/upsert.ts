import type { APIUser } from '@vestra/types'
import { User } from '../structures/User.js'
import type { EventContext } from './EventHandler.js'

/**
 * Puts a user into the cache without replacing the object already there.
 *
 * @param client - The handler context.
 * @param data - The user payload riding along inside some other dispatch.
 * @returns The cached user if there was one, otherwise the newly built one — following
 * {@link CacheStore.add}, which hands back its argument whether or not the scope kept it.
 *
 * @remarks
 * **Why this is not `cache.users.add(new User(...))` at each call site.** Users arrive nested
 * inside almost every dispatch — a message's author, a member's user, a reaction's actor —
 * so the same few lines would appear in every handler, and the wrong version of them is the
 * obvious one: constructing unconditionally replaces the cached object, so a consumer holding
 * `message.author` from a minute ago keeps reading a `User` the cache has already discarded.
 * Patching in place is what makes a held reference stay live, and it belongs in one place
 * rather than being re-derived per handler.
 *
 * Cheap when the scope is off, which is the default: `get` on a disabled store is a miss, so
 * this costs one lookup and a construction nothing retains.
 */
export function upsertUser(client: EventContext, data: APIUser): User {
  const cached = client.cache.users.get(data.id)
  if (cached !== undefined) {
    cached.patch(data)
    // Back through the store so the scope's policy sees the write — see the note in
    // `handlers/presence.ts` for what skipping it costs.
    return client.cache.users.add(cached)
  }

  return client.cache.users.add(new User(data, client))
}
