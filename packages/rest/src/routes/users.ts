import type { APIChannel, APIUser, RESTPatchAPICurrentUserJSONBody, Snowflake } from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * User endpoints.
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
}
