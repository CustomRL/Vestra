import { createZstdDecompress } from 'node:zlib'
import type { Compression, CompressionHooks, CompressionLimits } from './Compression.js'

/**
 * Decompresses `zstd-stream` gateway traffic using `node:zlib` alone.
 *
 * @remarks
 * Simpler than {@link ZlibStream} because there is no sentinel to look for: one websocket
 * message is one gateway message. Verified — the zstd magic bytes appear on the first
 * message only, and decompressing message two in isolation fails with
 * `ZSTD_error_prefix_unknown`, confirming a single context spans the connection.
 *
 * That simplicity has a cost worth stating plainly: **zstd gives the client no boundary
 * self-check.** With `zlib-stream`, a missing sentinel is detectable. Here, if Discord
 * ever violated the one-message-to-one-payload assumption, the only symptom would be a
 * `JSON.parse` failure downstream — which is why that failure is surfaced as a protocol
 * error rather than a decode bug.
 *
 * Not the default. `zlib.createZstdDecompress` is Stability 1 in Node 22, and the
 * available round-trip evidence used Node's compressor on both ends, which proves
 * self-consistency rather than interoperability with Discord's encoder. See ADR 7.
 */
export class ZstdStream implements Compression {
  /** The value for the gateway URL's `compress` parameter. */
  readonly query = 'zstd-stream'

  readonly #hooks: CompressionHooks
  readonly #limits: CompressionLimits
  readonly #decompress: ReturnType<typeof createZstdDecompress>

  #chunks: Buffer[] = []
  #chunkBytes = 0
  #disposed = false

  /**
   * @param hooks - Where payloads and errors are delivered.
   * @param limits - Memory limits.
   */
  constructor(hooks: CompressionHooks, limits: CompressionLimits) {
    this.#hooks = hooks
    this.#limits = limits
    this.#decompress = createZstdDecompress({ chunkSize: limits.chunkSize })

    this.#decompress.on('data', (chunk: Buffer) => {
      if (this.#disposed) return
      this.#chunks.push(chunk)
      this.#chunkBytes += chunk.length
    })

    this.#decompress.on('error', (error: Error) => {
      if (this.#disposed) return
      this.#hooks.onError(
        new Error(`Failed to decompress a gateway frame: ${error.message}`, { cause: error }),
      )
    })
  }

  /**
   * Feeds one websocket message in, which is exactly one gateway message.
   *
   * @param chunk - The raw message.
   */
  push(chunk: Buffer): void {
    if (this.#disposed) return

    // No input buffering and no manual decompress loop: the write callback already acts
    // as the complete-output barrier, and `flush(ZSTD_e_flush)` would add a threadpool
    // round-trip per event for nothing.
    this.#decompress.write(chunk, (error) => {
      if (this.#disposed) return
      if (error) {
        this.#hooks.onError(
          new Error(`Failed to decompress a gateway frame: ${error.message}`, { cause: error }),
        )
        return
      }
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

    if (chunks.length === 0) return

    if (bytes > this.#limits.maxPayloadBytes) {
      this.#hooks.onError(
        new Error(
          `A gateway payload decompressed to ${String(bytes)} bytes, past the ` +
            `${String(this.#limits.maxPayloadBytes)} byte limit.`,
        ),
      )
      this.destroy()
      return
    }

    const only = chunks[0]
    const payload = chunks.length === 1 && only !== undefined ? only : Buffer.concat(chunks, bytes)
    this.#hooks.onPayload(payload)
  }

  /**
   * Releases the decompression context.
   */
  destroy(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#chunks = []
    this.#chunkBytes = 0
    this.#decompress.destroy()
  }
}
