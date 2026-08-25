import type {
  APIChannel,
  APIMessage,
  APIUser,
  RESTGetAPIChannelMessageReactionsQuery,
  RESTGetAPIChannelMessagesQuery,
  RESTPatchAPIChannelJSONBody,
  RESTPatchAPIChannelMessageJSONBody,
  RESTPostAPIChannelMessageJSONBody,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { RawFile } from '../RESTOptions.js'

/** Options accepted by every route method. */
export interface RouteOptions {
  /** A reason recorded in the guild's audit log. */
  reason?: string
  /** Aborts the request, including while it waits in a rate-limit queue. */
  signal?: AbortSignal
}

/** Options for sending or editing a message. */
export interface MessageOptions extends RouteOptions {
  /** Files to upload alongside the message. */
  files?: RawFile[]
}

/**
 * Channel and message endpoints.
 *
 * @remarks
 * Hand-written rather than inferred from route template literals. The resulting types
 * are identical, the errors are readable, and adding an endpoint is a method rather than
 * an exercise in conditional types — which matters more for a library people contribute
 * to than the cleverness would.
 */
export class ChannelRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Fetches a channel.
   *
   * @param channelId - The channel to fetch.
   * @param options - Request options.
   * @returns The channel.
   */
  async get(channelId: Snowflake, options: RouteOptions = {}): Promise<APIChannel> {
    return await this.#rest.get<APIChannel>(`/channels/${channelId}`, options)
  }

  /**
   * Modifies a channel.
   *
   * @param channelId - The channel to modify.
   * @param body - The fields to change.
   * @param options - Request options.
   * @returns The updated channel.
   */
  async edit(
    channelId: Snowflake,
    body: RESTPatchAPIChannelJSONBody,
    options: RouteOptions = {},
  ): Promise<APIChannel> {
    return await this.#rest.patch<APIChannel>(`/channels/${channelId}`, { ...options, body })
  }

  /**
   * Deletes a channel, or closes a direct message.
   *
   * @param channelId - The channel to delete.
   * @param options - Request options.
   * @returns The deleted channel.
   */
  async delete(channelId: Snowflake, options: RouteOptions = {}): Promise<APIChannel> {
    return await this.#rest.delete<APIChannel>(`/channels/${channelId}`, options)
  }

  /**
   * Fetches messages from a channel.
   *
   * @param channelId - The channel to read.
   * @param query - Pagination options. `around`, `before` and `after` are mutually exclusive.
   * @param options - Request options.
   * @returns The messages, newest first.
   */
  async getMessages(
    channelId: Snowflake,
    query: RESTGetAPIChannelMessagesQuery = {},
    options: RouteOptions = {},
  ): Promise<APIMessage[]> {
    return await this.#rest.get<APIMessage[]>(`/channels/${channelId}/messages`, {
      ...options,
      query: query as Record<string, string | number | boolean | undefined>,
    })
  }

  /**
   * Fetches a single message.
   *
   * @param channelId - The channel the message is in.
   * @param messageId - The message to fetch.
   * @param options - Request options.
   * @returns The message.
   */
  async getMessage(
    channelId: Snowflake,
    messageId: Snowflake,
    options: RouteOptions = {},
  ): Promise<APIMessage> {
    return await this.#rest.get<APIMessage>(`/channels/${channelId}/messages/${messageId}`, options)
  }

  /**
   * Sends a message.
   *
   * @param channelId - The channel to send to.
   * @param body - The message to send.
   * @param options - Request options, including files to upload.
   * @returns The created message.
   */
  async createMessage(
    channelId: Snowflake,
    body: RESTPostAPIChannelMessageJSONBody,
    options: MessageOptions = {},
  ): Promise<APIMessage> {
    return await this.#rest.post<APIMessage>(`/channels/${channelId}/messages`, {
      ...options,
      body,
    })
  }

  /**
   * Edits a message.
   *
   * @param channelId - The channel the message is in.
   * @param messageId - The message to edit.
   * @param body - The fields to change. Omitting a field leaves it unchanged.
   * @param options - Request options, including files to upload.
   * @returns The updated message.
   */
  async editMessage(
    channelId: Snowflake,
    messageId: Snowflake,
    body: RESTPatchAPIChannelMessageJSONBody,
    options: MessageOptions = {},
  ): Promise<APIMessage> {
    return await this.#rest.patch<APIMessage>(`/channels/${channelId}/messages/${messageId}`, {
      ...options,
      body,
    })
  }

  /**
   * Deletes a message.
   *
   * @param channelId - The channel the message is in.
   * @param messageId - The message to delete.
   * @param options - Request options.
   */
  async deleteMessage(
    channelId: Snowflake,
    messageId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(`/channels/${channelId}/messages/${messageId}`, options)
  }

  /**
   * Deletes between 2 and 100 messages at once.
   *
   * @param channelId - The channel to delete from.
   * @param messageIds - The messages to delete.
   * @param options - Request options.
   *
   * @remarks
   * Fails wholesale if any message is older than two weeks — Discord does not delete the
   * eligible subset.
   */
  async bulkDeleteMessages(
    channelId: Snowflake,
    messageIds: Snowflake[],
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.post<undefined>(`/channels/${channelId}/messages/bulk-delete`, {
      ...options,
      body: { messages: messageIds },
    })
  }

  /**
   * Adds a reaction to a message as the current user.
   *
   * @param channelId - The channel the message is in.
   * @param messageId - The message to react to.
   * @param emoji - A unicode emoji, or `name:id` for a custom one.
   * @param options - Request options.
   */
  async addReaction(
    channelId: Snowflake,
    messageId: Snowflake,
    emoji: string,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.put<undefined>(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
      options,
    )
  }

  /**
   * Removes the current user's reaction.
   *
   * @param channelId - The channel the message is in.
   * @param messageId - The message to unreact to.
   * @param emoji - A unicode emoji, or `name:id` for a custom one.
   * @param options - Request options.
   *
   * @remarks
   * Separate from {@link ChannelRoutes.removeUserReaction} because they need different
   * permissions: taking back your own reaction needs none, and removing somebody else's needs
   * `ManageMessages`. One method taking an optional user ID would hide that.
   */
  async removeOwnReaction(
    channelId: Snowflake,
    messageId: Snowflake,
    emoji: string,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
      options,
    )
  }

  /**
   * Removes another user's reaction. Needs `ManageMessages`.
   *
   * @param channelId - The channel the message is in.
   * @param messageId - The message to unreact to.
   * @param emoji - A unicode emoji, or `name:id` for a custom one.
   * @param userId - Whose reaction to remove.
   * @param options - Request options.
   */
  async removeUserReaction(
    channelId: Snowflake,
    messageId: Snowflake,
    emoji: string,
    userId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(
      `/channels/${channelId}/messages/${messageId}/reactions/` +
        `${encodeURIComponent(emoji)}/${userId}`,
      options,
    )
  }

  /**
   * Fetches who reacted with one emoji.
   *
   * @param channelId - The channel the message is in.
   * @param messageId - The message to read.
   * @param emoji - A unicode emoji, or `name:id` for a custom one.
   * @param query - Pagination.
   * @param options - Request options.
   * @returns The users who reacted.
   *
   * @remarks
   * Capped at 100 per call and paginated by user ID, so a busy reaction needs several: pass
   * the last ID returned as `after` until fewer than `limit` come back.
   */
  async getReactions(
    channelId: Snowflake,
    messageId: Snowflake,
    emoji: string,
    query: RESTGetAPIChannelMessageReactionsQuery = {},
    options: RouteOptions = {},
  ): Promise<APIUser[]> {
    return await this.#rest.get<APIUser[]>(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      { ...options, query: query as Record<string, string | number | boolean | undefined> },
    )
  }

  /**
   * Removes every reaction from a message. Needs `ManageMessages`.
   *
   * @param channelId - The channel the message is in.
   * @param messageId - The message to clear.
   * @param options - Request options.
   */
  async removeAllReactions(
    channelId: Snowflake,
    messageId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(
      `/channels/${channelId}/messages/${messageId}/reactions`,
      options,
    )
  }

  /**
   * Removes every reaction of one emoji. Needs `ManageMessages`.
   *
   * @param channelId - The channel the message is in.
   * @param messageId - The message to clear.
   * @param emoji - A unicode emoji, or `name:id` for a custom one.
   * @param options - Request options.
   */
  async removeEmojiReactions(
    channelId: Snowflake,
    messageId: Snowflake,
    emoji: string,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      options,
    )
  }

  /**
   * Fetches a channel's pinned messages, newest first.
   *
   * @param channelId - The channel to read.
   * @param options - Request options.
   * @returns The pinned messages.
   */
  async getPinnedMessages(channelId: Snowflake, options: RouteOptions = {}): Promise<APIMessage[]> {
    return await this.#rest.get<APIMessage[]>(`/channels/${channelId}/pins`, options)
  }

  /**
   * Pins a message. Needs `ManageMessages`.
   *
   * @param channelId - The channel the message is in.
   * @param messageId - The message to pin.
   * @param options - Request options.
   *
   * @remarks
   * A channel holds at most 50 pins and Discord answers the 51st with `30003`, which arrives
   * as a `DiscordAPIError` rather than as a silent no-op.
   */
  async pinMessage(
    channelId: Snowflake,
    messageId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.put<undefined>(`/channels/${channelId}/pins/${messageId}`, options)
  }

  /**
   * Unpins a message. Needs `ManageMessages`.
   *
   * @param channelId - The channel the message is in.
   * @param messageId - The message to unpin.
   * @param options - Request options.
   */
  async unpinMessage(
    channelId: Snowflake,
    messageId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(`/channels/${channelId}/pins/${messageId}`, options)
  }

  /**
   * Triggers the typing indicator for about ten seconds.
   *
   * @param channelId - The channel to appear to be typing in.
   * @param options - Request options.
   */
  async triggerTyping(channelId: Snowflake, options: RouteOptions = {}): Promise<void> {
    await this.#rest.post<undefined>(`/channels/${channelId}/typing`, options)
  }
}
