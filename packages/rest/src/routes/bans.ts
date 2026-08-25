import type {
  APIBan,
  RESTGetAPIGuildBansQuery,
  RESTPostAPIGuildBulkBanJSONBody,
  RESTPostAPIGuildBulkBanResult,
  RESTPutAPIGuildBanJSONBody,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * Ban endpoints.
 *
 * @remarks
 * **A ban is a `PUT` whose body decides how much of somebody's history is destroyed.**
 * `delete_message_seconds` is the one parameter in this API where a unit mistake is
 * irreversible: read as days it deletes a week where an hour was meant, and nothing undoes it.
 * It is a body field, so putting it in the query means nothing is deleted at all — the
 * quieter half of the same mistake.
 *
 * **Bulk banning succeeds partially by design.** A user already banned, or one the bot cannot
 * ban because of role hierarchy, comes back in `failed_users` while the rest go through. Only
 * a request where every ban fails answers an error, so a caller that checks for a thrown
 * exception and nothing else will report success for a request that banned nobody.
 */
export class BanRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Fetches one ban.
   *
   * @param guildId - The guild.
   * @param userId - The banned user.
   * @param options - Request options.
   * @returns The ban, including its reason.
   *
   * @remarks
   * A 404 means they are not banned, which is the intended way to ask — there is no route
   * that answers a boolean.
   */
  async get(guildId: Snowflake, userId: Snowflake, options: RouteOptions = {}): Promise<APIBan> {
    return await this.#rest.get<APIBan>(`/guilds/${guildId}/bans/${userId}`, options)
  }

  /**
   * Lists a guild's bans.
   *
   * @param guildId - The guild.
   * @param query - Pagination by user ID.
   * @param options - Request options.
   * @returns A page of bans.
   *
   * @remarks
   * Paginated and capped at 1000 per page, because a guild's ban list is unbounded. `before`
   * and `after` are user IDs and page in opposite directions.
   */
  async getAll(
    guildId: Snowflake,
    query: RESTGetAPIGuildBansQuery = {},
    options: RouteOptions = {},
  ): Promise<APIBan[]> {
    return await this.#rest.get<APIBan[]>(`/guilds/${guildId}/bans`, {
      ...options,
      query: query as Record<string, string | number | boolean | undefined>,
    })
  }

  /**
   * Bans a user, optionally deleting their recent messages.
   *
   * @param guildId - The guild to ban in.
   * @param userId - The user to ban.
   * @param body - How much history to delete.
   * @param options - Request options.
   *
   * @remarks
   * Works on somebody who is not in the guild, which is how a pre-emptive ban is placed.
   *
   * `delete_message_seconds` is **seconds**, at most 604800, and it is a body field. In the
   * query it is ignored and nothing is deleted; misread as days it destroys far more than
   * intended, and neither mistake is recoverable.
   */
  async create(
    guildId: Snowflake,
    userId: Snowflake,
    body: RESTPutAPIGuildBanJSONBody = {},
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.put<undefined>(`/guilds/${guildId}/bans/${userId}`, { ...options, body })
  }

  /**
   * Bans up to two hundred users in one request.
   *
   * @param guildId - The guild to ban in.
   * @param body - The users, and how much history to delete.
   * @param options - Request options.
   * @returns Which bans landed and which did not.
   *
   * @remarks
   * **Check the result.** Partial success is the normal outcome — an already-banned user or
   * one above the bot in the role hierarchy lands in `failed_users` while the rest go through,
   * and only a request where every ban fails throws. Needs `ManageGuild` as well as
   * `BanMembers`, unlike the single ban.
   */
  async createBulk(
    guildId: Snowflake,
    body: RESTPostAPIGuildBulkBanJSONBody,
    options: RouteOptions = {},
  ): Promise<RESTPostAPIGuildBulkBanResult> {
    return await this.#rest.post<RESTPostAPIGuildBulkBanResult>(`/guilds/${guildId}/bulk-ban`, {
      ...options,
      body,
    })
  }

  /**
   * Lifts a ban.
   *
   * @param guildId - The guild.
   * @param userId - The user to unban.
   * @param options - Request options.
   */
  async remove(guildId: Snowflake, userId: Snowflake, options: RouteOptions = {}): Promise<void> {
    await this.#rest.delete<undefined>(`/guilds/${guildId}/bans/${userId}`, options)
  }
}
