import type {
  APIAuditLogChange,
  APIAuditLogEntry,
  APIAuditLogEntryInfo,
  AuditLogEvent,
  Snowflake,
} from '@vestra/types'
import { Base } from './Base.js'
import { snowflakeDate, snowflakeTimestamp } from './snowflake.js'

/**
 * One field-level change recorded by an audit log entry.
 *
 * @remarks
 * **The envelope is converted; the values are not, and cannot be.** Only the three keys of
 * the wrapper are renamed — `old_value` and `new_value` are read by every consumer of every
 * change, so holding them by reference would put `change.old_value` in user code, which is
 * the one thing §4.15's conversion rule exists to prevent. This is the same call
 * {@link RoleColors} makes, for the same reason.
 *
 * The values stay `unknown` and stay by reference because their type is decided by
 * {@link AuditLogChange.key}: for most actions the key is a field name on the object the
 * action changed and the value is that field's own type, so a single type here would be a
 * union of every field of every auditable object. `unknown` forces the narrowing that `any`
 * would quietly skip, and no conversion is attempted at all — a lossy one would be worse
 * than the snake_case it saved.
 *
 * Several actions do not follow the field-name pattern: `AuditLogEvent.MemberRoleUpdate`
 * keys `$add` and `$remove` with arrays of partial roles, and
 * `AuditLogEvent.ApplicationCommandPermissionUpdate` keys a role, channel or user snowflake.
 * See `APIAuditLogChange` in `@vestra/types` for the full list of quirks.
 */
export interface AuditLogChange {
  /**
   * What was changed.
   *
   * @remarks
   * Normally a field name on the object the action acted on, but not always — see the
   * remarks on {@link AuditLogChange} for the actions that key something else entirely.
   */
  key: string
  /**
   * The value the key held before, or `undefined` if the payload carried none.
   *
   * @remarks
   * **`undefined` means absent, and absence carries meaning.** Discord sends `old_value`
   * without `new_value` when the property was reset or set to `null`, and `new_value`
   * without `old_value` when it was `null` before — so "which of the two arrived" is data,
   * not an accident of serialisation.
   *
   * That distinction survives the conversion intact. Both properties are always defined
   * here, so `in` cannot be used to test presence, but JSON has no `undefined` to send: a
   * value Discord actually transmitted is never `undefined`, so `=== undefined` answers
   * exactly the question `in` would have on the payload. Always-defined is also what keeps
   * every converted change one hidden class rather than four.
   */
  oldValue: unknown
  /** The value the key was changed to, or `undefined` if the payload carried none. */
  newValue: unknown
}

/**
 * Converts the change envelope, leaving the values alone.
 *
 * @param changes - The payload's changes.
 * @returns The same changes with camelCase wrappers.
 */
function toChanges(changes: readonly APIAuditLogChange[]): readonly AuditLogChange[] {
  const converted: AuditLogChange[] = []
  for (const change of changes) {
    converted.push({ key: change.key, oldValue: change.old_value, newValue: change.new_value })
  }
  return converted
}

/**
 * One administrative action taken in a guild, as Discord recorded it.
 *
 * @remarks
 * The whole of the `GUILD_AUDIT_LOG_ENTRY_CREATE` dispatch, which reaches only bots holding
 * `ViewAuditLog` — without it the gateway sends nothing rather than erroring, so a listener
 * that never fires is a permission problem and not a bug. Entries are the answer to "who did
 * what to whom": {@link AuditLogEntry.userId} is who, {@link AuditLogEntry.actionType} is
 * what, {@link AuditLogEntry.targetId} is to whom, and {@link AuditLogEntry.reason} is why,
 * all as plain fields rather than behind a lookup.
 *
 * `docs/design/phase-4-core.md` §4.17 cut this structure from the first release as "a
 * self-contained resource with no route and no cache entry, addable in a later minor without
 * touching anything that ships" — this is that later addition, and the cut's terms still
 * hold: nothing else references it.
 *
 * **Not cached, and there is no scope for it.** An audit log is an append-only stream, not a
 * set of entities: it is unbounded, every entry is new, nothing ever looks one up by ID, and
 * Discord discards them after 45 days. A scope would be a memory leak with a key on it. A
 * bot that wants history keeps what it cares about, and everything else is
 * `GET /guilds/{id}/audit-logs`.
 *
 * **Nothing here is mutable, and there is no `patch`.** Discord never updates an entry — it
 * records a new one — so there is no second payload to apply and no reason to leave a field
 * writable. That makes this the one structure where `readonly` throughout is a statement
 * about the resource rather than caution.
 */
export class AuditLogEntry<Client = unknown> extends Base<Client> {
  /** The entry's ID. */
  declare readonly id: Snowflake
  /**
   * The guild the action was taken in.
   *
   * @remarks
   * Not on the resource — Discord puts `guild_id` on the dispatch beside the entry, not
   * inside it — so the caller supplies it, exactly as {@link Role} takes its guild. Unlike
   * `Role` it is not needed for a cache key, because nothing caches an entry; it is here
   * because an entry naming neither the guild nor a way to reach it would be unusable to a
   * bot in more than one guild, which is every bot this is for.
   */
  declare readonly guildId: Snowflake
  /**
   * The action that was taken.
   *
   * @remarks
   * Treat an unrecognised number as an action added since {@link AuditLogEvent} was written
   * rather than as a malformed entry. Discord's numbering is not contiguous and entries for
   * actions it has never documented do arrive, so nothing here rejects or normalises a value
   * it does not know.
   */
  declare readonly actionType: AuditLogEvent
  /** The user or app that performed the action, or `null` where Discord names none. */
  declare readonly userId: Snowflake | null
  /**
   * The entity the action affected, or `null` for actions with no single target.
   *
   * @remarks
   * A webhook, user, role, channel or whatever else the action acted on — which of those it
   * is follows from {@link AuditLogEntry.actionType}. For
   * `AuditLogEvent.ApplicationCommandPermissionUpdate` it is the command or application ID,
   * **not** the role, channel or user whose access actually changed; that is a change key.
   */
  declare readonly targetId: Snowflake | null
  /**
   * The reason given for the action, or `undefined` if none was.
   *
   * @remarks
   * Whatever the acting app sent in the `X-Audit-Log-Reason` header, URL-decoded by Discord.
   * Absent is the common case: actions taken in the Discord client carry no reason at all,
   * so a missing reason says nothing about who acted or why.
   */
  declare readonly reason: string | undefined
  /**
   * The field-level changes the action made, or `undefined` if it records none.
   *
   * @remarks
   * `undefined` rather than an empty array is Discord's own distinction, kept: actions that
   * record no field-level change — a kick, a ban, a prune — omit the array rather than
   * sending it empty, and put what detail they have in {@link AuditLogEntry.options}. Even
   * where present it holds only the fields that actually changed, so the absence of a key is
   * not evidence that field was left alone by some other means.
   */
  declare readonly changes: readonly AuditLogChange[] | undefined
  /**
   * Extra context for the actions that carry any, or `undefined` for the ones that do not.
   *
   * @remarks
   * **Held by reference, so its keys are `snake_case`** — `entry.options.delete_member_days`,
   * not `deleteMemberDays`. This is the one place this structure departs from the conversion
   * rule, it is deliberate, and the reason is not the cost of writing the conversion:
   *
   * `options` is a grab-bag whose thirteen fields each belong to one set of actions and are
   * meaningless outside it, and Discord grows it whenever it ships an action needing a new
   * one. A converted copy would therefore be a second, hand-maintained list of names that
   * **silently drops whatever Discord added this morning**, where a mirrored payload carries
   * it through untouched — the drift ADR 3 refuses to block a contributor on. The change
   * envelope has the opposite property, a shape fixed for good, which is why it converts and
   * this does not.
   *
   * Nothing is lost either way: this is `APIAuditLogEntryInfo`, exported from
   * `@vestra/types`, and every field is documented there. Read it only after narrowing on
   * {@link AuditLogEntry.actionType} — nothing in it is safe to reach for blind, and the
   * counts are decimal strings rather than numbers because that is how Discord sends them.
   * Note in particular that `options.id` is the role or member of a changed overwrite, and
   * is neither this entry's ID nor its target.
   */
  declare readonly options: APIAuditLogEntryInfo | undefined

  /**
   * @param data - The payload to mirror.
   * @param guildId - The guild the action was taken in.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIAuditLogEntry, guildId: Snowflake, client: Client) {
    super(client)

    this.id = data.id
    this.guildId = guildId
    this.actionType = data.action_type
    this.userId = data.user_id
    this.targetId = data.target_id
    this.reason = data.reason
    this.changes = data.changes === undefined ? undefined : toChanges(data.changes)
    this.options = data.options
  }

  /** When the action was recorded, in epoch milliseconds. */
  get createdTimestamp(): number {
    return snowflakeTimestamp(this.id)
  }

  /** When the action was recorded. Allocates. */
  get createdAt(): Date {
    return snowflakeDate(this.id)
  }
}
