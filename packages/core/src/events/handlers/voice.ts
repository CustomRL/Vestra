import { guildUserKey } from '../../cache/CacheKeys.js'
import { GuildMember } from '../../structures/GuildMember.js'
import { VoiceState } from '../../structures/VoiceState.js'
import { defineHandler } from '../EventHandler.js'
import { upsertUser } from '../upsert.js'

/**
 * Voice state dispatches.
 *
 * @remarks
 * One event covers joining, leaving and every change in between, and telling them apart is
 * the whole handler: Discord distinguishes them only by `channel_id` being `null` and by
 * whether a state was already cached.
 */

/**
 * Somebody joined, left or changed their voice state.
 *
 * @remarks
 * **A `null` channel is a disconnect, and the entry is removed rather than kept.** Keeping a
 * state that says "not in a channel" would make `voiceStates.size` count everyone who has ever
 * been in voice, and `voiceState(guild, user)` returning an object would read as "they are
 * connected" to every caller who did not also check `channelId`.
 *
 * The previous state is emitted alongside the new one, which is the exception to the rule the
 * message and guild events follow. It is affordable here — a voice state is a dozen scalars, so
 * the clone is cheap — and it is the only way to answer the questions bots actually ask of this
 * event: did they move channel, or did they just mute themselves. Without it every consumer
 * keeps its own shadow copy of the cache.
 */
export const voiceStateUpdate = defineHandler('VOICE_STATE_UPDATE', (client, data) => {
  const guildId = data.guild_id
  // A voice state outside a guild is a call in a DM, which a bot cannot be in.
  if (guildId === undefined) return

  const key = guildUserKey(guildId, data.user_id)
  const cached = client.cache.voiceStates.get(key)
  const previous = cached === undefined ? undefined : cached.clone()

  // The member rides along on a join, and is often the first sight of them.
  const member = data.member
  if (member?.user !== undefined) {
    upsertUser(client, member.user)
    client.cache.members.add(new GuildMember(member, guildId, member.user.id, client))
  }

  if (data.channel_id === null) {
    client.cache.voiceStates.delete(key)
    if (previous !== undefined) client.emit('voiceStateUpdate', previous, undefined)
    return
  }

  if (cached === undefined) {
    const state = client.cache.voiceStates.add(new VoiceState(data, guildId, client))
    client.emit('voiceStateUpdate', undefined, state)
    return
  }

  cached.patch(data)
  client.emit('voiceStateUpdate', previous, cached)
})
