import type {
  APIChannel,
  APIGuild,
  APIInvite,
  RESTPostAPIGuildChannelJSONBody,
  RESTGetAPIGuildThreadsResult,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * The guild itself, and the channels and invites it owns.
 *
 * @remarks
 * Members, bans and roles have their own namespaces. Each is a resource in its own right with
 * its own permissions, and one class holding all four had grown past the point where any of
 * them was findable.
 */
export class GuildRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Fetches a guild.
   *
   * @param guildId - The guild to fetch.
   * @param withCounts - Whether to include approximate member and presence counts.
   * @param options - Request options.
   * @returns The guild.
   */
  async get(guildId: Snowflake, withCounts = false, options: RouteOptions = {}): Promise<APIGuild> {
    return await this.#rest.get<APIGuild>(`/guilds/${guildId}`, {
      ...options,
      query: { with_counts: withCounts },
    })
  }

  /**
   * Fetches a guild's channels.
   *
   * @param guildId - The guild to read.
   * @param options - Request options.
   * @returns Every channel, excluding threads.
   *
   * @remarks
   * Threads are not included — Discord serves those from
   * `GET /guilds/{id}/threads/active`, which is a different shape and a different permission.
   */
  async getChannels(guildId: Snowflake, options: RouteOptions = {}): Promise<APIChannel[]> {
    return await this.#rest.get<APIChannel[]>(`/guilds/${guildId}/channels`, options)
  }

  /**
   * Creates a channel. Needs `ManageChannels`.
   *
   * @param guildId - The guild to create it in.
   * @param body - What to create.
   * @param options - Request options.
   * @returns The new channel.
   *
   * @remarks
   * `position` is advisory: creating a channel renumbers its siblings, so the position that
   * comes back is the one to believe rather than the one that was asked for.
   */
  async createChannel(
    guildId: Snowflake,
    body: RESTPostAPIGuildChannelJSONBody,
    options: RouteOptions = {},
  ): Promise<APIChannel> {
    return await this.#rest.post<APIChannel>(`/guilds/${guildId}/channels`, { ...options, body })
  }

  /**
   * Lists a guild's invites. Needs `ManageGuild`.
   *
   * @param guildId - The guild to read.
   * @param options - Request options.
   * @returns Every invite in the guild, across all its channels.
   */
  async getInvites(guildId: Snowflake, options: RouteOptions = {}): Promise<APIInvite[]> {
    return await this.#rest.get<APIInvite[]>(`/guilds/${guildId}/invites`, options)
  }

  /**
   * Lists a guild's active threads.
   *
   * @param guildId - The guild to read.
   * @param options - Request options.
   * @returns The threads, and the current user's membership of each one it belongs to.
   *
   * @remarks
   * `members` carries only the **current user's** memberships — one entry per thread it is
   * in, not every member of every thread, which would be unbounded. Archived threads are not
   * included; those are paginated per channel.
   */
  async getActiveThreads(
    guildId: Snowflake,
    options: RouteOptions = {},
  ): Promise<RESTGetAPIGuildThreadsResult> {
    return await this.#rest.get<RESTGetAPIGuildThreadsResult>(
      `/guilds/${guildId}/threads/active`,
      options,
    )
  }
}
