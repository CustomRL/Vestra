import type {
  APIRole,
  RESTPatchAPIGuildRoleJSONBody,
  RESTPatchAPIGuildRolePositionsJSONBody,
  RESTPostAPIGuildRoleJSONBody,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * Guild role endpoints.
 *
 * @remarks
 * **Position is the whole permission model.** A role can only be granted, edited or assigned
 * by somebody with a higher one, so {@link RoleRoutes.setPositions} is not cosmetic — moving a
 * role changes who can touch it and what its holders outrank. Positions are guild-wide and
 * contiguous, so moving one renumbers others; sending only the roles that move is correct and
 * is what the route is for.
 *
 * **Editing a role is a full replacement of the fields it names.** `permissions` is a bitfield
 * sent whole, so a caller that reads, modifies one bit and writes back is doing the right
 * thing, and one that sends a single permission has revoked every other.
 */
export class RoleRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Lists a guild's roles.
   *
   * @param guildId - The guild.
   * @param options - Request options.
   * @returns Every role, including `@everyone`.
   *
   * @remarks
   * The `@everyone` role shares the guild's ID, which is how it is recognised — it has no flag
   * saying so.
   */
  async getAll(guildId: Snowflake, options: RouteOptions = {}): Promise<APIRole[]> {
    return await this.#rest.get<APIRole[]>(`/guilds/${guildId}/roles`, options)
  }

  /**
   * Fetches one role.
   *
   * @param guildId - The guild.
   * @param roleId - The role.
   * @param options - Request options.
   * @returns The role.
   */
  async get(guildId: Snowflake, roleId: Snowflake, options: RouteOptions = {}): Promise<APIRole> {
    return await this.#rest.get<APIRole>(`/guilds/${guildId}/roles/${roleId}`, options)
  }

  /**
   * Creates a role.
   *
   * @param guildId - The guild.
   * @param body - The role to create.
   * @param options - Request options.
   * @returns The role that was created.
   *
   * @remarks
   * Created at the bottom of the list, whatever else is sent — position is set by
   * {@link RoleRoutes.setPositions} afterwards, not here.
   */
  async create(
    guildId: Snowflake,
    body: RESTPostAPIGuildRoleJSONBody = {},
    options: RouteOptions = {},
  ): Promise<APIRole> {
    return await this.#rest.post<APIRole>(`/guilds/${guildId}/roles`, { ...options, body })
  }

  /**
   * Edits a role.
   *
   * @param guildId - The guild.
   * @param roleId - The role.
   * @param body - The fields to change.
   * @param options - Request options.
   * @returns The updated role.
   *
   * @remarks
   * `permissions` is a whole bitfield. Sending one permission grants that and revokes every
   * other, so the usual shape is read, modify, write back.
   */
  async edit(
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
   * Moves roles up or down the hierarchy.
   *
   * @param guildId - The guild.
   * @param body - The roles to move and where to.
   * @param options - Request options.
   * @returns Every role, in its new order.
   *
   * @remarks
   * **A `PATCH` on the collection**, not on each role, because positions are contiguous and
   * moving one renumbers others — one request per role would pass through states that are not
   * what the caller asked for.
   *
   * Not cosmetic: a role can only be granted or edited by somebody holding a higher one, so
   * this changes who can administer what.
   */
  async setPositions(
    guildId: Snowflake,
    body: RESTPatchAPIGuildRolePositionsJSONBody,
    options: RouteOptions = {},
  ): Promise<APIRole[]> {
    return await this.#rest.patch<APIRole[]>(`/guilds/${guildId}/roles`, { ...options, body })
  }

  /**
   * Deletes a role.
   *
   * @param guildId - The guild.
   * @param roleId - The role.
   * @param options - Request options.
   *
   * @remarks
   * Discord sends no member updates for this. Every cached member goes on listing the role
   * that no longer exists, which `@vestra/core` repairs on the dispatch — a consumer reading
   * members from elsewhere has to do the same.
   */
  async delete(guildId: Snowflake, roleId: Snowflake, options: RouteOptions = {}): Promise<void> {
    await this.#rest.delete<undefined>(`/guilds/${guildId}/roles/${roleId}`, options)
  }
}
