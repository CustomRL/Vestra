/**
 * Discord gateway client: sharding, resuming and transport compression.
 *
 * @packageDocumentation
 */

import { APIVersion } from '@vestra/types'

/**
 * Transport compression modes Vestra can negotiate.
 *
 * @remarks
 * Both are decompressed with `node:zlib` alone — `zstd-stream` via
 * `createZstdDecompress` (Node 22.15+) — which is why the gateway needs
 * no runtime dependency.
 */
export const TransportCompression = {
  ZlibStream: 'zlib-stream',
  ZstdStream: 'zstd-stream',
} as const

/**
 * A transport compression mode.
 */
export type TransportCompression = (typeof TransportCompression)[keyof typeof TransportCompression]

/**
 * Builds the gateway websocket URL for a given resume or identify.
 *
 * @param baseUrl - The `wss://` URL returned by `GET /gateway/bot`, or a resume URL.
 * @param compression - Transport compression to negotiate, or `null` for none.
 * @returns A fully qualified gateway URL including version and encoding.
 */
export function buildGatewayUrl(baseUrl: string, compression: TransportCompression | null): string {
  const url = new URL(baseUrl)
  url.searchParams.set('v', APIVersion)
  url.searchParams.set('encoding', 'json')
  if (compression !== null) url.searchParams.set('compress', compression)
  return url.toString()
}
