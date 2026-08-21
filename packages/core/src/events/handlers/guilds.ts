import { Guild } from '../../structures/Guild.js'
import { Role } from '../../structures/Role.js'
import { defineHandler } from '../EventHandler.js'

/**
 * Guild dispatches.
 *
 * @remarks
 * `GUILD_CREATE` is the only event that carries a guild's roles, so it is where the roles
 * scope is filled. That is why the live client reported zero cached roles before this file
 * existed despite roles defaulting on: nothing was reading them out of the one payload that
 * contains them.
 */

/**
 * A guild became available, or the bot joined one.
 *
 * @remarks
 * Fires for every guild during the startup stream as well as on an actual join, and the
 * payload is identical either way — `shard.guildsPending` is what tells them apart, which
 * is why the shard view carries it.
 *
 * An unavailable stub is skipped rather than cached. It carries an ID and nothing else, so
 * constructing from it would produce a guild whose every field is missing and whose
 * presence in the cache says the opposite of what the payload meant.
 */
export const guildCreate = defineHandler('GUILD_CREATE', (client, data) => {
  // Narrowed on `roles` rather than on `unavailable`. The stub's `unavailable` is optional,
  // so it does not discriminate the union — `'unavailable' in data` narrows nothing and the
  // full-guild branch stays unreachable.
  if (!('roles' in data)) return

  const guild = client.cache.guilds.add(new Guild(data, client))

  // Roles ride along inside the guild rather than arriving as their own dispatches, so this
  // is the only chance to cache them short of a REST call per guild.
  for (const role of data.roles) client.cache.roles.add(new Role(role, data.id, client))

  client.emit('guildCreate', guild)
})

/**
 * A guild was updated.
 *
 * @remarks
 * Carries a whole guild rather than a delta, so a cached one is patched wholesale and an
 * uncached one is constructed. Roles are **not** re-read here: `GUILD_UPDATE` does carry
 * them, but role changes arrive as their own dispatches, and re-adding the whole set on
 * every guild edit would churn the cache for no new information.
 */
export const guildUpdate = defineHandler('GUILD_UPDATE', (client, data) => {
  const cached = client.cache.guilds.get(data.id)
  if (cached === undefined) {
    client.emit('guildUpdate', client.cache.guilds.add(new Guild(data, client)))
    return
  }

  cached.patch(data)
  client.emit('guildUpdate', cached)
})

/**
 * A guild became unavailable, or the bot was removed from one.
 *
 * @remarks
 * The distinction is the whole handler. `unavailable: true` is a Discord outage and the
 * guild is coming back, so the cache keeps it — dropping it would empty the cache during
 * every incident and refill it minutes later. Anything else is a real departure, and the
 * guild's roles go with it, because a role cached for a guild the bot has left is
 * unreachable memory that nothing will ever evict.
 */
export const guildDelete = defineHandler('GUILD_DELETE', (client, data) => {
  if (data.unavailable === true) {
    client.emit('guildUnavailable', data.id)
    return
  }

  client.cache.guilds.delete(data.id)
  for (const role of client.cache.roles.group(data.id)) client.cache.roles.delete(role.id)

  client.emit('guildDelete', data.id)
})
