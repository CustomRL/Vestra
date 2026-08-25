import type {
  APIChannel,
  APIConnection,
  APIGuildMember,
  APIGuildPartial,
  APIUser,
  RESTGetAPICurrentUserGuildsQuery,
  RESTPatchAPICurrentUserJSONBody,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * User endpoints.
 *
 * @remarks
 * **`leaveGuild` and `guilds.delete` are not the same thing**, and the docs put them one
 * segment apart. This one removes the bot and works everywhere; that one destroys the guild
 * and works only for its owner.
 *
 * Most of what is here is the bot's own place in the world: which guilds it is in, its
 * membership of one, its own profile. `get` is the exception, and the only route that reads
 * somebody else.
 */
export class UserRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Fetches the current user.
   *
   * @param options - Request options.
   * @returns The bot user.
   */
  async getCurrent(options: RouteOptions = {}): Promise<APIUser> {
    return await this.#rest.get<APIUser>('/users/@me', options)
  }

  /**
   * Fetches any user by ID.
   *
   * @param userId - The user to fetch.
   * @param options - Request options.
   * @returns The user.
   */
  async get(userId: Snowflake, options: RouteOptions = {}): Promise<APIUser> {
    return await this.#rest.get<APIUser>(`/users/${userId}`, options)
  }

  /**
   * Modifies the current user.
   *
   * @param body - The fields to change.
   * @param options - Request options.
   * @returns The updated user.
   */
  async editCurrent(
    body: RESTPatchAPICurrentUserJSONBody,
    options: RouteOptions = {},
  ): Promise<APIUser> {
    return await this.#rest.patch<APIUser>('/users/@me', { ...options, body })
  }

  /**
   * Opens a direct message channel with a user.
   *
   * @param recipientId - The user to open a channel with.
   * @param options - Request options.
   * @returns The direct message channel.
   *
   * @remarks
   * Returns the existing channel when one is already open, so this is idempotent. The
   * result is still worth caching: a loop of these will exhaust the global request
   * allowance long before it becomes a per-route problem.
   */
  async createDM(recipientId: Snowflake, options: RouteOptions = {}): Promise<APIChannel> {
    return await this.#rest.post<APIChannel>('/users/@me/channels', {
      ...options,
      body: { recipient_id: recipientId },
    })
  }

  /**
   * Lists the guilds the bot is in.
   *
   * @param query - Pagination, and whether to include approximate counts.
   * @param options - Request options.
   * @returns Partial guilds, not full ones.
   *
   * @remarks
   * **These are partial guilds** — ID, name, icon, owner flag, permissions and features, and
   * nothing else. Fetching the whole guild needs `guilds.get` per entry, which is why this is
   * for enumeration rather than for reading anything about a guild.
   *
   * Paginated at 200 and capped there. A bot in more guilds than that must page with `after`,
   * and a bot in ten thousand should be reading the gateway's `READY` instead: this route is
   * a snapshot and the gateway is the live list.
   */
  async getGuilds(
    query: RESTGetAPICurrentUserGuildsQuery = {},
    options: RouteOptions = {},
  ): Promise<APIGuildPartial[]> {
    return await this.#rest.get<APIGuildPartial[]>('/users/@me/guilds', {
      ...options,
      query: query as Record<string, string | number | boolean | undefined>,
    })
  }

  /**
   * Reads the bot's own membership of a guild.
   *
   * @param guildId - The guild.
   * @param options - Request options.
   * @returns The membership.
   *
   * @remarks
   * A different route from `members.get(guildId, ownId)` and a different permission: this one
   * needs nothing at all, where reading an arbitrary member needs the `GuildMembers` intent.
   */
  async getGuildMember(guildId: Snowflake, options: RouteOptions = {}): Promise<APIGuildMember> {
    return await this.#rest.get<APIGuildMember>(`/users/@me/guilds/${guildId}/member`, options)
  }

  /**
   * Leaves a guild.
   *
   * @param guildId - The guild to leave.
   * @param options - Request options.
   *
   * @remarks
   * **Not `guilds.delete`.** That one destroys the guild and works only for its owner; this
   * one removes the bot and works everywhere. The two are one segment apart in the docs and
   * very far apart in consequence.
   */
  async leaveGuild(guildId: Snowflake, options: RouteOptions = {}): Promise<void> {
    await this.#rest.delete<undefined>(`/users/@me/guilds/${guildId}`, options)
  }

  /**
   * Lists the current user's third-party connections.
   *
   * @param options - Request options.
   * @returns The connections.
   *
   * @remarks
   * A bot has none, so this is only useful under an OAuth bearer token with the `connections`
   * scope. It is here because the route exists on `/users/@me` and a caller using this client
   * for an OAuth flow would otherwise have to reach for `raw`.
   */
  async getConnections(options: RouteOptions = {}): Promise<APIConnection[]> {
    return await this.#rest.get<APIConnection[]>('/users/@me/connections', options)
  }
}
