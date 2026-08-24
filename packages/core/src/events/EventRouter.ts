import type { GatewayDispatchPayload } from '@vestra/types'
import { EventHandlerError } from '../errors/EventHandlerError.js'
import type { AnyEventHandler, DispatchShard, EventContext } from './EventHandler.js'

/**
 * Sends each dispatch to its handler, and contains what goes wrong.
 *
 * @remarks
 * The one place a dispatch becomes a cache write and a client event. Two properties make
 * it worth being a class rather than a function.
 *
 * **A throwing handler must not take the connection with it.** Handlers call consumer code
 * — a cache `filter`, an `emit` into listeners somebody else wrote — so a throw is not
 * hypothetical. One `try` around the whole dispatch is deliberate: a per-callback `try`
 * would contain a bug in one place and not two lines away, and the result is the same
 * anyway because the dispatch is abandoned either way.
 *
 * **An unhandled event is not an error.** Most of the seventy-six have no handler and are
 * not meant to. They reach consumers through `raw` and nothing else, so adding a handler
 * later is purely additive rather than a change to an existing event's arguments.
 */
export class EventRouter<Client = unknown> {
  readonly #handlers = new Map<string, AnyEventHandler<Client>>()
  readonly #context: EventContext<Client>

  /**
   * @param context - What handlers are allowed to touch.
   * @param handlers - The handlers to register.
   */
  constructor(context: EventContext<Client>, handlers: readonly AnyEventHandler<Client>[] = []) {
    this.#context = context
    for (const handler of handlers) this.register(handler)
  }

  /** How many events have a handler. */
  get size(): number {
    return this.#handlers.size
  }

  /**
   * Registers a handler.
   *
   * @param handler - The handler to add.
   * @throws When the event already has one.
   *
   * @remarks
   * Refuses to replace rather than overwriting silently. Two handlers for one event is
   * always a mistake — a duplicated registry line, or a copy-paste that kept the wrong
   * event name — and the version that wins would otherwise depend on registration order.
   */
  register(handler: AnyEventHandler<Client>): void {
    if (this.#handlers.has(handler.event)) {
      throw new Error(`A handler for ${handler.event} is already registered.`)
    }
    this.#handlers.set(handler.event, handler)
  }

  /** Whether an event has a handler. */
  handles(event: string): boolean {
    return this.#handlers.has(event)
  }

  /**
   * Routes one dispatch.
   *
   * @param payload - The dispatch, as it arrived.
   * @param shard - Which shard delivered it.
   * @param replayed - Whether this is a replay after a resume.
   *
   * @remarks
   * `raw` is emitted **inside** the same `try` as the handler. It runs consumer listeners
   * like everything else here, and a throwing `raw` listener escaping while a throwing
   * `messageCreate` listener is contained would be an inconsistency with no defence.
   *
   * `raw` fires before the handler, so a consumer watching it sees the payload as it
   * arrived rather than after the cache has been updated from it.
   */
  route(payload: GatewayDispatchPayload, shard: DispatchShard, replayed = false): void {
    try {
      this.#context.emit('raw', payload, shard.id, replayed)

      const handler = this.#handlers.get(payload.t)
      if (handler === undefined) return

      // The one cast in the routing path, and it is the boundary the type system cannot
      // cross: the map key and the handler's `event` agree by construction — `register`
      // files each handler under its own name — but a runtime `Map.get` cannot carry that
      // correlation into the type. Narrowing `payload` and the handler together would need
      // a switch over all seventy-six events to prove what one lookup already guarantees.
      const handle = handler.handle as (
        context: EventContext<Client>,
        data: unknown,
        shard: DispatchShard,
      ) => void
      handle(this.#context, payload.d, shard)
    } catch (error) {
      this.report(new EventHandlerError(payload.t, error), payload.t, shard.id)
    }
  }

  /**
   * Reports a handler failure without letting it reach the socket.
   *
   * @param error - What went wrong.
   * @param event - The dispatch being handled.
   * @param shardId - Which shard delivered it.
   *
   * @remarks
   * **The listener count is checked first, and that is the whole point.** Node's
   * `EventEmitter` throws an unhandled `'error'` *synchronously, into whoever called `emit`* —
   * measured, not assumed. Here that caller is the router, called by the shard bridge, called
   * from the shard's dispatch emit, called from the socket read. So on a client with no error
   * listener, one throw in one handler unwound all the way into the read path and could take
   * the connection with it: a consumer-side bug becoming a disconnect.
   *
   * Rethrowing on a clean tick keeps the failure loud — it surfaces as an `uncaughtException`
   * with a stack, which is what Node does with an unhandled `'error'` anyway — while leaving
   * the socket alone. Loud is correct here; silent is not, and neither is taking the
   * connection down.
   *
   * A listener that throws is given the same treatment, for the same reason.
   *
   * Public because serial mode needs it. A listener's rejected promise is only observable
   * once something awaits it, which nothing did before the dispatch queue existed — and the
   * act of awaiting marks it handled, so a rejection that used to surface as an
   * `unhandledRejection` would otherwise go silent the moment serial mode was switched on.
   * Reporting it here keeps one policy for every failure a consumer's code produces.
   */
  report(error: EventHandlerError, event: string, shardId: number): void {
    if (this.#context.listenerCount('error') === 0) {
      setImmediate(() => {
        throw error
      })
      return
    }

    try {
      this.#context.emit('error', error, { event, shardId })
    } catch (secondary) {
      setImmediate(() => {
        throw secondary
      })
    }
  }
}
