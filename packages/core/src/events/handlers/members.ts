import { evictMember } from '../../cache/evictGuild.js'
import { GuildMember } from '../../structures/GuildMember.js'
import { defineHandler } from '../EventHandler.js'
import { upsertUser } from '../upsert.js'

/**
 * Guild member dispatches.
 *
 * @remarks
 * Neither half of the member cache's key is on the member payload — Discord puts `guild_id`
 * on the dispatch and the user inside it — so every handler here reads both off the
 * dispatch and hands them to the structure. That is the same reason {@link GuildMember}
 * takes them as arguments rather than deriving them.
 *
 * Like the message handlers, these are pure functions of (cache, data). Applying the same
 * dispatch twice leaves the cache exactly where the first application left it, which is
 * what makes a replay after a resume safe without any handler checking a flag.
 */

/**
 * A member joined a guild.
 *
 * @remarks
 * Guarded on `user` because the cache key needs the user's ID and the payload type makes it
 * optional — `APIGuildMember` is shared with the member embedded in a message, where the
 * user sits beside it rather than inside it. Discord always sends one on this dispatch, so
 * the guard costs a comparison and nothing else; without it the key is built from
 * `undefined` and every joining member overwrites the last.
 */
export const guildMemberAdd = defineHandler('GUILD_MEMBER_ADD', (client, data) => {
  const user = data.user
  if (user === undefined) return

  upsertUser(client, user)
  const member = client.cache.members.add(new GuildMember(data, data.guild_id, user.id, client))
  client.emit('guildMemberAdd', member)
})

/**
 * A member was updated.
 *
 * @remarks
 * Patches the cached member when there is one and constructs from the completed payload when
 * there is not. Members are not cached under the default configuration, so the second path
 * is the usual one — see `DefaultCacheOptions` and ADR 4.
 */
export const guildMemberUpdate = defineHandler('GUILD_MEMBER_UPDATE', (client, data) => {
  upsertUser(client, data.user)
  const cached = client.cache.member(data.guild_id, data.user.id)

  if (cached === undefined) {
    const member = client.cache.members.add(
      new GuildMember(data, data.guild_id, data.user.id, client),
    )
    client.emit('guildMemberUpdate', member, null)
    return
  }

  const changes = cached.patch(data)
  client.emit('guildMemberUpdate', client.cache.members.add(cached), changes)
})

/**
 * A member left or was removed.
 *
 * @remarks
 * Emits the user rather than the member. The member is usually not cached, and the one thing
 * a listener wants here — who left — is the one thing the dispatch carries in full.
 *
 * The user is left in the `users` scope untouched. A membership ending says nothing about
 * the account, which may still be in every other guild the bot is in.
 */
export const guildMemberRemove = defineHandler('GUILD_MEMBER_REMOVE', (client, data) => {
  evictMember(client.cache, data.guild_id, data.user.id)
  client.emit('guildMemberRemove', data.guild_id, upsertUser(client, data.user))
})
