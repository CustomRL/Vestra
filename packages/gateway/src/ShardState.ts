/**
 * Where a shard is in its connection lifecycle.
 */
export const ShardState = {
  /** Constructed; `connect()` has not been called. */
  Idle: 'idle',
  /** A socket has been opened and is awaiting the `open` event. */
  Connecting: 'connecting',
  /** The socket is open but Hello has not arrived. Nothing has been sent. */
  Handshaking: 'handshaking',
  /** Hello received, heartbeating started, Identify sent, awaiting READY. */
  Identifying: 'identifying',
  /** Hello received, heartbeating started, Resume sent. */
  Resuming: 'resuming',
  /** Replayed dispatches are arriving; awaiting RESUMED. */
  Replaying: 'replaying',
  /** READY or RESUMED received; carrying live traffic. */
  Ready: 'ready',
  /** The connection is gone and a backoff timer is pending. */
  Reconnecting: 'reconnecting',
  /** A deliberate shutdown is in flight. */
  Closing: 'closing',
  /** Stopped by the user. `connect()` may be called again. */
  Closed: 'closed',
  /** Terminal. Reconnecting cannot succeed, so `connect()` throws. */
  Fatal: 'fatal',
} as const

/**
 * A shard state.
 */
export type ShardState = (typeof ShardState)[keyof typeof ShardState]

/**
 * What a shard will attempt on its next connection.
 */
export const ConnectIntent = {
  /** Start a new session. */
  Identify: 'identify',
  /** Replay missed events on the existing session. */
  Resume: 'resume',
} as const

/**
 * A connection intent.
 */
export type ConnectIntent = (typeof ConnectIntent)[keyof typeof ConnectIntent]

/**
 * Why a shard is closing its own socket.
 *
 * @remarks
 * Recorded *before* the close is issued, because a shard cannot read back its own close
 * code — the close event reports what the peer sent, or 1006 when the socket simply died.
 * Without this, a deliberate zombie termination is indistinguishable from a network drop,
 * and a deliberate shutdown looks like a reconnectable failure.
 */
export const ClosingIntent = {
  /** The connection stopped acknowledging heartbeats. */
  Zombie: 'zombie',
  /** The user asked the shard to stop. */
  User: 'user',
  /** A reconnect that should keep the session. */
  Resume: 'resume',
  /** Undelivered traffic exceeded the ceiling. */
  Backpressure: 'backpressure',
} as const

/**
 * A closing intent.
 */
export type ClosingIntent = (typeof ClosingIntent)[keyof typeof ClosingIntent]
