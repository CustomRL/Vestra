import type { Snowflake } from '../globals.js'
import type { APIUser } from '../payloads/user.js'

/**
 * Poll query and result shapes.
 *
 * @remarks
 * A poll is not a resource of its own — it is a field on a message, created by sending one and
 * read back from it. Only two things need routes: finding out **who** voted for an answer, and
 * ending a poll early. Everything else about a poll arrives with the message.
 *
 * **Vote counts on a live poll are approximate.** Discord says so, and it matters: the counts
 * on the message are an estimate until the poll finishes, so a bot reporting a running total
 * from `APIPollResults` is reporting an estimate. The voter listing here is exact and is the
 * way to count for real, at the cost of a request per answer.
 */

/**
 * `GET /channels/{channel.id}/polls/{message.id}/answers/{answer.id}`
 *
 * @remarks
 * Paginated by user ID, ascending, and capped at 100. There is no `before` — the listing only
 * walks forwards.
 */
export interface RESTGetAPIPollAnswerVotersQuery {
  /** Voters after this user ID. */
  after?: Snowflake
  /** How many, from 1 to 100. Defaults to 25. */
  limit?: number
}

/**
 * The result of `GET /channels/{channel.id}/polls/{message.id}/answers/{answer.id}`.
 *
 * @remarks
 * Wrapped in an object, like the application emoji listing.
 */
export interface RESTGetAPIPollAnswerVotersResult {
  /** The users who chose that answer. */
  users: APIUser[]
}
