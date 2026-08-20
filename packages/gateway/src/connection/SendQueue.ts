import { setTimeout as sleep } from 'node:timers/promises'

/**
 * The hard ceiling on a single gateway payload.
 *
 * @remarks
 * Exceeding it closes the connection with 4002.
 */
export const MAX_PAYLOAD_BYTES = 4096

/**
 * Thrown when a payload is too large for the gateway to accept.
 */
export class PayloadTooLargeError extends Error {
  /** The opcode of the rejected payload. */
  readonly opcode: number
  /** How large the payload was, in bytes. */
  readonly size: number

  /**
   * @param opcode - The opcode of the rejected payload.
   * @param size - The serialised size in bytes.
   */
  constructor(opcode: number, size: number) {
    super(
      `Gateway payload for opcode ${String(opcode)} is ${String(size)} bytes, past the ` +
        `${String(MAX_PAYLOAD_BYTES)} byte limit. Sending it would close the connection ` +
        'with code 4002. Split the request — a large `user_ids` array is the usual cause.',
    )
    this.name = 'PayloadTooLargeError'
    this.opcode = opcode
    this.size = size
  }
}

/**
 * Thrown when a send waits longer than the configured ceiling.
 */
export class SendTimeoutError extends Error {
  /**
   * @param waitMs - How long the send would have had to wait.
   */
  constructor(waitMs: number) {
    super(`Sending would have waited ${String(waitMs)}ms for the gateway command allowance.`)
    this.name = 'SendTimeoutError'
  }
}

/**
 * Settings for gateway command pacing.
 */
export interface SendQueueOptions {
  /** Commands permitted per window. */
  limit: number
  /** The window length in milliseconds. */
  windowMs: number
  /**
   * How many of the allowance to hold back for heartbeats.
   *
   * @remarks
   * Vestra policy; Discord documents no such reservation.
   */
  heartbeatReserve: number
  /** The longest a send may wait, or `null` to wait indefinitely. */
  sendTimeout: number | null
}

/**
 * The default pacing.
 */
export const DefaultSendQueueOptions: SendQueueOptions = {
  limit: 120,
  windowMs: 60_000,
  heartbeatReserve: 4,
  sendTimeout: null,
}

/**
 * Paces commands sent on one connection.
 *
 * @remarks
 * Discord permits 120 gateway commands per connection per 60 seconds and disconnects
 * immediately on breach, revoking API access for repeat offenders. The window here is
 * **sliding**, kept as a ring of send timestamps — the same shape the REST client uses.
 * A tumbling window would allow 240 commands across a real minute at a boundary, which is
 * exactly the shape of a bot that wakes up and flushes queued work.
 *
 * Heartbeats bypass the queue and may draw on a small reserved portion of the allowance.
 * Without that reserve, a burst of presence updates delays a heartbeat past its interval,
 * no acknowledgement arrives, the shard correctly diagnoses a zombie, reconnects, and
 * repeats — a confusing loop whose real cause is a rate limit, not a dead connection.
 *
 * One queue per connection. There is no `reset`: a new connection gets a new queue.
 */
export class SendQueue {
  readonly #options: SendQueueOptions
  readonly #sent: Float64Array
  #next = 0
  #count = 0
  /** Serialises waiters so they are admitted in arrival order. */
  #tail: Promise<void> = Promise.resolve()

  /**
   * @param options - Pacing settings.
   */
  constructor(options: SendQueueOptions = DefaultSendQueueOptions) {
    this.#options = options
    this.#sent = new Float64Array(options.limit)
  }

  /**
   * Rejects a payload that the gateway would refuse.
   *
   * @param serialised - The payload as it will be sent.
   * @param opcode - The opcode, for the error message.
   * @throws {@link PayloadTooLargeError} if the payload exceeds the ceiling.
   *
   * @remarks
   * Checked before sending because the alternative symptom is a 4002 close arriving
   * hundreds of milliseconds later with nothing linking it to the call that caused it.
   */
  assertWithinSizeLimit(serialised: string | Uint8Array, opcode: number): void {
    const size =
      typeof serialised === 'string' ? Buffer.byteLength(serialised, 'utf8') : serialised.byteLength
    if (size > MAX_PAYLOAD_BYTES) throw new PayloadTooLargeError(opcode, size)
  }

  /**
   * How long a send must wait, in milliseconds.
   *
   * @param reserved - Whether the caller may use the heartbeat reserve.
   * @param now - The current time, injectable for testing.
   * @returns Milliseconds to wait; `0` if it may proceed.
   */
  delayFor(reserved: boolean, now = Date.now()): number {
    const usable = reserved
      ? this.#options.limit
      : this.#options.limit - this.#options.heartbeatReserve
    if (this.#count < usable) return 0

    // The oldest send still inside the window, counting back `usable` slots.
    const index = (this.#next - usable + this.#options.limit * 2) % this.#options.limit
    const oldest = this.#sent[index] ?? 0
    const freeAt = oldest + this.#options.windowMs
    return freeAt > now ? freeAt - now : 0
  }

  /**
   * Reserves an allowance slot for a heartbeat, without queueing.
   *
   * @returns `true` if the heartbeat may be sent now.
   *
   * @remarks
   * Never waits. A heartbeat that cannot be sent immediately is more useful as a signal
   * than as a delayed write, because the connection is about to be diagnosed as zombied
   * anyway.
   */
  tryTakeHeartbeatSlot(): boolean {
    if (this.delayFor(true) > 0) return false
    this.#record(Date.now())
    return true
  }

  /**
   * Waits for an allowance slot, in arrival order.
   *
   * @param signal - Aborts the wait.
   * @throws {@link SendTimeoutError} if the wait would exceed `sendTimeout`.
   */
  async acquire(signal?: AbortSignal): Promise<void> {
    const previous = this.#tail
    let release!: () => void
    this.#tail = new Promise<void>((resolve) => {
      release = resolve
    })

    try {
      await previous
      for (;;) {
        signal?.throwIfAborted()
        const delay = this.delayFor(false)
        if (delay <= 0) break

        const { sendTimeout } = this.#options
        if (sendTimeout !== null && delay > sendTimeout) throw new SendTimeoutError(delay)

        await sleep(delay, undefined, signal ? { signal } : undefined)
      }
      this.#record(Date.now())
    } finally {
      release()
    }
  }

  /**
   * Records a send in the sliding window.
   */
  #record(now: number): void {
    this.#sent[this.#next] = now
    this.#next = (this.#next + 1) % this.#options.limit
    if (this.#count < this.#options.limit) this.#count += 1
  }
}
