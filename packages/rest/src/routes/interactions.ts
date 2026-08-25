import type {
  APIMessage,
  RESTPatchAPIInteractionFollowupJSONBody,
  RESTPatchAPIInteractionOriginalResponseJSONBody,
  RESTPostAPIInteractionCallbackJSONBody,
  RESTPostAPIInteractionFollowupJSONBody,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { MessageOptions, RouteOptions } from './options.js'

/**
 * Interaction response endpoints.
 *
 * @remarks
 * **These routes authenticate with the interaction token, not the bot token**, and every method
 * here sends `auth: false` for that reason. Sending the bot token as well is not merely
 * redundant: an interaction token is valid for fifteen minutes and is the only credential
 * Discord checks, so attaching `Authorization` would leak the bot token to no purpose on the
 * one request path a bot makes most often.
 *
 * **They are also the one route family the rate limiter does not serialise.** `BucketRegistry`
 * marks anything under `/interactions/` as exempt from the global limit and not queued, because
 * the initial response has a **three-second deadline** — a queue would blow through it — and
 * because interaction callbacks do not count against the global allowance, so a bot under load
 * can still answer interactions while its other traffic is throttled.
 *
 * **The three-second deadline shapes the whole surface.** {@link InteractionRoutes.reply} must
 * land within it or Discord shows the user "this interaction failed" and the token is spent.
 * Anything slower defers first — {@link InteractionRoutes.reply} with a deferred response type
 * — which buys fifteen minutes, and the real answer goes out as
 * {@link InteractionRoutes.editReply} or a followup.
 */
export class InteractionRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Responds to an interaction.
   *
   * @param interactionId - The interaction's ID.
   * @param token - The interaction token.
   * @param body - The response.
   * @param options - Request options, including files.
   *
   * @remarks
   * **Exactly once, within three seconds.** A second call to this route on the same interaction
   * is a 400: the initial response is a single slot. Everything after it is
   * {@link InteractionRoutes.editReply} or {@link InteractionRoutes.followUp}.
   */
  async reply(
    interactionId: Snowflake,
    token: string,
    body: RESTPostAPIInteractionCallbackJSONBody,
    options: MessageOptions = {},
  ): Promise<void> {
    await this.#rest.post<undefined>(`/interactions/${interactionId}/${token}/callback`, {
      ...options,
      auth: false,
      body,
    })
  }

  /**
   * Fetches the response sent by {@link InteractionRoutes.reply}.
   *
   * @param applicationId - The application's ID.
   * @param token - The interaction token.
   * @param options - Request options.
   * @returns The message.
   *
   * @remarks
   * Discord does not return the message from the callback route itself, which is why this
   * exists: the initial response is the one message a bot sends that it does not get back.
   */
  async getReply(
    applicationId: Snowflake,
    token: string,
    options: RouteOptions = {},
  ): Promise<APIMessage> {
    return await this.#rest.get<APIMessage>(
      `/webhooks/${applicationId}/${token}/messages/@original`,
      { ...options, auth: false },
    )
  }

  /**
   * Edits the response sent by {@link InteractionRoutes.reply}.
   *
   * @param applicationId - The application's ID.
   * @param token - The interaction token.
   * @param body - The fields to change.
   * @param options - Request options, including files.
   * @returns The edited message.
   *
   * @remarks
   * This is how a deferred interaction is completed: defer within three seconds, do the work,
   * then edit. The token is good for fifteen minutes from the interaction, not from the defer.
   */
  async editReply(
    applicationId: Snowflake,
    token: string,
    body: RESTPatchAPIInteractionOriginalResponseJSONBody,
    options: MessageOptions = {},
  ): Promise<APIMessage> {
    return await this.#rest.patch<APIMessage>(
      `/webhooks/${applicationId}/${token}/messages/@original`,
      { ...options, auth: false, body },
    )
  }

  /**
   * Deletes the response sent by {@link InteractionRoutes.reply}.
   *
   * @param applicationId - The application's ID.
   * @param token - The interaction token.
   * @param options - Request options.
   */
  async deleteReply(
    applicationId: Snowflake,
    token: string,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(`/webhooks/${applicationId}/${token}/messages/@original`, {
      ...options,
      auth: false,
    })
  }

  /**
   * Sends an additional message for an interaction.
   *
   * @param applicationId - The application's ID.
   * @param token - The interaction token.
   * @param body - The message to send.
   * @param options - Request options, including files.
   * @returns The message that was sent.
   *
   * @remarks
   * A followup is a webhook execution, which is why it takes a username and avatar override the
   * initial response does not. Any number may be sent while the token is valid.
   */
  async followUp(
    applicationId: Snowflake,
    token: string,
    body: RESTPostAPIInteractionFollowupJSONBody,
    options: MessageOptions = {},
  ): Promise<APIMessage> {
    return await this.#rest.post<APIMessage>(`/webhooks/${applicationId}/${token}`, {
      ...options,
      auth: false,
      body,
    })
  }

  /**
   * Fetches a followup message.
   *
   * @param applicationId - The application's ID.
   * @param token - The interaction token.
   * @param messageId - The followup's ID.
   * @param options - Request options.
   * @returns The message.
   */
  async getFollowUp(
    applicationId: Snowflake,
    token: string,
    messageId: Snowflake,
    options: RouteOptions = {},
  ): Promise<APIMessage> {
    return await this.#rest.get<APIMessage>(
      `/webhooks/${applicationId}/${token}/messages/${messageId}`,
      { ...options, auth: false },
    )
  }

  /**
   * Edits a followup message.
   *
   * @param applicationId - The application's ID.
   * @param token - The interaction token.
   * @param messageId - The followup's ID.
   * @param body - The fields to change.
   * @param options - Request options, including files.
   * @returns The edited message.
   */
  async editFollowUp(
    applicationId: Snowflake,
    token: string,
    messageId: Snowflake,
    body: RESTPatchAPIInteractionFollowupJSONBody,
    options: MessageOptions = {},
  ): Promise<APIMessage> {
    return await this.#rest.patch<APIMessage>(
      `/webhooks/${applicationId}/${token}/messages/${messageId}`,
      { ...options, auth: false, body },
    )
  }

  /**
   * Deletes a followup message.
   *
   * @param applicationId - The application's ID.
   * @param token - The interaction token.
   * @param messageId - The followup's ID.
   * @param options - Request options.
   */
  async deleteFollowUp(
    applicationId: Snowflake,
    token: string,
    messageId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(
      `/webhooks/${applicationId}/${token}/messages/${messageId}`,
      { ...options, auth: false },
    )
  }
}
