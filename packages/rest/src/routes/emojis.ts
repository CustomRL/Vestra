import type {
  APIEmoji,
  RESTGetAPIApplicationEmojisResult,
  RESTPatchAPIApplicationEmojiJSONBody,
  RESTPatchAPIGuildEmojiJSONBody,
  RESTPostAPIApplicationEmojiJSONBody,
  RESTPostAPIGuildEmojiJSONBody,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * Emoji endpoints, for both guilds and applications.
 *
 * @remarks
 * **Two resources that look alike and are not interchangeable.** A guild emoji lives in one
 * guild, counts against that guild's slots, and can be limited to roles. An application emoji
 * belongs to the bot, works in every guild it is in, and has no role restriction — which is
 * why {@link EmojiRoutes.createForApplication} takes no `roles` rather than accepting and
 * ignoring it.
 *
 * **The image is a data URI**, `data:image/png;base64,…`, capped at 256 KiB. Discord will not
 * fetch a URL on the caller's behalf, and a plain base64 string without the prefix is
 * rejected with an error that does not say so.
 *
 * There is no route for changing an emoji's image. Replacing the picture means deleting and
 * recreating, which mints a new ID and breaks every message that used the old one — so the
 * absence is Discord's design rather than a gap here.
 */
export class EmojiRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Lists a guild's emojis.
   *
   * @param guildId - The guild.
   * @param options - Request options.
   * @returns Every emoji the guild has.
   *
   * @remarks
   * `user` is present on each entry only when the bot has `ManageGuildExpressions`, so a
   * caller that reads it must tolerate its absence rather than assume a permission.
   */
  async getForGuild(guildId: Snowflake, options: RouteOptions = {}): Promise<APIEmoji[]> {
    return await this.#rest.get<APIEmoji[]>(`/guilds/${guildId}/emojis`, options)
  }

  /**
   * Fetches one guild emoji.
   *
   * @param guildId - The guild.
   * @param emojiId - The emoji.
   * @param options - Request options.
   * @returns The emoji.
   */
  async getForGuildById(
    guildId: Snowflake,
    emojiId: Snowflake,
    options: RouteOptions = {},
  ): Promise<APIEmoji> {
    return await this.#rest.get<APIEmoji>(`/guilds/${guildId}/emojis/${emojiId}`, options)
  }

  /**
   * Uploads a guild emoji. Needs `CreateGuildExpressions`.
   *
   * @param guildId - The guild.
   * @param body - The name, the image as a data URI, and any role restriction.
   * @param options - Request options.
   * @returns The emoji that was created.
   */
  async createForGuild(
    guildId: Snowflake,
    body: RESTPostAPIGuildEmojiJSONBody,
    options: RouteOptions = {},
  ): Promise<APIEmoji> {
    return await this.#rest.post<APIEmoji>(`/guilds/${guildId}/emojis`, { ...options, body })
  }

  /**
   * Edits a guild emoji. Needs `ManageGuildExpressions`.
   *
   * @param guildId - The guild.
   * @param emojiId - The emoji.
   * @param body - The fields to change.
   * @param options - Request options.
   * @returns The updated emoji.
   *
   * @remarks
   * `roles` replaces the whole list rather than adding to it, and `null` removes the
   * restriction. Sending a single ID to "add a role" silently removes every other.
   */
  async editForGuild(
    guildId: Snowflake,
    emojiId: Snowflake,
    body: RESTPatchAPIGuildEmojiJSONBody,
    options: RouteOptions = {},
  ): Promise<APIEmoji> {
    return await this.#rest.patch<APIEmoji>(`/guilds/${guildId}/emojis/${emojiId}`, {
      ...options,
      body,
    })
  }

  /**
   * Deletes a guild emoji. Needs `ManageGuildExpressions`.
   *
   * @param guildId - The guild.
   * @param emojiId - The emoji.
   * @param options - Request options.
   */
  async deleteForGuild(
    guildId: Snowflake,
    emojiId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(`/guilds/${guildId}/emojis/${emojiId}`, options)
  }

  /**
   * Lists the application's own emojis.
   *
   * @param applicationId - The application.
   * @param options - Request options.
   * @returns The emojis, unwrapped from the object Discord returns.
   *
   * @remarks
   * The route answers `{ items: [...] }` rather than an array, alone among the listings in
   * this API. Unwrapped here so a caller does not have to remember which of the two emoji
   * listings is the odd one — the type still records what the wire carries.
   */
  async getForApplication(
    applicationId: Snowflake,
    options: RouteOptions = {},
  ): Promise<APIEmoji[]> {
    const result = await this.#rest.get<RESTGetAPIApplicationEmojisResult>(
      `/applications/${applicationId}/emojis`,
      options,
    )
    return result.items
  }

  /**
   * Fetches one application emoji.
   *
   * @param applicationId - The application.
   * @param emojiId - The emoji.
   * @param options - Request options.
   * @returns The emoji.
   */
  async getForApplicationById(
    applicationId: Snowflake,
    emojiId: Snowflake,
    options: RouteOptions = {},
  ): Promise<APIEmoji> {
    return await this.#rest.get<APIEmoji>(
      `/applications/${applicationId}/emojis/${emojiId}`,
      options,
    )
  }

  /**
   * Uploads an application emoji.
   *
   * @param applicationId - The application.
   * @param body - The name and the image as a data URI.
   * @param options - Request options.
   * @returns The emoji that was created.
   */
  async createForApplication(
    applicationId: Snowflake,
    body: RESTPostAPIApplicationEmojiJSONBody,
    options: RouteOptions = {},
  ): Promise<APIEmoji> {
    return await this.#rest.post<APIEmoji>(`/applications/${applicationId}/emojis`, {
      ...options,
      body,
    })
  }

  /**
   * Renames an application emoji.
   *
   * @param applicationId - The application.
   * @param emojiId - The emoji.
   * @param body - The new name.
   * @param options - Request options.
   * @returns The updated emoji.
   */
  async editForApplication(
    applicationId: Snowflake,
    emojiId: Snowflake,
    body: RESTPatchAPIApplicationEmojiJSONBody,
    options: RouteOptions = {},
  ): Promise<APIEmoji> {
    return await this.#rest.patch<APIEmoji>(`/applications/${applicationId}/emojis/${emojiId}`, {
      ...options,
      body,
    })
  }

  /**
   * Deletes an application emoji.
   *
   * @param applicationId - The application.
   * @param emojiId - The emoji.
   * @param options - Request options.
   */
  async deleteForApplication(
    applicationId: Snowflake,
    emojiId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(`/applications/${applicationId}/emojis/${emojiId}`, options)
  }
}
