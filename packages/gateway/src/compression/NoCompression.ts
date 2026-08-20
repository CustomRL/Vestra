import type { Compression, CompressionHooks } from './Compression.js'

/**
 * Passes gateway messages through undecompressed.
 *
 * @remarks
 * Useful for debugging a suspected decompression fault, and for a proxy that has already
 * decompressed the stream. Costs meaningfully more bandwidth than either streaming mode.
 */
export class NoCompression implements Compression {
  /** No `compress` parameter is added to the gateway URL. */
  readonly query = null

  readonly #hooks: CompressionHooks
  #disposed = false

  /**
   * @param hooks - Where payloads and errors are delivered.
   */
  constructor(hooks: CompressionHooks) {
    this.#hooks = hooks
  }

  /**
   * Delivers one websocket message unchanged.
   *
   * @param chunk - The raw message.
   */
  push(chunk: Buffer): void {
    if (this.#disposed) return
    this.#hooks.onPayload(chunk)
  }

  /**
   * Stops accepting input.
   */
  destroy(): void {
    this.#disposed = true
  }
}
