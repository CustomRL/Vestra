import { AuditLogEntry } from '../../structures/AuditLogEntry.js'
import { defineHandler } from '../EventHandler.js'

// --- SCAFFOLDING. Delete this block and move the member into `ClientEvents.ts`. ---
//
// `emit` is keyed by `ClientEvents`, so the handler below does not compile until the event
// exists there. This augmentation is that declaration in the wrong file: it types listeners
// correctly today and is a verbatim copy of the line `ClientEvents` needs.
declare module '../ClientEvents.js' {
  interface ClientEvents<Client = unknown> {
    /**
     * An administrative action was recorded in a guild's audit log.
     *
     * @remarks
     * Needs `ViewAuditLog`; without it Discord sends nothing rather than erroring, so a
     * listener that never fires is the permission and not the wiring. Carries the entry
     * alone rather than a `(guildId, entry)` pair, because the entry names its own guild —
     * the same call {@link ClientEvents.stageInstanceCreate} makes.
     *
     * This is where the moderator and the reason behind a ban live:
     * {@link ClientEvents.guildBanAdd} carries neither, because the ban dispatch carries
     * neither.
     */
    guildAuditLogEntryCreate: [entry: AuditLogEntry<Client>]
  }
}
// --- end scaffolding ---

/**
 * The audit log dispatch.
 *
 * @remarks
 * Nothing is cached and nothing is evicted. {@link AuditLogEntry} records why there is no
 * scope: an audit log is an append-only stream rather than a set of entities, so a store for
 * it would grow without bound and answer no lookup anybody makes.
 *
 * Nothing is upserted either, unlike the ban handlers beside it. The payload names its actor
 * and its target by ID and carries no user object at all, so there is nothing to put in the
 * users scope — an entry gives a moderation log the IDs and the reason, and resolving a name
 * from them is a cache read or a fetch the listener makes.
 */

/**
 * An administrative action was recorded in a guild's audit log.
 *
 * @remarks
 * **Requires `ViewAuditLog`, and says nothing when it is missing.** Discord sends this only
 * to bots holding the permission, and silently sends nothing otherwise rather than erroring,
 * so a listener that never fires is the permission and not the wiring.
 *
 * This is where the moderator and the reason behind a `GUILD_BAN_ADD` live —
 * {@link ClientEvents.guildBanAdd} carries neither, because the ban dispatch carries neither.
 * The two arrive independently and in no guaranteed order, so correlating them means matching
 * on {@link AuditLogEntry.targetId}, not assuming adjacency.
 *
 * The guild comes from the dispatch rather than the entry: `guild_id` sits beside the entry
 * and not inside it, which is why {@link AuditLogEntry} takes it as an argument.
 */
export const guildAuditLogEntryCreate = defineHandler(
  'GUILD_AUDIT_LOG_ENTRY_CREATE',
  (client, data) => {
    client.emit('guildAuditLogEntryCreate', new AuditLogEntry(data, data.guild_id, client))
  },
)
