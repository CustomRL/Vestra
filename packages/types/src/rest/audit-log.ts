import type { Snowflake } from '../globals.js'
import type { AuditLogEvent } from '../enums/audit-log.js'
import type { APIAuditLog } from '../payloads/audit-log.js'

/**
 * Audit log query and result.
 */

/**
 * `GET /guilds/{guild.id}/audit-logs`
 *
 * @remarks
 * **`before` and `after` are entry IDs, not timestamps**, and they page in opposite
 * directions: `before` walks backwards from the newest, `after` walks forwards from the
 * oldest. Passing both is not a range — Discord honours `before` and ignores `after`.
 *
 * `action_type` filters server-side, which matters more here than on most routes: entries
 * are kept for 45 days and a busy guild's log is long, so filtering after the fact means
 * paging through everything to find the bans.
 */
export interface RESTGetAPIGuildAuditLogQuery {
  /** Only entries whose executor is this user. */
  user_id?: Snowflake
  /** Only entries of this action type. */
  action_type?: AuditLogEvent
  /** Entries older than this entry ID. */
  before?: Snowflake
  /** Entries newer than this entry ID. */
  after?: Snowflake
  /** How many entries, from 1 to 100. Defaults to 50. */
  limit?: number
}

/** The result of `GET /guilds/{guild.id}/audit-logs`. */
export type RESTGetAPIGuildAuditLogResult = APIAuditLog
