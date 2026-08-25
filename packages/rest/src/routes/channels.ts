import type {
  APIChannel,
  APIInvite,
  APIMessage,
  APIUser,
  RESTPostAPIChannelInviteJSONBody,
  RESTPostAPIChannelMessageThreadsJSONBody,
  RESTPostAPIChannelThreadsJSONBody,
  RESTGetAPIChannelMessageReactionsQuery,
  RESTGetAPIChannelMessagesQuery,
  RESTPatchAPIChannelJSONBody,
  RESTPatchAPIChannelMessageJSONBody,
  RESTPostAPIChannelMessageJSONBody,
  RESTPutAPIChannelPermissionJSONBody,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { MessageOptions, RouteOptions } from './options.js'

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
   * Lists a channel's invites. Needs `ManageChannels`.
   *
   * @param channelId - The channel to read.
   * @param options - Request options.
   * @returns Its invites.
   */
  async getInvites(channelId: Snowflake, options: RouteOptions = {}): Promise<APIInvite[]> {
    return await this.#rest.get<APIInvite[]>(`/channels/${channelId}/invites`, options)
  }

  /**
   * Creates an invite to a channel. Needs `CreateInstantInvite`.
   *
   * @param channelId - The channel to invite to.
   * @param body - How long it lives and how many may use it.
   * @param options - Request options.
   * @returns The invite.
   *
   * @remarks
   * **Discord's defaults are probably not the ones you want.** `max_age` defaults to a day
   * rather than never, and `unique` defaults to `false` — which returns an *equivalent
   * existing* invite instead of making a new one. A bot handing a fresh link to each user
   * needs `unique: true` or it will hand out the same code every time and be unable to tell
   * who joined through which.
   */
  async createInvite(
    channelId: Snowflake,
    body: RESTPostAPIChannelInviteJSONBody = {},
    options: RouteOptions = {},
  ): Promise<APIInvite> {
    return await this.#rest.post<APIInvite>(`/channels/${channelId}/invites`, { ...options, body })
  }

  /**
   * Starts a thread from a message.
   *
   * @param channelId - The channel the message is in.
   * @param messageId - The message to anchor the thread to.
   * @param body - The thread's name and settings.
   * @param options - Request options.
   * @returns The new thread.
   *
   * @remarks
   * The thread **shares the message's ID**, so a message can anchor at most one — a second
   * call answers `160004`. The thread is public: visibility follows the message, and there is
   * no `type` to choose, which is the opposite of {@link ChannelRoutes.startThread}.
   */
  async startThreadFromMessage(
    channelId: Snowflake,
    messageId: Snowflake,
    body: RESTPostAPIChannelMessageThreadsJSONBody,
    options: RouteOptions = {},
  ): Promise<APIChannel> {
    return await this.#rest.post<APIChannel>(
      `/channels/${channelId}/messages/${messageId}/threads`,
      { ...options, body },
    )
  }

  /**
   * Starts a thread that is not attached to a message.
   *
   * @param channelId - The channel to start it in.
   * @param body - The thread's name, type and settings.
   * @param options - Request options.
   * @returns The new thread.
   *
   * @remarks
   * **`type` defaults to a private thread**, which is the opposite of what starting one from
   * a message gives you. Naming it explicitly is worth the keystrokes.
   */
  async startThread(
    channelId: Snowflake,
    body: RESTPostAPIChannelThreadsJSONBody,
    options: RouteOptions = {},
  ): Promise<APIChannel> {
    return await this.#rest.post<APIChannel>(`/channels/${channelId}/threads`, {
      ...options,
      body,
    })
  }

  /**
   * Writes a permission overwrite for a role or a member. Needs `ManageRoles`.
   *
   * @param channelId - The channel.
   * @param overwriteId - The role or user the overwrite applies to.
   * @param body - What to allow and deny, and which of the two the ID is.
   * @param options - Request options.
   *
   * @remarks
   * **`type` is required and says which namespace the ID is in.** A role ID and a user ID are
   * both snowflakes, so Discord cannot infer it; omitting it is a 400 and getting it wrong
   * writes an overwrite for an entity that does not exist in that sense, silently.
   *
   * **A `PUT`, and it replaces the whole overwrite.** A permission in neither bitfield is
   * *inherited*, which is a third state distinct from allowed and denied — so sending only
   * `allow` resets every denial on that overwrite to inherited. Read the channel first if the
   * intent is to change one permission and leave the rest.
   */
  async setPermission(
    channelId: Snowflake,
    overwriteId: Snowflake,
    body: RESTPutAPIChannelPermissionJSONBody,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.put<undefined>(`/channels/${channelId}/permissions/${overwriteId}`, {
      ...options,
      body,
    })
  }

  /**
   * Removes a permission overwrite entirely. Needs `ManageRoles`.
   *
   * @param channelId - The channel.
   * @param overwriteId - The role or user whose overwrite to remove.
   * @param options - Request options.
   *
   * @remarks
   * Not the same as allowing nothing and denying nothing. Removing the overwrite returns the
   * role or member to whatever the guild and the category say; an empty overwrite keeps a row
   * that says "inherit", which looks identical in effect and different in the client.
   */
  async deletePermission(
    channelId: Snowflake,
    overwriteId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(`/channels/${channelId}/permissions/${overwriteId}`, options)
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
