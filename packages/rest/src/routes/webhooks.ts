import type {
  APIMessage,
  APIWebhook,
  RESTPatchAPIWebhookJSONBody,
  RESTPostAPIChannelWebhookJSONBody,
  RESTPostAPIWebhookExecuteJSONBody,
  RESTPostAPIWebhookExecuteQuery,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { MessageOptions, RouteOptions } from './channels.js'

/**
 * Webhook endpoints.
 *
 * @remarks
 * **The token routes carry no bot token, and that is the point.** A webhook's ID and token
 * together are a credential in their own right, so `GET|PATCH|DELETE /webhooks/{id}/{token}`
 * and executing one are unauthenticated — the same property the interaction callbacks have,
 * for the same reason. Sending `Authorization` as well would put the bot token on requests a
 * webhook-relay process makes constantly, to no purpose, and would mean such a process needed
 * the bot token at all.
 *
 * That is why the token forms are separate methods rather than an optional argument. The
 * difference is not a parameter, it is which credential the request proves and therefore what
 * a caller must be trusted with.
 */
export class WebhookRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Creates a webhook on a channel. Needs `ManageWebhooks`.
   *
   * @param channelId - The channel to create it on.
   * @param body - The webhook's name and avatar.
   * @param options - Request options.
   * @returns The new webhook, including its token.
   *
   * @remarks
   * This is the only response that carries `token`. Fetching the webhook later with bot
   * authorisation returns it too, but a webhook created and then not stored has to be looked
   * up again rather than reconstructed.
   */
  async create(
    channelId: Snowflake,
    body: RESTPostAPIChannelWebhookJSONBody,
    options: RouteOptions = {},
  ): Promise<APIWebhook> {
    return await this.#rest.post<APIWebhook>(`/channels/${channelId}/webhooks`, {
      ...options,
      body,
    })
  }

  /**
   * Fetches a channel's webhooks. Needs `ManageWebhooks`.
   *
   * @param channelId - The channel to read.
   * @param options - Request options.
   * @returns Its webhooks.
   */
  async getForChannel(channelId: Snowflake, options: RouteOptions = {}): Promise<APIWebhook[]> {
    return await this.#rest.get<APIWebhook[]>(`/channels/${channelId}/webhooks`, options)
  }

  /**
   * Fetches every webhook in a guild. Needs `ManageWebhooks`.
   *
   * @param guildId - The guild to read.
   * @param options - Request options.
   * @returns Its webhooks.
   */
  async getForGuild(guildId: Snowflake, options: RouteOptions = {}): Promise<APIWebhook[]> {
    return await this.#rest.get<APIWebhook[]>(`/guilds/${guildId}/webhooks`, options)
  }

  /**
   * Fetches a webhook with bot authorisation.
   *
   * @param webhookId - The webhook to fetch.
   * @param options - Request options.
   * @returns The webhook, including `user`.
   */
  async get(webhookId: Snowflake, options: RouteOptions = {}): Promise<APIWebhook> {
    return await this.#rest.get<APIWebhook>(`/webhooks/${webhookId}`, options)
  }

  /**
   * Fetches a webhook with its own token, and no bot token.
   *
   * @param webhookId - The webhook to fetch.
   * @param token - The webhook's token.
   * @param options - Request options.
   * @returns The webhook, without `user`.
   *
   * @remarks
   * `user` is absent here by Discord's design rather than by omission: the route is
   * unauthenticated, so returning the creator would leak who made the webhook to anybody
   * holding the URL.
   */
  async getWithToken(
    webhookId: Snowflake,
    token: string,
    options: RouteOptions = {},
  ): Promise<APIWebhook> {
    return await this.#rest.get<APIWebhook>(`/webhooks/${webhookId}/${token}`, {
      ...options,
      auth: false,
    })
  }

  /**
   * Modifies a webhook. Needs `ManageWebhooks`.
   *
   * @param webhookId - The webhook to modify.
   * @param body - The fields to change.
   * @param options - Request options.
   * @returns The updated webhook.
   */
  async edit(
    webhookId: Snowflake,
    body: RESTPatchAPIWebhookJSONBody,
    options: RouteOptions = {},
  ): Promise<APIWebhook> {
    return await this.#rest.patch<APIWebhook>(`/webhooks/${webhookId}`, { ...options, body })
  }

  /**
   * Modifies a webhook with its own token, and no bot token.
   *
   * @param webhookId - The webhook to modify.
   * @param token - The webhook's token.
   * @param body - The fields to change. `channel_id` is not accepted here.
   * @param options - Request options.
   * @returns The updated webhook.
   *
   * @remarks
   * Moving a webhook between channels needs `ManageWebhooks` on both, which a token cannot
   * prove, so Discord rejects `channel_id` on this route. The type omits it rather than
   * letting a caller discover that as a `50035`.
   */
  async editWithToken(
    webhookId: Snowflake,
    token: string,
    body: Omit<RESTPatchAPIWebhookJSONBody, 'channel_id'>,
    options: RouteOptions = {},
  ): Promise<APIWebhook> {
    return await this.#rest.patch<APIWebhook>(`/webhooks/${webhookId}/${token}`, {
      ...options,
      auth: false,
      body,
    })
  }

  /**
   * Deletes a webhook. Needs `ManageWebhooks`.
   *
   * @param webhookId - The webhook to delete.
   * @param options - Request options.
   */
  async delete(webhookId: Snowflake, options: RouteOptions = {}): Promise<void> {
    await this.#rest.delete<undefined>(`/webhooks/${webhookId}`, options)
  }

  /**
   * Deletes a webhook with its own token, and no bot token.
   *
   * @param webhookId - The webhook to delete.
   * @param token - The webhook's token.
   * @param options - Request options.
   */
  async deleteWithToken(
    webhookId: Snowflake,
    token: string,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(`/webhooks/${webhookId}/${token}`, {
      ...options,
      auth: false,
    })
  }

  /**
   * Posts a message through a webhook.
   *
   * @param webhookId - The webhook to execute.
   * @param token - The webhook's token.
   * @param body - The message.
   * @param query - Whether to wait for the message, and which thread to post into.
   * @param options - Request options, including files.
   * @returns The message, but **only** when `wait` was asked for.
   *
   * @remarks
   * **The return is `undefined` unless `query.wait` is true.** Discord answers `204` by
   * default and the message is never sent back, so a caller that needs the message ID — to
   * edit or delete it later — has to ask, and pays a round trip for it. Typed as
   * `APIMessage | undefined` rather than overloaded on the query, because the query is a
   * runtime value and an overload would promise at compile time what only the request settles.
   */
  async execute(
    webhookId: Snowflake,
    token: string,
    body: RESTPostAPIWebhookExecuteJSONBody,
    query: RESTPostAPIWebhookExecuteQuery = {},
    options: MessageOptions = {},
  ): Promise<APIMessage | undefined> {
    return await this.#rest.post<APIMessage | undefined>(`/webhooks/${webhookId}/${token}`, {
      ...options,
      auth: false,
      body,
      query: query as Record<string, string | number | boolean | undefined>,
    })
  }
}
