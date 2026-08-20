import type { APISessionStartLimit } from '@vestra/types'
import { GatewayError } from './GatewayError.js'

/**
 * Thrown when starting would exceed the daily session start allowance.
 *
 * @remarks
 * Deliberately fatal, never retried. Overrunning the limit does not throttle the bot: it
 * terminates every active session, resets the token, and emails the owner. A retry loop
 * past the cap converts a configuration mistake into an outage that needs a human to fix.
 */
export class SessionLimitError extends GatewayError {
  /** Session starts left today. */
  readonly remaining: number
  /** The daily allowance. */
  readonly total: number
  /** Milliseconds until the allowance resets. */
  readonly resetAfter: number

  /**
   * @param limit - The session start limit from `GET /gateway/bot`.
   * @param required - How many session starts were needed.
   */
  constructor(limit: APISessionStartLimit, required: number) {
    super(
      `Starting ${String(required)} shards needs ${String(required)} session starts but only ` +
        `${String(limit.remaining)} of ${String(limit.total)} remain today. The allowance ` +
        `resets in ${String(Math.ceil(limit.reset_after / 1000))}s. Refusing to start: ` +
        'exceeding the limit terminates every session, resets the token, and emails the owner.',
    )
    this.name = 'SessionLimitError'
    this.remaining = limit.remaining
    this.total = limit.total
    this.resetAfter = limit.reset_after
  }
}
