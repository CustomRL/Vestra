import { createInflate, type Inflate } from 'node:zlib'
import type { Compression, CompressionHooks, CompressionLimits } from './Compression.js'

/**
 * The four bytes that terminate every zlib-stream gateway message.
 */
const SUFFIX = Buffer.from([0x00, 0x00, 0xff, 0xff])

/**
 * Decompresses `zlib-stream` gateway traffic using `node:zlib` alone.
 *
 * @remarks
 * Three properties of this transport drive the implementation, and each was verified
 * rather than assumed:
 *
 * - **One context for the whole connection.** The zlib header is sent once at the start
 *   and the LZ77 window carries across payloads, so per-message `inflateSync` is not a
 *   valid implementation — it desynchronises after the first message.
 * - **The boundary is the last four bytes of the arriving websocket message**, never an
 *   interior match. The same four bytes occur naturally inside Huffman-coded data, and
 *   cutting at an interior occurrence desynchronises the shared context for the rest of
 *   the connection.
 * - **Output is harvested inside the write callback.** Node will not enter the next
 *   transform until the current write's callback has fired, and all output for a write is
 *   pushed before it — so the callback is a complete-output barrier. That is also why
 *   there is no `flush()` call here: it would add an empty write and one more threadpool
 *   round-trip per event on the hottest path in the library.
 */
export class ZlibStream implements Compression {
  /** The value for the gateway URL's `compress` parameter. */
  readonly query = 'zlib-stream'

  readonly #hooks: CompressionHooks
  readonly #limits: CompressionLimits
  readonly #inflate: Inflate

  /** Output chunks for the payload currently being decompressed. */
  #chunks: Buffer[] = []
  #chunkBytes = 0
  /** Input bytes written but not yet resolved into a payload. */
  #pending = 0
  #disposed = false

  /**
   * @param hooks - Where payloads and errors are delivered.
   * @param limits - Memory limits.
   */
  constructor(hooks: CompressionHooks, limits: CompressionLimits) {
    this.#hooks = hooks
    this.#limits = limits
    this.#inflate = createInflate({ chunkSize: limits.chunkSize })

    this.#inflate.on('data', (chunk: Buffer) => {
      if (this.#disposed) return
      this.#chunks.push(chunk)
      this.#chunkBytes += chunk.length
    })

    // An unhandled 'error' on a Node stream takes the process down.
    this.#inflate.on('error', (error: Error) => {
      if (this.#disposed) return
      this.#hooks.onError(
        new Error(`Failed to inflate a gateway frame: ${error.message}`, { cause: error }),
      )
    })
  }

  /**
   * Feeds one websocket message in.
   *
   * @param chunk - The raw message.
   */
  push(chunk: Buffer): void {
    if (this.#disposed) return

    this.#pending += chunk.length
    if (this.#pending > this.#limits.maxBufferedBytes) {
      this.#fail(
        `Buffered ${String(this.#pending)} bytes without reaching a frame boundary, past the ` +
          `${String(this.#limits.maxBufferedBytes)} byte limit.`,
      )
      return
    }

    // Every chunk is written on arrival, boundary or not: inflate accepts partial input,
    // so buffering it ourselves first would only add a copy. Only the boundary decides
    // when to harvest.
    const isBoundary = chunk.length >= 4 && chunk.subarray(chunk.length - 4).equals(SUFFIX)

    this.#inflate.write(chunk, (error) => {
      if (this.#disposed) return
      if (error) {
        this.#hooks.onError(
          new Error(`Failed to inflate a gateway frame: ${error.message}`, { cause: error }),
        )
        return
      }
      if (!isBoundary) return
      this.#harvest()
    })
  }

  /**
   * Delivers the accumulated payload and resets for the next one.
   */
  #harvest(): void {
    const chunks = this.#chunks
    const bytes = this.#chunkBytes

    this.#chunks = []
    this.#chunkBytes = 0
    this.#pending = 0

    if (chunks.length === 0) return

    if (bytes > this.#limits.maxPayloadBytes) {
      this.#fail(
        `A gateway payload decompressed to ${String(bytes)} bytes, past the ` +
          `${String(this.#limits.maxPayloadBytes)} byte limit.`,
      )
      return
    }

    // Single-chunk fast path: skip the concat entirely. Sound only because of the borrow
    // contract — the consumer must not retain this buffer.
    const only = chunks[0]
    const payload = chunks.length === 1 && only !== undefined ? only : Buffer.concat(chunks, bytes)
    this.#hooks.onPayload(payload)
  }

  /**
   * Reports a fatal condition and stops accepting input.
   */
  #fail(message: string): void {
    this.#hooks.onError(new Error(message))
    this.destroy()
  }

  /**
   * Releases the decompression context.
   */
  destroy(): void {
    if (this.#disposed) return
    // Set before destroying: output can still be in flight, and every hook checks this.
    this.#disposed = true
    this.#chunks = []
    this.#chunkBytes = 0
    this.#pending = 0
    this.#inflate.destroy()
  }
}
