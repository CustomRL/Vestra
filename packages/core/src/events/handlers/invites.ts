import { Invite } from '../../structures/Invite.js'
import { defineHandler } from '../EventHandler.js'
import { upsertUser } from '../upsert.js'

/**
 * Invite dispatches.
 *
 * @remarks
 * **Nothing is cached, and the two events are deliberately asymmetric because of it.**
 * `INVITE_CREATE` carries the whole invite, so it emits an {@link Invite}. `INVITE_DELETE`
 * carries the code, the channel and the guild and nothing else — there is no cached invite to
 * read first, the way `channelDelete` reads its channel — so it emits those three identifiers
 * rather than an {@link Invite} that would be mostly `undefined`. {@link Invite} records why
 * there is no invites cache scope.
 *
 * **Neither event is a complete picture of a guild's invites.** Both require the
 * `GuildInvites` intent, `INVITE_CREATE` fires only for invites made while the bot is
 * connected, and an invite that quietly runs out of uses or expires produces no
 * `INVITE_DELETE` at all. A bot that needs the current set fetches it; these events are for
 * reacting to a change, not for maintaining a mirror.
 */

/** An invite was created. */
export const inviteCreate = defineHandler('INVITE_CREATE', (client, data) => {
  // The inviter is frequently the only place a bot ever sees this user as a full object — the
  // same reasoning as `bans.ts`. The target user is the person being streamed, who need not be
  // the inviter.
  if (data.inviter !== undefined) upsertUser(client, data.inviter)
  if (data.target_user !== undefined) upsertUser(client, data.target_user)

  client.emit('inviteCreate', new Invite(data, client))
})

/**
 * An invite was deleted, expired, or ran out of uses.
 *
 * @remarks
 * Discord does not say which of the three happened, so neither does this. It also does not
 * say who deleted it — that is in the audit log — and inventing either would be the library
 * guessing.
 */
export const inviteDelete = defineHandler('INVITE_DELETE', (client, data) => {
  client.emit('inviteDelete', data.code, data.channel_id, data.guild_id)
})
