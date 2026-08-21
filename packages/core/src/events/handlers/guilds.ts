import { Guild } from '../../structures/Guild.js'
import { GuildMember } from '../../structures/GuildMember.js'
import { createEmoji } from '../../structures/Emoji.js'
import { Presence } from '../../structures/Presence.js'
import { Role } from '../../structures/Role.js'
import { Sticker } from '../../structures/Sticker.js'
import { VoiceState } from '../../structures/VoiceState.js'
import { defineHandler } from '../EventHandler.js'
import { cacheChannel } from './channels.js'
import { upsertUser } from '../upsert.js'

/**
 * Guild dispatches.
 *
 * @remarks
 * `GUILD_CREATE` is the only event that carries a guild's roles, and the only one that
 * carries a bulk list of its members, so it is where both scopes are seeded. That is why the
 * live client reported zero cached roles and zero cached members before this file existed:
 * nothing was reading them out of the one payload that contains them, and the member handlers
 * only fire on a join or an edit — so a bot that had been running for a week still had an
 * empty member cache for everyone who had not spoken since it started.
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

  // Channels and threads arrive nested here with no `guild_id` of their own, which is why
  // the guild's ID is threaded through: without it every channel learnt at startup would be
  // unkeyable, and that is almost all of them.
  for (const channel of data.channels) cacheChannel(client, channel, data.id)
  for (const thread of data.threads) cacheChannel(client, thread, data.id)

  // Voice states arrive here without their `guild_id` too, and this is the only bulk source
  // of them: VOICE_STATE_UPDATE reports changes, never the current picture, so a bot that
  // started while people were already in voice would otherwise see an empty set.
  for (const state of data.voice_states) {
    client.cache.voiceStates.add(new VoiceState(state, data.id, client))
  }

  // Emojis and stickers ride along here and nowhere else short of a REST call, exactly as
  // roles do. `createEmoji` refuses one with no ID, which is a standard Unicode emoji rather
  // than a guild emoji and has nothing to cache.
  for (const payload of data.emojis) {
    const emoji = createEmoji(payload, data.id, client)
    if (emoji !== undefined) client.cache.emojis.add(emoji)
  }
  if (data.stickers !== undefined) {
    for (const sticker of data.stickers) client.cache.stickers.add(new Sticker(sticker, client))
  }

  // Presences arrive without their `guild_id`, so it is put back: the structure keys on it,
  // and one presence exists per membership rather than per user.
  for (const presence of data.presences) {
    client.cache.presences.add(new Presence({ ...presence, guild_id: data.id }, client))
  }

  // Members are seeded but deliberately not announced. They are not joins — the list is who
  // was already there — and emitting `guildMemberAdd` for each would fire a join handler
  // thousands of times per guild at startup and again after every reconnect.
  //
  // How many arrive is not this handler's decision, and the rule is not the obvious one.
  // Measured against the live gateway: with `GuildMembers` alone, a three-member guild under
  // `large_threshold` sends exactly one member — the bot. Adding `GuildPresences` to the same
  // connection sends all three, and all twelve of a twelve-member guild. Discord builds this
  // list from the presence set, so `GuildMembers` on its own gets almost nothing here and the
  // full list needs opcode 8. A near-empty list is a correctly configured guild, not a
  // failure, and must not be read as "this guild has one member".
  for (const member of data.members) {
    const user = member.user
    if (user === undefined) continue
    upsertUser(client, user)
    client.cache.members.add(new GuildMember(member, data.id, user.id, client))
  }

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
