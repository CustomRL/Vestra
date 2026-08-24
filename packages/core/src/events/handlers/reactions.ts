import { GuildMember } from '../../structures/GuildMember.js'
import { ReactionEmoji } from '../../structures/ReactionEmoji.js'
import { defineHandler } from '../EventHandler.js'
import { upsertUser } from '../upsert.js'

/**
 * Reaction dispatches.
 *
 * @remarks
 * **These emit IDs and an emoji, not a `Reaction` structure and not a `Message`.** Reactions
 * have no identity of their own — there is nothing to key a cache by, and the count on a
 * cached message is stale the moment the next reaction lands — so a structure would be an
 * object wrapping four fields with nothing to do. The message is not resolved either: messages
 * are off by default, so `message` would be `undefined` for almost every reaction, and an
 * event whose main argument is usually absent is worse than one that hands over the IDs and
 * lets the caller decide.
 *
 * The emoji is converted rather than passed through, because the raw form is where the classic
 * reaction bug lives — see {@link ReactionEmoji.identifier}.
 */

/**
 * Somebody reacted to a message.
 *
 * @remarks
 * The member rides along in a guild, and this is often the first sight of them: a lurker's
 * first interaction with a bot is frequently a reaction rather than a message.
 */
export const messageReactionAdd = defineHandler('MESSAGE_REACTION_ADD', (client, data) => {
  const member = data.member
  if (member?.user !== undefined && data.guild_id !== undefined) {
    upsertUser(client, member.user)
    client.cache.members.add(new GuildMember(member, data.guild_id, member.user.id, client))
  }

  client.emit(
    'messageReactionAdd',
    new ReactionEmoji(data.emoji),
    data.message_id,
    data.channel_id,
    data.user_id,
    data.guild_id,
  )
})

/**
 * Somebody removed their reaction.
 *
 * @remarks
 * Carries no member, unlike the add: Discord does not send one, because the person may have
 * left the guild between reacting and un-reacting.
 */
export const messageReactionRemove = defineHandler('MESSAGE_REACTION_REMOVE', (client, data) => {
  client.emit(
    'messageReactionRemove',
    new ReactionEmoji(data.emoji),
    data.message_id,
    data.channel_id,
    data.user_id,
    data.guild_id,
  )
})

/**
 * Every reaction on a message was removed at once.
 *
 * @remarks
 * One event rather than a burst of removes, for the same reason `MESSAGE_DELETE_BULK` is one
 * event: a moderator clearing reactions on a busy message would otherwise fire a listener
 * hundreds of times. There is no emoji here because Discord does not say which were removed —
 * the answer is all of them.
 */
export const messageReactionRemoveAll = defineHandler(
  'MESSAGE_REACTION_REMOVE_ALL',
  (client, data) => {
    client.emit('messageReactionRemoveAll', data.message_id, data.channel_id, data.guild_id)
  },
)

/**
 * Every reaction of one emoji was removed from a message.
 *
 * @remarks
 * Distinct from {@link messageReactionRemove}, which is one person un-reacting. This is a
 * moderator removing everybody's, and there is no `user_id` because there is no one user.
 */
export const messageReactionRemoveEmoji = defineHandler(
  'MESSAGE_REACTION_REMOVE_EMOJI',
  (client, data) => {
    client.emit(
      'messageReactionRemoveEmoji',
      new ReactionEmoji(data.emoji),
      data.message_id,
      data.channel_id,
      data.guild_id,
    )
  },
)
