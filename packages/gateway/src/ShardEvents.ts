import type { GatewayDispatchPayload, GatewayReadyDispatchData } from '@vestra/types'
import type { ShardState } from './ShardState.js'

/**
 * Events a shard emits.
 *
 * @remarks
 * Dispatch payloads are delivered in gateway sequence order, exactly once per connection.
 * The shard does **not** await listener return values: doing so would put every user
 * handler on the critical path between the socket and the heartbeat, turning one slow
 * handler into a zombie reconnect. Ordered *completion* is therefore not guaranteed, and a
 * consumer needing it should queue explicitly.
 */
export interface ShardEvents {
  /** The shard moved between states. */
  stateChange: [from: ShardState, to: ShardState]
  /** Hello arrived, carrying the heartbeat interval. */
  hello: [intervalMs: number]
  /** A new session was established. */
  ready: [data: GatewayReadyDispatchData]
  /** An existing session was resumed and replay finished. */
  resumed: []
  /** A dispatch arrived. `replayed` marks events replayed after a resume. */
  dispatch: [payload: GatewayDispatchPayload, replayed: boolean]
  /** The socket closed, with the action the shard decided to take. */
  closed: [code: number, reason: string, wasClean: boolean, action: string]
  /** The connection stopped acknowledging heartbeats and was abandoned. */
  zombie: []
  /** Undelivered traffic exceeded the ceiling and the connection was closed. */
  backpressure: [inflight: number, bytes: number]
  /**
   * A heartbeat fired late.
   *
   * @remarks
   * The only self-observable signal that the event loop is blocked — a blocked loop cannot
   * run the code that would otherwise notice in real time.
   */
  heartbeatDrift: [driftMs: number]
  /** Something went wrong. */
  error: [error: Error]
}
