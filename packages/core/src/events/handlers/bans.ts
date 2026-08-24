import { defineHandler } from '../EventHandler.js'
import { upsertUser } from '../upsert.js'

/**
 * Ban dispatches.
 *
 * @remarks
 * Neither handler evicts anything. A ban is not a cache change: `GUILD_MEMBER_REMOVE` fires
 * alongside `GUILD_BAN_ADD` and does the eviction, so doing it here as well would drop the
 * member twice and emit `guildMemberRemove` for a member that had already gone.
 *
 * The user is upserted, which is the one useful thing to do with either payload — a ban is
 * frequently the first and last time a bot sees somebody, and a moderation log wants a name
 * rather than an ID.
 */

/**
 * Somebody was banned from a guild.
 *
 * @remarks
 * Carries no reason and no moderator. Discord puts both in the audit log rather than in this
 * dispatch, so a bot that wants them fetches `GET /guilds/{id}/bans/{user}` or reads
 * `GUILD_AUDIT_LOG_ENTRY_CREATE`. Inventing fields the payload does not have would be worse
 * than the gap.
 */
export const guildBanAdd = defineHandler('GUILD_BAN_ADD', (client, data) => {
  client.emit('guildBanAdd', data.guild_id, upsertUser(client, data.user))
})

/** A ban was lifted. */
export const guildBanRemove = defineHandler('GUILD_BAN_REMOVE', (client, data) => {
  client.emit('guildBanRemove', data.guild_id, upsertUser(client, data.user))
})
