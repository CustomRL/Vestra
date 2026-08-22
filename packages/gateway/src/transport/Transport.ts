/**
 * Callbacks a transport invokes as its socket progresses.
 *
 * @remarks
 * Deliberately callbacks rather than an event emitter. A transport is per-connection and
 * short-lived; an emitter would add a listener-lifecycle problem to a class whose entire
 * job is to be abandoned cleanly.
 */
export interface TransportListeners {
  /** The socket opened. */
  onOpen: () => void
  /**
   * A message arrived.
   *
   * @param data - Text, or binary as an `ArrayBuffer`.
   */
  onMessage: (data: ArrayBuffer | string) => void
  /**
   * The socket closed.
   *
   * @param code - The close code.
   * @param reason - The close reason, possibly empty.
   * @param wasClean - Whether a closing handshake completed.
   */
  onClose: (code: number, reason: string, wasClean: boolean) => void
  /** The socket errored. */
  onError: (error: Error) => void
}

/**
 * Options a transport needs that are not connection-specific.
 */
export interface TransportInit {
  /** The `User-Agent` to present. */
  userAgent: string
  /**
   * An undici `Dispatcher` for proxying.
   *
   * @remarks
   * Typed loosely so that `@vestra/gateway` does not depend on undici's types, which
   * would breach the zero-dependency rule for the sake of one field.
   */
  dispatcher?: unknown
}

/**
 * A websocket connection, abstracted so the shard state machine can be tested with no
 * network at all.
 *
 * @remarks
 * `connect` is separate from construction on purpose: a scripted test transport then
 * survives a whole reconnect sequence and can record the URL of each attempt in order,
 * which is what makes resume-versus-re-identify assertions possible.
 */
export interface Transport {
  /**
   * Opens the socket.
   *
   * @param url - The fully qualified gateway URL.
   */
  connect: (url: string) => void
  /**
   * Sends a message.
   *
   * @param data - The payload to send.
   */
  send: (data: Uint8Array | string) => void
  /**
   * Begins a closing handshake.
   *
   * @param code - The close code. Must be 1000 or in 3000-4999.
   * @param reason - An optional reason.
   */
  close: (code: number, reason?: string) => void
  /**
   * Abandons the socket without waiting for a closing handshake.
   *
   * @remarks
   * Part of the interface rather than assumed, because the default implementation cannot
   * provide it the way a `ws` adapter would — Node's global `WebSocket` exposes no
   * `terminate`. See {@link WebSocketTransport.destroy} for what the default does instead.
   */
  destroy: () => void
  /** Bytes queued but not yet written to the network. */
  readonly bufferedAmount: number
}

/**
 * Creates a transport.
 *
 * @param listeners - Callbacks for the socket's lifecycle.
 * @param options - Non-connection-specific options.
 * @returns A transport that has not yet connected.
 */
export type TransportFactory = (listeners: TransportListeners, options: TransportInit) => Transport
