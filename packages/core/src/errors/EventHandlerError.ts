import { CoreError } from './CoreError.js'

/**
 * Thrown when handling a dispatch fails.
 *
 * @remarks
 * Wraps the original failure rather than replacing it: `cause` is whatever was thrown, and
 * `event` names the gateway dispatch being handled when it happened. Without the event name a
 * stack trace from inside a handler says almost nothing, because every handler is reached
 * through the same two lines of the router.
 *
 * **A known cost, stated rather than hidden.** The router emits client events from inside the
 * same `try` as the handler, so a throw from a *consumer's* listener is also reported as an
 * `EventHandlerError` naming the gateway event — which reads as though Vestra's handler failed
 * when it was the listener. Telling them apart means splitting the emit out of the handler,
 * which costs the uniform handler shape every handler is written to. `docs/design/phase-4-core.md`
 * §8-A4 records the trade.
 */
export class EventHandlerError extends CoreError {
  /** The gateway dispatch being handled, such as `MESSAGE_CREATE`. */
  readonly event: string

  /**
   * @param event - The gateway dispatch being handled.
   * @param cause - What was thrown.
   */
  constructor(event: string, cause: unknown) {
    super(`Handling ${event} failed: ${describe(cause)}`, { cause })
    this.name = 'EventHandlerError'
    this.event = event
  }
}

/** A short description of whatever was thrown, which need not be an `Error`. */
function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}
