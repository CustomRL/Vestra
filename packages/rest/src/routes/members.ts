import type {
  APIGuildMember,
  RESTGetAPIGuildMembersQuery,
  RESTGetAPIGuildMembersSearchQuery,
  RESTPatchAPICurrentGuildMemberJSONBody,
  RESTPatchAPIGuildMemberJSONBody,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * Guild member endpoints.
 *
 * @remarks
 * Split out of the guild routes rather than left among them, because a member is a resource in
 * its own right with its own permissions and its own intent requirement — and because one
 * class holding guilds, members, bans and roles had grown past the point where any of the four
 * was findable.
 *
 * **Two of these are expensive in ways their signatures hide.** {@link MemberRoutes.getAll}
 * needs the `GuildMembers` privileged intent and pages a thousand at a time, so fetching a
 * large guild through it is slow and holds every member in memory; a gateway member chunk
 * request is usually the right tool. {@link MemberRoutes.search} needs no intent at all, which
 * makes it the practical way to turn a name into a member.
 *
 * **Editing your own membership is a different route.** `PATCH /members/@me` sets the bot's
 * own nickname and needs `ChangeNickname`; the general member edit needs `ManageNicknames`,
 * which a bot renaming itself should not have to hold.
 */
export class MemberRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Fetches a single member.
   *
   * @param guildId - The guild the member is in.
   * @param userId - The member to fetch.
   * @param options - Request options.
   * @returns The member.
   */
  async get(
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
   * Requires the `GuildMembers` privileged intent. Fetching a whole large guild this way is
   * slow and memory-hungry; prefer a gateway member chunk request.
   */
  async getAll(
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
   * Searches a guild's members by username or nickname prefix.
   *
   * @param guildId - The guild to search.
   * @param query - The prefix to match, and how many to return.
   * @param options - Request options.
   * @returns The matching members.
   *
   * @remarks
   * **No privileged intent**, unlike {@link MemberRoutes.getAll}, which is what makes this the
   * practical way to resolve a name. It is a prefix match rather than a fuzzy one: `nel` finds
   * `nelly`, and nothing finds `elly`.
   */
  async search(
    guildId: Snowflake,
    query: RESTGetAPIGuildMembersSearchQuery,
    options: RouteOptions = {},
  ): Promise<APIGuildMember[]> {
    return await this.#rest.get<APIGuildMember[]>(`/guilds/${guildId}/members/search`, {
      ...options,
      query: query as unknown as Record<string, string | number | boolean | undefined>,
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
   *
   * @remarks
   * Each field needs a different permission, so a partial edit can fail wholesale on the one
   * field the bot cannot change. `roles` is a full replacement — sending one ID to add a role
   * removes every other.
   */
  async edit(
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
   * Changes the bot's own nickname in a guild.
   *
   * @param guildId - The guild.
   * @param body - The nickname, or `null` to clear it.
   * @param options - Request options.
   * @returns The updated membership.
   *
   * @remarks
   * Needs `ChangeNickname` rather than `ManageNicknames`, which is the entire reason this is
   * a separate route and not `edit(guildId, ownId, …)`.
   */
  async editCurrent(
    guildId: Snowflake,
    body: RESTPatchAPICurrentGuildMemberJSONBody,
    options: RouteOptions = {},
  ): Promise<APIGuildMember> {
    return await this.#rest.patch<APIGuildMember>(`/guilds/${guildId}/members/@me`, {
      ...options,
      body,
    })
  }

  /**
   * Adds a role to a member.
   *
   * @param guildId - The guild.
   * @param userId - The member.
   * @param roleId - The role to add.
   * @param options - Request options.
   *
   * @remarks
   * Additive, unlike `roles` on {@link MemberRoutes.edit}, which replaces the list. This is
   * almost always the one wanted.
   */
  async addRole(
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
   * @param guildId - The guild.
   * @param userId - The member.
   * @param roleId - The role to remove.
   * @param options - Request options.
   */
  async removeRole(
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
   * Removes a member from a guild.
   *
   * @param guildId - The guild to remove from.
   * @param userId - The member to remove.
   * @param options - Request options.
   *
   * @remarks
   * A kick, not a ban: they can rejoin with a new invite. {@link BanRoutes.create} is the one
   * that keeps them out.
   */
  async remove(guildId: Snowflake, userId: Snowflake, options: RouteOptions = {}): Promise<void> {
    await this.#rest.delete<undefined>(`/guilds/${guildId}/members/${userId}`, options)
  }
}
