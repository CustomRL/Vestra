import {
  CompressionMode,
  DefaultCompressionLimits,
  type Compression,
  type CompressionHooks,
  type CompressionLimits,
} from './Compression.js'
import { NoCompression } from './NoCompression.js'
import { ZlibStream } from './ZlibStream.js'
import { ZstdStream } from './ZstdStream.js'

export {
  CompressionMode,
  DefaultCompressionLimits,
  type Compression,
  type CompressionHooks,
  type CompressionLimits,
} from './Compression.js'
export { NoCompression } from './NoCompression.js'
export { ZlibStream } from './ZlibStream.js'
export { ZstdStream } from './ZstdStream.js'

/**
 * Creates a decompressor for a mode.
 *
 * @param mode - The transport compression to use.
 * @param hooks - Where payloads and errors are delivered.
 * @param limits - Memory limits.
 * @returns A decompressor bound to one connection.
 *
 * @remarks
 * A registry lookup rather than a branch on the hot path, so that changing mode is one
 * option and no code path. Each instance belongs to a single connection and must be
 * destroyed with it.
 */
export function createCompression(
  mode: CompressionMode,
  hooks: CompressionHooks,
  limits: CompressionLimits = DefaultCompressionLimits,
): Compression {
  switch (mode) {
    case CompressionMode.ZlibStream:
      return new ZlibStream(hooks, limits)
    case CompressionMode.ZstdStream:
      return new ZstdStream(hooks, limits)
    case CompressionMode.None:
      return new NoCompression(hooks)
  }
}
