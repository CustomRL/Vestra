import type { RESTGetAPIGatewayBotResult, RESTGetAPIGatewayResult } from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * Gateway bootstrap endpoints.
 */
export class GatewayRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Fetches the gateway URL, without authorisation.
   *
   * @param options - Request options.
   * @returns The websocket URL.
   */
  async get(options: RouteOptions = {}): Promise<RESTGetAPIGatewayResult> {
    return await this.#rest.get<RESTGetAPIGatewayResult>('/gateway', { ...options, auth: false })
  }

  /**
   * Fetches the gateway URL, recommended shard count and session start limits.
   *
   * @param options - Request options.
   * @returns The bot gateway information.
   *
   * @remarks
   * Always prefer this over `/gateway` before connecting. `session_start_limit` carries
   * the daily identify budget and `max_concurrency`; identifying past the budget gets the
   * token temporarily banned, and a client that ignores `max_concurrency` works in
   * development with one shard and fails as soon as it scales out.
   */
  async getBot(options: RouteOptions = {}): Promise<RESTGetAPIGatewayBotResult> {
    return await this.#rest.get<RESTGetAPIGatewayBotResult>('/gateway/bot', options)
  }
}
