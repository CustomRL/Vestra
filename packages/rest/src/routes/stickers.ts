import type {
  APISticker,
  APIStickerPack,
  RESTGetAPIStickerPacksResult,
  RESTPatchAPIGuildStickerJSONBody,
  RESTPostAPIGuildStickerFormFields,
  Snowflake,
} from '@vestra/types'
import type { RawFile } from '../RESTOptions.js'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * Sticker endpoints.
 *
 * @remarks
 * **Creating one is the only route in this API whose parameters are form parts.** Every other
 * multipart endpoint carries its JSON in a `payload_json` part beside the files; this one
 * wants `name`, `description` and `tags` as three separate text fields. Sending them the usual
 * way returns a validation error naming fields the caller believes it did send, so
 * {@link StickerRoutes.createForGuild} takes them apart and posts them as fields.
 *
 * **`tags` is required and may not be empty**, which is easy to miss because the field reads
 * like an optional convenience. Discord's own client fills it with the name of an emoji.
 *
 * The asset is fixed at upload: {@link StickerRoutes.editForGuild} changes metadata only, and
 * there is no route for replacing the image.
 */
export class StickerRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Fetches any sticker by ID, standard or guild.
   *
   * @param stickerId - The sticker.
   * @param options - Request options.
   * @returns The sticker.
   */
  async get(stickerId: Snowflake, options: RouteOptions = {}): Promise<APISticker> {
    return await this.#rest.get<APISticker>(`/stickers/${stickerId}`, options)
  }

  /**
   * Lists the sticker packs Discord ships.
   *
   * @param options - Request options.
   * @returns The packs, unwrapped from the object the route returns.
   */
  async getPacks(options: RouteOptions = {}): Promise<APIStickerPack[]> {
    const result = await this.#rest.get<RESTGetAPIStickerPacksResult>('/sticker-packs', options)
    return result.sticker_packs
  }

  /**
   * Fetches one sticker pack.
   *
   * @param packId - The pack.
   * @param options - Request options.
   * @returns The pack.
   */
  async getPack(packId: Snowflake, options: RouteOptions = {}): Promise<APIStickerPack> {
    return await this.#rest.get<APIStickerPack>(`/sticker-packs/${packId}`, options)
  }

  /**
   * Lists a guild's stickers.
   *
   * @param guildId - The guild.
   * @param options - Request options.
   * @returns Every sticker the guild has uploaded.
   *
   * @remarks
   * `user` appears on each entry only with `CreateGuildExpressions` or
   * `ManageGuildExpressions`, so its absence means a missing permission rather than a
   * missing uploader.
   */
  async getForGuild(guildId: Snowflake, options: RouteOptions = {}): Promise<APISticker[]> {
    return await this.#rest.get<APISticker[]>(`/guilds/${guildId}/stickers`, options)
  }

  /**
   * Fetches one guild sticker.
   *
   * @param guildId - The guild.
   * @param stickerId - The sticker.
   * @param options - Request options.
   * @returns The sticker.
   */
  async getForGuildById(
    guildId: Snowflake,
    stickerId: Snowflake,
    options: RouteOptions = {},
  ): Promise<APISticker> {
    return await this.#rest.get<APISticker>(`/guilds/${guildId}/stickers/${stickerId}`, options)
  }

  /**
   * Uploads a guild sticker. Needs `CreateGuildExpressions`.
   *
   * @param guildId - The guild.
   * @param fields - The name, description and tags, sent as discrete form parts.
   * @param file - The asset: PNG, APNG, GIF or Lottie JSON, at most 512 KiB.
   * @param options - Request options.
   * @returns The sticker that was created.
   *
   * @remarks
   * The file part is named `file`, not `files[0]`. That is the one detail this route cannot
   * share with the message uploads, and getting it wrong produces a request Discord accepts
   * and then rejects for a missing asset.
   *
   * Lottie is accepted only from a guild with the `VERIFIED` or `PARTNERED` feature.
   */
  async createForGuild(
    guildId: Snowflake,
    fields: RESTPostAPIGuildStickerFormFields,
    file: RawFile,
    options: RouteOptions = {},
  ): Promise<APISticker> {
    return await this.#rest.post<APISticker>(`/guilds/${guildId}/stickers`, {
      ...options,
      files: [{ ...file, key: 'file' }],
      fields: { name: fields.name, description: fields.description, tags: fields.tags },
    })
  }

  /**
   * Edits a guild sticker's metadata. Needs `ManageGuildExpressions`.
   *
   * @param guildId - The guild.
   * @param stickerId - The sticker.
   * @param body - The fields to change.
   * @param options - Request options.
   * @returns The updated sticker.
   *
   * @remarks
   * JSON, unlike the create route, because the image is not among the things that can change.
   */
  async editForGuild(
    guildId: Snowflake,
    stickerId: Snowflake,
    body: RESTPatchAPIGuildStickerJSONBody,
    options: RouteOptions = {},
  ): Promise<APISticker> {
    return await this.#rest.patch<APISticker>(`/guilds/${guildId}/stickers/${stickerId}`, {
      ...options,
      body,
    })
  }

  /**
   * Deletes a guild sticker. Needs `ManageGuildExpressions`.
   *
   * @param guildId - The guild.
   * @param stickerId - The sticker.
   * @param options - Request options.
   */
  async deleteForGuild(
    guildId: Snowflake,
    stickerId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(`/guilds/${guildId}/stickers/${stickerId}`, options)
  }
}
