/**
 * Discord gateway client: sharding, resuming and transport compression.
 *
 * @packageDocumentation
 */

export * from './compression/index.js'
export {
  buildGatewayUrl,
  DefaultBackpressureOptions,
  resolveShardOptions,
  type BackpressureOptions,
  type ResolvedShardOptions,
  type ShardOptions,
} from './GatewayOptions.js'
export { Shard } from './Shard.js'
export type { ShardEvents } from './ShardEvents.js'
export { ShardSession } from './ShardSession.js'
export { ClosingIntent, ConnectIntent, FatalGatewayError, ShardState } from './ShardState.js'
export { sendIdentify, sendResume } from './ShardHandshake.js'
export { ShardConnection, type ConnectionHooks } from './connection/ShardConnection.js'
export {
  InMemorySessionStore,
  type SessionState,
  type SessionStore,
} from './session/SessionStore.js'
export { LocalIdentifyThrottler, type IdentifyThrottler } from './session/IdentifyThrottler.js'
export { JsonEncoding } from './encoding/JsonEncoding.js'
export type { Encoding } from './encoding/Encoding.js'
export { Backoff, DefaultBackoffOptions, type BackoffOptions } from './connection/Backoff.js'
export {
  DefaultHeartbeaterOptions,
  Heartbeater,
  SystemTimers,
  type HeartbeaterHooks,
  type HeartbeaterOptions,
  type Timers,
} from './connection/Heartbeater.js'
export {
  DefaultSendQueueOptions,
  MAX_PAYLOAD_BYTES,
  PayloadTooLargeError,
  SendQueue,
  SendTimeoutError,
  type SendQueueOptions,
} from './connection/SendQueue.js'
export {
  assertSendableCloseCode,
  classifyCloseCode,
  resolveCloseVerdict,
  CLOSE_PERMANENT,
  CLOSE_RESUMABLE,
  ShardCloseAction,
  type CloseCodeVerdict,
} from './connection/CloseCodes.js'
export type {
  Transport,
  TransportFactory,
  TransportInit,
  TransportListeners,
} from './transport/Transport.js'
export { WebSocketTransport } from './transport/WebSocketTransport.js'
