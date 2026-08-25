import type { APIAuditLog, RESTGetAPIGuildAuditLogQuery, Snowflake } from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * The audit log.
 *
 * @remarks
 * One route, and its own namespace rather than a method on `guilds`, because what it returns
 * is not a list of entries — it is a page of entries plus every user, webhook, integration,
 * thread, command, rule and event those entries refer to. Treating it as another guild
 * sub-resource hides that, and the side lists are the reason the route is usable at all: an
 * entry names its executor and its target by ID and nothing else.
 *
 * **The gateway's `guildAuditLogEntryCreate` and this are not interchangeable.** The dispatch
 * arrives live and carries one entry with no side lists; this is the historical record, kept
 * for 45 days, with everything resolved. A moderation bot wants both — the event to react,
 * this to answer "what happened while I was down".
 *
 * Needs `ViewAuditLog`. Without it the gateway quietly sends no dispatches and this route
 * returns 403, which is the same missing permission producing two very different symptoms.
 */
export class AuditLogRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Fetches a page of a guild's audit log.
   *
   * @param guildId - The guild.
   * @param query - Filters and pagination.
   * @param options - Request options.
   * @returns The entries, and the entities they name.
   *
   * @remarks
   * **`before` and `after` are entry IDs and page in opposite directions**: `before` walks
   * backwards from the newest, `after` forwards from the oldest. They are not a range —
   * sending both gets `before` honoured and `after` ignored.
   *
   * Filter with `action_type` rather than afterwards. A busy guild's 45 days of entries is a
   * lot of pages to walk to find the bans.
   */
  async get(
    guildId: Snowflake,
    query: RESTGetAPIGuildAuditLogQuery = {},
    options: RouteOptions = {},
  ): Promise<APIAuditLog> {
    return await this.#rest.get<APIAuditLog>(`/guilds/${guildId}/audit-logs`, {
      ...options,
      query: query as Record<string, string | number | boolean | undefined>,
    })
  }
}
