import { Role } from '../../structures/Role.js'
import { defineHandler } from '../EventHandler.js'

/**
 * Guild role dispatches.
 *
 * @remarks
 * Every one of these events carries its guild alongside the role because {@link Role} does
 * not. A role payload has no `guild_id` and the `roles` scope is keyed by role ID alone, so
 * the guild would be lost between the dispatch and the listener if the event did not pass it
 * on — and a listener that wanted it would have to search every guild for the role.
 *
 * Roles are the one scope that is cached by default, because permission computation is
 * impossible without them and they are bounded at 250 per guild. That makes these the
 * handlers whose cached branch is the common one rather than the exception.
 */

/** A role was created. */
export const roleCreate = defineHandler('GUILD_ROLE_CREATE', (client, data) => {
  const role = client.cache.roles.add(new Role(data.role, data.guild_id, client))
  client.emit('roleCreate', role, data.guild_id)
})

/**
 * A role was updated.
 *
 * @remarks
 * Patches in place, so a permission check holding the role sees the new permissions rather
 * than computing against a copy that stopped being true. The uncached branch is here for a
 * consumer who turned the scope off, not for the default.
 */
export const roleUpdate = defineHandler('GUILD_ROLE_UPDATE', (client, data) => {
  const cached = client.cache.roles.get(data.role.id)
  if (cached === undefined) {
    client.emit(
      'roleUpdate',
      client.cache.roles.add(new Role(data.role, data.guild_id, client)),
      data.guild_id,
    )
    return
  }

  cached.patch(data.role)
  client.emit('roleUpdate', cached, data.guild_id)
})

/**
 * A role was deleted.
 *
 * @remarks
 * Emits the ID rather than the role that was dropped. Reading the cache first to hand over a
 * final {@link Role} would make the argument `Role | undefined`, because the scope can be
 * turned off, and put a check in every listener for a case nothing can recover from anyway.
 */
export const roleDelete = defineHandler('GUILD_ROLE_DELETE', (client, data) => {
  client.cache.roles.delete(data.role_id)
  client.emit('roleDelete', data.role_id, data.guild_id)
})
