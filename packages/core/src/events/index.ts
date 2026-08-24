/**
 * Turning gateway dispatches into cache writes and client events.
 *
 * @remarks
 * See `docs/design/phase-4-core.md` §4.4 to §4.8.
 */

export {
  defineHandler,
  type DispatchShard,
  type EventContext,
  type EventHandler,
} from './EventHandler.js'
export {
  DEFAULT_MAX_QUEUED,
  DispatchQueue,
  collectListenerResult,
  type DispatchQueueOptions,
} from './DispatchQueue.js'
export { EventRouter } from './EventRouter.js'
export { handlers } from './registry.js'
export { UnhandledEvents } from './unhandled.js'
export type { ClientEventName, ClientEvents } from './ClientEvents.js'
