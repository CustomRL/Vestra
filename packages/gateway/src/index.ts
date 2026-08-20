/**
 * Discord gateway client: sharding, resuming and transport compression.
 *
 * @packageDocumentation
 */

export * from './compression/index.js'
export { JsonEncoding } from './encoding/JsonEncoding.js'
export type { Encoding } from './encoding/Encoding.js'
export {
  assertSendableCloseCode,
  classifyCloseCode,
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
