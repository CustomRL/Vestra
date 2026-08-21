import type { REST } from '@vestra/rest'
import type { ShardState } from '@vestra/gateway'
import type { GatewayDispatchData, GatewayDispatchEvents } from '@vestra/types'
import type { CacheRegistry } from '../cache/CacheRegistry.js'
import type { ClientUser } from '../structures/ClientUser.js'
import type { ClientEvents } from './ClientEvents.js'

/**
 * The surface a dispatch handler is allowed to touch.
 *
 * @remarks
 * Narrower than the client on purpose. A handler that reaches for the shard manager, the
 * socket, or `destroy()` is a design error, and this makes it a compile error rather than
 * something to catch in review. The client satisfies it structurally, so passing one costs
 * nothing — there is no wrapper object per dispatch.
 */
export interface EventContext<Client = unknown> {
  /** Where structures go. */
  readonly cache: CacheRegistry<Client>
  /** For handlers that must fetch something the cache cannot supply. */
  readonly rest: REST
  /**
   * The current user, `undefined` until the first READY.
   *
   * @remarks
   * Writable, because READY and `USER_UPDATE` are the handlers that set it. That makes this
   * the one member a handler may assign, and it is deliberately the only one.
   */
  user: ClientUser<Client> | undefined
  /** Emits a client event. */
  emit: <Event extends keyof ClientEvents<Client>>(
    event: Event,
    ...args: ClientEvents<Client>[Event] extends unknown[] ? ClientEvents<Client>[Event] : never
  ) => boolean
  /** How many listeners an event has, for handlers that can skip work when nobody is looking. */
  listenerCount: (event: keyof ClientEvents<Client>) => number
}

/**
 * The shard a dispatch arrived on, as much of it as a handler may see.
 *
 * @remarks
 * Not the `Shard` itself. A handler with a shard could close it, send on it, or read its
 * session — none of which is a handler's business, and all of which would make handlers
 * untestable without a socket.
 */
export interface DispatchShard {
  /** Which shard delivered it. */
  readonly id: number
  /** What the shard is currently doing. */
  readonly state: ShardState
  /** Whether the initial guild stream for this connection is still draining. */
  readonly guildsPending: boolean
}

/**
 * One gateway event, handled.
 *
 * @typeParam Event - The dispatch event name, which fixes the type of `data`.
 * @typeParam Client - The client type, threaded through to the structures.
 */
export interface EventHandler<Event extends GatewayDispatchEvents, Client = unknown> {
  /**
   * The event name.
   *
   * @remarks
   * Redundant with the registry key it is filed under, and kept anyway. Without it a
   * handler written as `satisfies EventHandler<'CHANNEL_DELETE'>` registers cleanly under
   * `CHANNEL_CREATE`, because both carry `APIChannel` and the check is purely structural.
   * The name makes the two disagree.
   */
  readonly event: Event
  /**
   * Applies the dispatch.
   *
   * @param context - What the handler may touch.
   * @param data - The event's payload, narrowed to this event.
   * @param shard - Which shard it arrived on.
   *
   * @remarks
   * Synchronous, and returns nothing. A handler that awaited would make dispatch handling
   * asynchronous, which the gateway explicitly does not do — it never awaits listener
   * return values — and two dispatches for the same entity could then interleave their
   * read-modify-write cycles.
   *
   * Handlers are **not** told whether the dispatch is a replay. They are pure functions of
   * (cache, data), which is what makes them idempotent by construction rather than by each
   * one remembering to check a flag. Anything that genuinely needs to know reads
   * `client.on('raw')`.
   */
  handle: (
    context: EventContext<Client>,
    data: GatewayDispatchData<Event>,
    shard: DispatchShard,
  ) => void
}

/**
 * A handler for some one event.
 *
 * @remarks
 * A union of the per-event handler types, not `EventHandler<GatewayDispatchEvents>`. The
 * two are not the same and the difference is not cosmetic: `handle` takes its data as a
 * parameter, parameters are contravariant, so a handler for `MESSAGE_CREATE` is **not**
 * assignable to one declared over the union — it would have to accept every event's data.
 * The union of handlers accepts each specific handler, which is what a registry holds.
 */
export type AnyEventHandler<Client = unknown> = {
  [Event in GatewayDispatchEvents]: EventHandler<Event, Client>
}[GatewayDispatchEvents]

/**
 * Builds a handler with its event name bound.
 *
 * @param event - The dispatch event.
 * @param handle - What to do with it.
 * @returns The handler.
 *
 * @remarks
 * A function rather than an object literal so `data` is inferred from `event` at the call
 * site. Written as a literal, every handler would need its type argument spelled out and
 * would silently accept the wrong one.
 */
export function defineHandler<Event extends GatewayDispatchEvents, Client = unknown>(
  event: Event,
  handle: EventHandler<Event, Client>['handle'],
): EventHandler<Event, Client> {
  return { event, handle }
}
