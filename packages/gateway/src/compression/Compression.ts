/**
 * Transport compression modes Vestra can negotiate.
 */
export const CompressionMode = {
  /** No transport compression. */
  None: 'none',
  /** zlib with a shared context across the connection, framed by a sentinel. */
  ZlibStream: 'zlib-stream',
  /** zstd with a shared context across the connection, one frame per message. */
  ZstdStream: 'zstd-stream',
} as const

/**
 * A transport compression mode.
 */
export type CompressionMode = (typeof CompressionMode)[keyof typeof CompressionMode]

/**
 * Callbacks a decompressor invokes.
 */
export interface CompressionHooks {
  /**
   * Called once per gateway message, in arrival order.
   *
   * @param payload - The decompressed payload.
   *
   * @remarks
   * **Borrow contract: `payload` is valid only for the duration of this call.** It may
   * alias a reused allocation, so decode it here and retain nothing.
   *
   * This is what lets the decompressor skip a copy on the hot path: Node slices output
   * out of a reused internal buffer, so holding a chunk pins up to one chunk size per
   * shard, and the single-chunk fast path — stringify directly, no concatenation — is
   * only sound if consumption happens inside the callback.
   */
  onPayload: (payload: Buffer) => void
  /** A decompression or protocol error occurred. */
  onError: (error: Error) => void
}

/**
 * Limits that stop a hostile or malfunctioning peer exhausting memory.
 */
export interface CompressionLimits {
  /**
   * The most input that may accumulate while waiting for a frame boundary.
   *
   * @remarks
   * Nothing in the protocol guarantees a sentinel ever arrives, so without this a stream
   * that never completes a frame grows without bound.
   */
  maxBufferedBytes: number
  /**
   * The most a single payload may decompress to.
   *
   * @remarks
   * Counted by hand rather than with zlib's `maxOutputLength`, which was verified not to
   * apply to streaming: 200,000 bytes were emitted under a 4,096 byte cap with no error,
   * and Node documents the option as limiting convenience methods only.
   */
  maxPayloadBytes: number
  /** The chunk size for the decompressor's internal buffer. */
  chunkSize: number
}

/**
 * Decompresses gateway traffic.
 */
export interface Compression {
  /**
   * The value for the gateway URL's `compress` parameter, or `null` for none.
   */
  readonly query: string | null
  /**
   * Feeds one websocket message in.
   *
   * @param chunk - The raw message.
   *
   * @remarks
   * Never throws. Errors are delivered to {@link CompressionHooks.onError} so that a
   * decode failure cannot escape into a socket event handler.
   */
  push: (chunk: Buffer) => void
  /**
   * Releases the decompression context.
   *
   * @remarks
   * After this, late output is discarded rather than delivered. Decompression completes
   * asynchronously, so a payload can surface after the socket has closed and a new
   * session has begun; feeding it into the new session would corrupt sequence tracking.
   * Discarding is safe because the sequence number only advances on payloads actually
   * parsed, so a resume replays anything dropped.
   */
  destroy: () => void
}

/**
 * The default limits.
 */
export const DefaultCompressionLimits: CompressionLimits = {
  maxBufferedBytes: 16 * 1024 * 1024,
  maxPayloadBytes: 64 * 1024 * 1024,
  chunkSize: 128 * 1024,
}
