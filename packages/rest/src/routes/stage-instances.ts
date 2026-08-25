import type {
  APIStageInstance,
  RESTPatchAPIStageInstanceJSONBody,
  RESTPostAPIStageInstanceJSONBody,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * Stage instance endpoints.
 *
 * @remarks
 * **Every method after `create` takes the stage channel's ID, not the instance's.** The
 * instance has an ID of its own and returns it, and passing that ID here gets a 404 for a
 * stage that is plainly live. It is the one thing about this resource that reads wrong and
 * compiles fine, which is why the parameter is named `channelId` throughout.
 *
 * That follows from what an instance is. A stage channel exists permanently; its instance
 * exists only while the stage is running. The channel is therefore the stable name for "the
 * stage happening here", and creating one is a `POST` to the collection with the channel in
 * the body rather than a `POST` to the channel.
 *
 * **Deleting the instance ends the stage.** So does letting it run out of speakers — Discord
 * removes it after a few minutes and sends `stageInstanceDelete` with nobody having asked.
 */
export class StageInstanceRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Takes a stage channel live.
   *
   * @param body - The channel, the blurb, and who may see it.
   * @param options - Request options.
   * @returns The instance that was created.
   *
   * @remarks
   * `send_start_notification` pings `@everyone` and needs `MentionEveryone`. It defaults to
   * `false`, which is the right default for a library and the wrong one for a caller who
   * assumed starting a stage announces it.
   */
  async create(
    body: RESTPostAPIStageInstanceJSONBody,
    options: RouteOptions = {},
  ): Promise<APIStageInstance> {
    return await this.#rest.post<APIStageInstance>('/stage-instances', { ...options, body })
  }

  /**
   * Fetches the live instance of a stage channel.
   *
   * @param channelId - The stage channel, not the instance.
   * @param options - Request options.
   * @returns The instance.
   *
   * @remarks
   * A 404 here means the stage is not live rather than that the channel is missing, and that
   * is the intended way to ask: there is no field on the channel that says so.
   */
  async get(channelId: Snowflake, options: RouteOptions = {}): Promise<APIStageInstance> {
    return await this.#rest.get<APIStageInstance>(`/stage-instances/${channelId}`, options)
  }

  /**
   * Edits a live stage.
   *
   * @param channelId - The stage channel, not the instance.
   * @param body - The fields to change.
   * @param options - Request options.
   * @returns The updated instance.
   */
  async edit(
    channelId: Snowflake,
    body: RESTPatchAPIStageInstanceJSONBody,
    options: RouteOptions = {},
  ): Promise<APIStageInstance> {
    return await this.#rest.patch<APIStageInstance>(`/stage-instances/${channelId}`, {
      ...options,
      body,
    })
  }

  /**
   * Ends a stage.
   *
   * @param channelId - The stage channel, not the instance.
   * @param options - Request options.
   */
  async delete(channelId: Snowflake, options: RouteOptions = {}): Promise<void> {
    await this.#rest.delete<undefined>(`/stage-instances/${channelId}`, options)
  }
}
