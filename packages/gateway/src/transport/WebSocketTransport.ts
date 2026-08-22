import { assertSendableCloseCode, CLOSE_RESUMABLE } from '../connection/CloseCodes.js'
import type { Transport, TransportInit, TransportListeners } from './Transport.js'

/**
 * How many abandoned sockets are tolerated before something is clearly wrong.
 */
const ABANDONED_SOCKET_CAP = 4

/**
 * A transport over Node's global `WebSocket`.
 *
 * @remarks
 * The zero-dependency default. Two consequences of that choice are worth knowing, and
 * both were verified rather than assumed:
 *
 * - **No receive back-pressure exists.** `pause`, `resume`, `_socket` and `terminate` are
 *   all absent from the global implementation, so a slow consumer cannot slow the socket.
 *   Back-pressure is imposed a level up, and the only lever is closing the connection.
 * - **The `error` event carries no diagnostic information** — an empty message, a bare
 *   `TypeError`, no `cause`, no `code`. This class therefore reports the URL and attempt
 *   itself, because the event will not. That is the diagnosability cost of
 *   {@link https://github.com/CustomRL/Vestra/blob/main/docs/adr/0001-zero-runtime-dependencies.md | ADR 1};
 *   a `ws`-backed transport is a small adapter for anyone who needs more.
 *
 * Note also that undici always offers `Sec-WebSocket-Extensions: permessage-deflate` with
 * no way to opt out. Discord does not negotiate it, so it is currently inert.
 */
export class WebSocketTransport implements Transport {
  readonly #listeners: TransportListeners
  readonly #options: TransportInit

  #socket: WebSocket | null = null
  /** Detaches every listener on the current socket atomically. */
  #detach: AbortController | null = null
  #url: string | null = null
  #attempts = 0
  #abandoned = 0

  /**
   * @param listeners - Callbacks for the socket's lifecycle.
   * @param options - Non-connection-specific options.
   */
  constructor(listeners: TransportListeners, options: TransportInit) {
    this.#listeners = listeners
    this.#options = options
  }

  /** Bytes queued but not yet written to the network. */
  get bufferedAmount(): number {
    return this.#socket?.bufferedAmount ?? 0
  }

  /**
   * Opens the socket.
   *
   * @param url - The fully qualified gateway URL.
   */
  connect(url: string): void {
    this.destroy()

    this.#url = url
    this.#attempts += 1
    const detach = new AbortController()
    this.#detach = detach

    // Non-standard init undici accepts: a real user agent, and a proxy escape hatch,
    // without taking a dependency for either.
    const init = {
      headers: { 'user-agent': this.#options.userAgent },
      ...(this.#options.dispatcher === undefined ? {} : { dispatcher: this.#options.dispatcher }),
    }

    let socket: WebSocket
    try {
      socket = new WebSocket(url, init as never)
    } catch (error) {
      this.#listeners.onError(this.#describe(error))
      return
    }

    // Must be set immediately, and it must be 'arraybuffer'. The default is 'blob', and
    // 'nodebuffer' is silently ignored — a Blob would force an await on the hot path and
    // make frame ordering depend on promise resolution order.
    socket.binaryType = 'arraybuffer'
    // Read back through a widened type on purpose. TypeScript narrows the property to the
    // literal just assigned, which makes this look dead — but the check is a runtime one:
    // 'nodebuffer' is accepted and then silently ignored, so an assignment succeeding is
    // not evidence it took effect.
    const negotiated: string = socket.binaryType
    if (negotiated !== 'arraybuffer') {
      this.#listeners.onError(
        new Error(
          `This runtime's WebSocket refused binaryType 'arraybuffer' (got '${negotiated}'). ` +
            'Gateway frames cannot be decoded safely; supply a custom transport.',
        ),
      )
      return
    }

    this.#socket = socket
    const { signal } = detach

    // Whether this socket ever finished its handshake. Read by the error listener below to
    // tell a stillborn connection from a live one that failed later.
    let opened = false

    socket.addEventListener(
      'open',
      () => {
        opened = true
        this.#listeners.onOpen()
      },
      { signal },
    )

    socket.addEventListener(
      'message',
      (event: MessageEvent) => {
        const { data } = event as { data: unknown }
        if (typeof data === 'string' || data instanceof ArrayBuffer) {
          this.#listeners.onMessage(data)
          return
        }
        this.#listeners.onError(
          new Error(`Received an unexpected message type from the gateway: ${typeof data}`),
        )
      },
      { signal },
    )

    // CloseEvent and ErrorEvent are deliberately not named: neither appears in Node 22's
    // documented globals, and the floor is 22.15.0, so a named reference risks a
    // ReferenceError on the minimum supported runtime. The shape is duck-typed instead.
    socket.addEventListener(
      'close',
      (event) => {
        const closed = event as unknown as { code?: number; reason?: string; wasClean?: boolean }
        this.#teardown()
        this.#listeners.onClose(closed.code ?? 1006, closed.reason ?? '', closed.wasClean ?? false)
      },
      { signal },
    )

    socket.addEventListener(
      'error',
      (event) => {
        this.#listeners.onError(this.#describe((event as unknown as { error?: unknown }).error))

        // **A rejected handshake produces no close event on Node 22.** Measured, on the floor
        // runtime: a server answering the upgrade with `401` fires `error` and nothing else,
        // leaving `readyState` at CONNECTING forever. Node 24 and 25 follow the same failure
        // with `close(1006, wasClean: false)`. Every reconnect decision this library makes is
        // driven by a close, so on Node 22 a bad token — the most ordinary failure there is —
        // left the shard waiting on an event that was never coming, with no reconnect and no
        // report beyond the error.
        //
        // Synthesising the close is safe precisely because the socket never opened: there was
        // no websocket layer to carry a close frame, so the only close such a socket can ever
        // have is 1006 and unclean, which is what a conforming runtime reports. It is done
        // synchronously rather than on a later tick because the value cannot differ, so there
        // is nothing to wait to find out; on Node 24 and 25 the teardown detaches the real
        // close before it is delivered, and the outcome is byte-for-byte the same.
        //
        // The `opened` guard is what keeps this narrow, and it is load-bearing. An error on a
        // socket that *did* open may be followed by an authoritative Discord code — 4004 for a
        // bad token, 4014 for disallowed intents, both of which must never be retried. Reporting
        // 1006 in their place would turn a fatal, do-not-reconnect close into a resumable one
        // and produce an endless reconnect loop against a gateway that will never accept.
        if (opened || this.#socket !== socket) return
        this.#teardown()
        this.#listeners.onClose(1006, '', false)
      },
      { signal },
    )
  }

  /**
   * Sends a message.
   *
   * @param data - The payload to send.
   */
  send(data: Uint8Array | string): void {
    const socket = this.#socket
    if (socket?.readyState !== WebSocket.OPEN) {
      this.#listeners.onError(new Error('Attempted to send on a socket that is not open.'))
      return
    }
    socket.send(data)
  }

  /**
   * Begins a closing handshake.
   *
   * @param code - The close code. Must be 1000 or in 3000-4999.
   * @param reason - An optional reason.
   *
   * @throws RangeError - If `code` is one a client may not send.
   *
   * @remarks
   * **The code is validated outside the `try`, and before the socket is looked at.** Inside
   * it, a caller passing an unsendable code — a programmer error, and one that would make the
   * close silently not happen — arrived as an asynchronous error event instead of throwing,
   * which is the opposite of useful. The `try` is there to contain a throw from the socket
   * itself, such as closing one that has already gone, and it still does exactly that.
   *
   * Validating before the null check is deliberate too: an invalid code is invalid whether or
   * not a socket happens to be attached, and deciding by connection state would make the same
   * bug throw or not depending on timing.
   */
  close(code: number, reason?: string): void {
    const sendable = assertSendableCloseCode(code)

    const socket = this.#socket
    if (socket === null) return
    try {
      socket.close(sendable, reason)
    } catch (error) {
      this.#listeners.onError(this.#describe(error))
    }
  }

  /**
   * Abandons the socket without waiting for a closing handshake.
   *
   * @remarks
   * The global `WebSocket` has no `terminate`, so this cannot sever the connection the
   * way a `ws` adapter would. What it must do instead is guarantee the abandoned socket
   * can never speak again: without detaching the listeners, a late `close` or `message`
   * re-enters a state machine that has already opened a replacement connection, producing
   * double reconnects that are very hard to diagnose.
   */
  destroy(): void {
    const socket = this.#socket
    if (socket === null) return

    this.#abandoned += 1
    this.#teardown()

    try {
      socket.close(CLOSE_RESUMABLE)
    } catch {
      // Already closing or closed; nothing to do.
    }

    // Advance the state machine now rather than waiting for a close event that has been
    // detached and will never be delivered.
    this.#listeners.onClose(CLOSE_RESUMABLE, 'transport destroyed', false)

    if (this.#abandoned > ABANDONED_SOCKET_CAP) {
      this.#listeners.onError(
        new Error(
          `Abandoned ${String(this.#abandoned)} sockets for ${this.#url ?? 'the gateway'}. ` +
            'Sockets are being destroyed faster than they connect, which usually means a ' +
            'reconnect loop.',
        ),
      )
    }
  }

  /**
   * Detaches every listener and drops the socket reference.
   */
  #teardown(): void {
    this.#detach?.abort()
    this.#detach = null
    this.#socket = null
  }

  /**
   * Turns an opaque socket failure into something with context in it.
   */
  #describe(error: unknown): Error {
    const detail = error instanceof Error && error.message !== '' ? `: ${error.message}` : ''
    const wrapped = new Error(
      `Gateway socket failed on attempt ${String(this.#attempts)} to ` +
        `${this.#url ?? 'an unknown URL'}${detail}`,
      error instanceof Error ? { cause: error } : undefined,
    )
    return wrapped
  }
}
