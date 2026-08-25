import type {
  APIBan,
  APIChannel,
  APIGuild,
  APIGuildMember,
  APIRole,
  RESTGetAPIGuildMembersQuery,
  RESTPatchAPIGuildMemberJSONBody,
  RESTPatchAPIGuildRoleJSONBody,
  RESTPostAPIGuildChannelJSONBody,
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

  /**
   * Modifies a role.
   *
   * @param guildId - The guild the role is in.
   * @param roleId - The role to modify.
   * @param body - The fields to change.
   * @param options - Request options.
   * @returns The updated role.
   *
   * @remarks
   * A partial update: fields left out are unchanged. `position` is not settable here — roles
   * are reordered through `PATCH /guilds/{id}/roles` as a batch, because moving one role
   * renumbers the others and Discord will not do that one call at a time.
   */
  async editRole(
    guildId: Snowflake,
    roleId: Snowflake,
    body: RESTPatchAPIGuildRoleJSONBody,
    options: RouteOptions = {},
  ): Promise<APIRole> {
    return await this.#rest.patch<APIRole>(`/guilds/${guildId}/roles/${roleId}`, {
      ...options,
      body,
    })
  }

  /**
   * Deletes a role.
   *
   * @param guildId - The guild the role is in.
   * @param roleId - The role to delete.
   * @param options - Request options.
   *
   * @remarks
   * Irreversible, and it takes the role off every member who had it. The guild's `@everyone`
   * role cannot be deleted; Discord answers that with `50028`.
   */
  async deleteRole(
    guildId: Snowflake,
    roleId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(`/guilds/${guildId}/roles/${roleId}`, options)
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
}
