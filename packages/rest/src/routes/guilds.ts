import type {
  APIBan,
  APIGuild,
  APIGuildMember,
  APIRole,
  RESTGetAPIGuildMembersQuery,
  RESTPatchAPIGuildMemberJSONBody,
  RESTPostAPIGuildRoleJSONBody,
  RESTPutAPIGuildBanJSONBody,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './channels.js'

/**
 * Guild, member, ban and role endpoints.
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
   * Fetches a single member.
   *
   * @param guildId - The guild the member is in.
   * @param userId - The member to fetch.
   * @param options - Request options.
   * @returns The member.
   */
  async getMember(
    guildId: Snowflake,
    userId: Snowflake,
    options: RouteOptions = {},
  ): Promise<APIGuildMember> {
    return await this.#rest.get<APIGuildMember>(`/guilds/${guildId}/members/${userId}`, options)
  }

  /**
   * Fetches a page of members.
   *
   * @param guildId - The guild to list.
   * @param query - Pagination options.
   * @param options - Request options.
   * @returns The members.
   *
   * @remarks
   * Requires the `GuildMembers` privileged intent. Fetching a whole large guild this way
   * is slow and memory-hungry; prefer a gateway member chunk request.
   */
  async getMembers(
    guildId: Snowflake,
    query: RESTGetAPIGuildMembersQuery = {},
    options: RouteOptions = {},
  ): Promise<APIGuildMember[]> {
    return await this.#rest.get<APIGuildMember[]>(`/guilds/${guildId}/members`, {
      ...options,
      query: query as Record<string, string | number | boolean | undefined>,
    })
  }

  /**
   * Modifies a member.
   *
   * @param guildId - The guild the member is in.
   * @param userId - The member to modify.
   * @param body - The fields to change.
   * @param options - Request options.
   * @returns The updated member.
   */
  async editMember(
    guildId: Snowflake,
    userId: Snowflake,
    body: RESTPatchAPIGuildMemberJSONBody,
    options: RouteOptions = {},
  ): Promise<APIGuildMember> {
    return await this.#rest.patch<APIGuildMember>(`/guilds/${guildId}/members/${userId}`, {
      ...options,
      body,
    })
  }

  /**
   * Removes a member from a guild.
   *
   * @param guildId - The guild to remove from.
   * @param userId - The member to remove.
   * @param options - Request options.
   */
  async removeMember(
    guildId: Snowflake,
    userId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(`/guilds/${guildId}/members/${userId}`, options)
  }

  /**
   * Bans a user, optionally deleting their recent messages.
   *
   * @param guildId - The guild to ban in.
   * @param userId - The user to ban.
   * @param body - Ban options.
   * @param options - Request options.
   */
  async createBan(
    guildId: Snowflake,
    userId: Snowflake,
    body: RESTPutAPIGuildBanJSONBody = {},
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.put<undefined>(`/guilds/${guildId}/bans/${userId}`, { ...options, body })
  }

  /**
   * Lifts a ban.
   *
   * @param guildId - The guild to unban in.
   * @param userId - The user to unban.
   * @param options - Request options.
   */
  async removeBan(
    guildId: Snowflake,
    userId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(`/guilds/${guildId}/bans/${userId}`, options)
  }

  /**
   * Fetches a single ban.
   *
   * @param guildId - The guild to look in.
   * @param userId - The banned user.
   * @param options - Request options.
   * @returns The ban, including the recorded reason.
   */
  async getBan(guildId: Snowflake, userId: Snowflake, options: RouteOptions = {}): Promise<APIBan> {
    return await this.#rest.get<APIBan>(`/guilds/${guildId}/bans/${userId}`, options)
  }

  /**
   * Fetches a guild's roles.
   *
   * @param guildId - The guild to read.
   * @param options - Request options.
   * @returns The roles, in no guaranteed order.
   */
  async getRoles(guildId: Snowflake, options: RouteOptions = {}): Promise<APIRole[]> {
    return await this.#rest.get<APIRole[]>(`/guilds/${guildId}/roles`, options)
  }

  /**
   * Creates a role.
   *
   * @param guildId - The guild to create in.
   * @param body - The role to create.
   * @param options - Request options.
   * @returns The created role.
   */
  async createRole(
    guildId: Snowflake,
    body: RESTPostAPIGuildRoleJSONBody = {},
    options: RouteOptions = {},
  ): Promise<APIRole> {
    return await this.#rest.post<APIRole>(`/guilds/${guildId}/roles`, { ...options, body })
  }

  /**
   * Adds a role to a member.
   *
   * @param guildId - The guild the member is in.
   * @param userId - The member to modify.
   * @param roleId - The role to add.
   * @param options - Request options.
   */
  async addMemberRole(
    guildId: Snowflake,
    userId: Snowflake,
    roleId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.put<undefined>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, options)
  }

  /**
   * Removes a role from a member.
   *
   * @param guildId - The guild the member is in.
   * @param userId - The member to modify.
   * @param roleId - The role to remove.
   * @param options - Request options.
   */
  async removeMemberRole(
    guildId: Snowflake,
    userId: Snowflake,
    roleId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(
      `/guilds/${guildId}/members/${userId}/roles/${roleId}`,
      options,
    )
  }
}
