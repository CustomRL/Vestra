import type { Snowflake } from '../globals.js'
import type { AuditLogEvent } from '../enums/audit-log.js'

/**
 * A single administrative action taken in a guild.
 *
 * @remarks
 * This is also the whole of the `GUILD_AUDIT_LOG_ENTRY_CREATE` dispatch payload, which is
 * an entry plus a `guild_id`. That dispatch only reaches bots holding `ViewAuditLog`;
 * without it the gateway silently sends nothing rather than erroring.
 *
 * Which of the optional fields are populated is decided entirely by `action_type` — see
 * {@link AuditLogEvent} for what each action carries. Entries are kept for 45 days.
 */
export interface APIAuditLogEntry {
  /**
   * The ID of the entity the action affected — a webhook, user, role, or whatever else the
   * action targeted.
   *
   * @remarks
   * `null` for actions with no single target. For
   * `AuditLogEvent.ApplicationCommandPermissionUpdate` this is the command ID or the app
   * ID, not the role, channel or user whose access actually changed.
   */
  target_id: Snowflake | null
  /**
   * The changes made to `target_id`.
   *
   * @remarks
   * Absent entirely for actions that record no field-level change, and never an empty
   * array in that case. Even where present it holds only the fields that actually changed,
   * so a change to a field you care about is not guaranteed to be in here.
   */
  changes?: APIAuditLogChange[]
  /** The user or app that performed the action. */
  user_id: Snowflake | null
  /** The entry's ID. */
  id: Snowflake
  /** The action that was taken. */
  action_type: AuditLogEvent
  /** Extra context for the actions that carry any. */
  options?: APIAuditLogEntryInfo
  /**
   * The reason given for the action, between 1 and 512 characters.
   *
   * @remarks
   * Whatever the acting app sent in the `X-Audit-Log-Reason` header, URL-decoded. Absent
   * when no reason was supplied, which is the common case for actions taken in the client.
   */
  reason?: string
}

/**
 * One field-level change recorded by an audit log entry.
 *
 * @remarks
 * `new_value` and `old_value` are `unknown` on purpose. Their shape is decided by `key`:
 * for most actions `key` is a field name on the object the action changed and the values
 * are that field's own type, so a single type here would have to be a union of every field
 * of every auditable object. Narrowing on `key` is the consumer's job, and `unknown` forces
 * that check where `any` would quietly skip it.
 *
 * Several actions do not follow the field-name pattern at all:
 *
 * - `AuditLogEvent.MemberRoleUpdate` uses `$add` and `$remove` as keys, with an array of
 *   partial roles carrying only `id` and `name` as the value.
 * - `AuditLogEvent.ApplicationCommandPermissionUpdate` uses a role, channel or user
 *   snowflake as the key, with application command permission objects as the values.
 * - Invite actions key the channel as `channel_id` rather than the invite object's own
 *   `channel.id`.
 * - Webhook actions key the avatar as `avatar_hash` rather than `avatar`.
 *
 * Presence carries meaning of its own: `old_value` without `new_value` means the property
 * was reset or set to `null`, and `new_value` without `old_value` means it was `null`
 * before.
 */
export interface APIAuditLogChange {
  /** The value the key was changed to. */
  new_value?: unknown
  /** The value the key held before. */
  old_value?: unknown
  /**
   * What was changed.
   *
   * @remarks
   * Discord's own OpenAPI specification marks this nullable while the documentation types
   * it as a plain string. It is typed here as documented; if a `null` key is ever observed
   * in practice that is worth treating as the specification being right.
   */
  key: string
}

/**
 * Extra context attached to the audit log actions that have any.
 *
 * @remarks
 * Every field is optional because each belongs to a different set of actions, and none is
 * present outside them. Read this only after narrowing on the entry's `action_type` —
 * nothing here is safe to reach for blind.
 *
 * The counts are strings, not numbers. Discord serialises this whole object as string
 * values on the wire.
 */
export interface APIAuditLogEntryInfo {
  /** The ID of the app whose command permissions were targeted. */
  application_id?: Snowflake
  /** The name of the Auto Moderation rule that fired. */
  auto_moderation_rule_name?: string
  /**
   * The trigger type of the Auto Moderation rule that fired.
   *
   * @remarks
   * A string here, unlike the numeric `trigger_type` on the rule object itself.
   */
  auto_moderation_rule_trigger_type?: string
  /** The channel the targeted entities were in. */
  channel_id?: Snowflake
  /** How many entities were targeted, as a decimal string. */
  count?: string
  /** How many days of inactivity the prune used as its cutoff, as a decimal string. */
  delete_member_days?: string
  /**
   * The ID of the role or member whose channel overwrite was created, changed or removed.
   *
   * @remarks
   * Not the entry's own `id`, and not `target_id` either — that is the channel.
   */
  id?: Snowflake
  /** How many members the prune removed, as a decimal string. */
  members_removed?: string
  /** The ID of the message that was pinned or unpinned. */
  message_id?: Snowflake
  /**
   * The name of the role the overwrite applies to.
   *
   * @remarks
   * Only sent when `type` is `'0'`. A member overwrite has no name to report and omits
   * this field rather than sending it empty.
   */
  role_name?: string
  /** Whether the overwrite applies to a role (`'0'`) or a member (`'1'`). */
  type?: '0' | '1'
  /** The type of integration that performed the action. */
  integration_type?: string
  /** The voice channel status that was set. */
  status?: string
}
