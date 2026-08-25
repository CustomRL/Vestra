import type {
  APIMessage,
  APIUser,
  RESTGetAPIPollAnswerVotersQuery,
  RESTGetAPIPollAnswerVotersResult,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * Poll endpoints.
 *
 * @remarks
 * A poll is a field on a message rather than a resource of its own: it is created by sending a
 * message with a `poll` and read back from that message. Only two things need routes — who
 * voted for an answer, and ending one early.
 *
 * **The counts on a running poll are approximate, and Discord says so.** A bot reporting a
 * live total from the message is reporting an estimate; {@link PollRoutes.getAnswerVoters} is
 * the exact count, at the cost of a request per answer. The counts become exact once the poll
 * finishes.
 *
 * **Ending a poll is not deleting it.** The message stays, the results freeze, and Discord
 * sends a `MESSAGE_UPDATE` with the finalised counts.
 */
export class PollRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Lists who voted for one answer.
   *
   * @param channelId - The channel the poll is in.
   * @param messageId - The message carrying the poll.
   * @param answerId - Which answer, as its `answer_id` on the poll.
   * @param query - Pagination.
   * @param options - Request options.
   * @returns The voters, unwrapped from the object the route returns.
   *
   * @remarks
   * Paginated forwards only — there is no `before`. The answer is addressed by the
   * `answer_id` Discord assigns, not by its index in the array, and the two agree only
   * because Discord happens to number from one.
   */
  async getAnswerVoters(
    channelId: Snowflake,
    messageId: Snowflake,
    answerId: number,
    query: RESTGetAPIPollAnswerVotersQuery = {},
    options: RouteOptions = {},
  ): Promise<APIUser[]> {
    const result = await this.#rest.get<RESTGetAPIPollAnswerVotersResult>(
      `/channels/${channelId}/polls/${messageId}/answers/${String(answerId)}`,
      { ...options, query: query as Record<string, string | number | boolean | undefined> },
    )
    return result.users
  }

  /**
   * Ends a poll early.
   *
   * @param channelId - The channel the poll is in.
   * @param messageId - The message carrying the poll.
   * @param options - Request options.
   * @returns The message, with its results finalised.
   *
   * @remarks
   * Only the poll's author may do this, and only while it is running — ending a finished poll
   * is a 400 rather than a no-op. The message survives; what changes is that the counts stop
   * being approximate.
   */
  async end(
    channelId: Snowflake,
    messageId: Snowflake,
    options: RouteOptions = {},
  ): Promise<APIMessage> {
    return await this.#rest.post<APIMessage>(
      `/channels/${channelId}/polls/${messageId}/expire`,
      options,
    )
  }
}
