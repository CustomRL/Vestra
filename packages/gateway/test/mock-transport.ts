import type { Transport, TransportInit, TransportListeners } from '@vestra/gateway'
import type { GatewaySendPayload } from '@vestra/types'

/**
 * A transport that speaks to a script instead of a network.
 *
 * @remarks
 * The whole point of the `Transport` interface. Reconnect logic is the part of a gateway
 * client most likely to be wrong and least likely to be exercised, because reproducing a
 * zombie connection or a 4014 against a real gateway is impractical. Here every failure is
 * one method call.
 *
 * Instances are shared across reconnects through {@link MockTransportFleet}, so a test can
 * assert on the *sequence* of connection attempts — which URL each used, and what was sent.
 */
export class MockTransport implements Transport {
  /** URLs passed to `connect`, in order. */
  readonly connects: string[] = []
  /** Payloads passed to `send`, in order, as raw strings. */
  readonly sends: string[] = []
  /** Close codes and reasons passed to `close`. */
  readonly closes: { code: number; reason: string | undefined }[] = []
  /** How many times `destroy` abandoned a live socket. */
  destroys = 0

  /** Bytes notionally queued. Settable so back-pressure can be simulated. */
  bufferedAmount = 0

  /**
   * When true, `close()` records the call but never delivers a close event.
   *
   * @remarks
   * This is what a zombie peer actually does: the closing handshake needs a reply that
   * never comes. A shard that waits for the close event before reconnecting hangs here,
   * which is precisely the regression worth catching.
   */
  swallowClose = false

  #listeners: TransportListeners
  #open = false

  /**
   * @param listeners - Callbacks for the socket's lifecycle.
   */
  constructor(listeners: TransportListeners) {
    this.#listeners = listeners
  }

  /** Whether the socket is currently open. */
  get isOpen(): boolean {
    return this.#open
  }

  /** Payloads sent, parsed. */
  get sentPayloads(): GatewaySendPayload[] {
    return this.sends.map((raw) => JSON.parse(raw) as GatewaySendPayload)
  }

  /**
   * Records a connection attempt. Does not open until {@link open} is called.
   *
   * @param url - The URL connected to.
   */
  connect(url: string): void {
    this.connects.push(url)
  }

  /**
   * Records a send.
   *
   * @param data - The payload.
   */
  send(data: Uint8Array | string): void {
    this.sends.push(typeof data === 'string' ? data : Buffer.from(data).toString('utf8'))
  }

  /**
   * Records a close, and delivers the event unless closes are being swallowed.
   *
   * @param code - The close code.
   * @param reason - The reason.
   */
  close(code: number, reason?: string): void {
    this.closes.push({ code, reason })
    if (this.swallowClose) return
    this.#deliverClose(code, reason ?? '', true)
  }

  /**
   * Abandons the socket.
   */
  destroy(): void {
    if (!this.#open && this.destroys > 0) return
    this.destroys += 1
    this.#open = false
    this.#listeners.onClose(4000, 'transport destroyed', false)
  }

  /** Simulates the socket opening. */
  open(): void {
    this.#open = true
    this.#listeners.onOpen()
  }

  /**
   * Delivers a message from the "server".
   *
   * @param payload - The payload to deliver, serialised as JSON.
   */
  receive(payload: unknown): void {
    this.#listeners.onMessage(JSON.stringify(payload))
  }

  /**
   * Delivers a close from the "server".
   *
   * @param code - The close code.
   * @param reason - The reason.
   * @param wasClean - Whether a closing handshake completed.
   */
  serverClose(code: number, reason = '', wasClean = true): void {
    this.#deliverClose(code, reason, wasClean)
  }

  /** Delivers a transport error. */
  serverError(error: Error): void {
    this.#listeners.onError(error)
  }

  #deliverClose(code: number, reason: string, wasClean: boolean): void {
    if (!this.#open) return
    this.#open = false
    this.#listeners.onClose(code, reason, wasClean)
  }
}

/**
 * Hands out mock transports and remembers every one, so a test can inspect the whole
 * reconnect sequence rather than only the current attempt.
 */
export class MockTransportFleet {
  /** Every transport created, in order. */
  readonly created: MockTransport[] = []

  /** The most recently created transport. */
  get current(): MockTransport {
    const last = this.created.at(-1)
    if (last === undefined) throw new Error('No transport has been created yet.')
    return last
  }

  /**
   * A factory suitable for `ShardOptions.transport`.
   */
  get factory(): (listeners: TransportListeners, options: TransportInit) => Transport {
    return (listeners) => {
      const transport = new MockTransport(listeners)
      this.created.push(transport)
      return transport
    }
  }
}
