/**
 * Gateway bootstrap endpoints.
 *
 * @remarks
 * `GET /gateway/bot` is the first call any gateway client makes, and its
 * `session_start_limit` is the reason: identifying past the daily cap gets a token
 * temporarily banned, and `max_concurrency` dictates how many shards may identify in
 * parallel. A client that ignores these will work in development and fail at scale.
 */

/**
 * The result of `GET /gateway`.
 */
export interface RESTGetAPIGatewayResult {
  /** The websocket URL to connect to. */
  url: string
}

/**
 * The result of `GET /gateway/bot`.
 */
export interface RESTGetAPIGatewayBotResult {
  /** The websocket URL to connect to. */
  url: string
  /** The recommended number of shards for this bot's guild count. */
  shards: number
  /** The bot's current session start limits. */
  session_start_limit: APISessionStartLimit
}

/**
 * How many gateway sessions a bot may start.
 */
export interface APISessionStartLimit {
  /** The total number of session starts allowed in the window. */
  total: number
  /**
   * Session starts remaining.
   *
   * @remarks
   * Reaching zero means no shard can identify until `reset_after` elapses. A client
   * should refuse to start rather than burn the remainder retrying.
   */
  remaining: number
  /** Milliseconds until the limit resets. */
  reset_after: number
  /**
   * How many shards may identify concurrently.
   *
   * @remarks
   * Shards are bucketed by `shard_id % max_concurrency`, and one bucket may identify per
   * five-second window. For most bots this is 1, so shards must identify one at a time.
   */
  max_concurrency: number
}
