import { APIVersion } from '@vestra/types'
import {
  CompressionMode,
  DefaultCompressionLimits,
  type CompressionLimits,
} from './compression/index.js'
import { DefaultBackoffOptions, type BackoffOptions } from './connection/Backoff.js'
import { DefaultHeartbeaterOptions, type HeartbeaterOptions } from './connection/Heartbeater.js'
import { DefaultSendQueueOptions, type SendQueueOptions } from './connection/SendQueue.js'
import type { Timers } from './connection/Heartbeater.js'
import { SystemTimers } from './connection/Heartbeater.js'
import type { Encoding } from './encoding/Encoding.js'
import { JsonEncoding } from './encoding/JsonEncoding.js'
import type { SessionStore } from './session/SessionStore.js'
import { InMemorySessionStore } from './session/SessionStore.js'
import type { TransportFactory } from './transport/Transport.js'
import { WebSocketTransport } from './transport/WebSocketTransport.js'

/**
 * Limits on how much undelivered traffic a connection may hold.
 */
export interface BackpressureOptions {
  /** Messages pushed into decompression but not yet delivered. */
  maxInflightMessages: number
  /** Compressed bytes received but not yet resolved into payloads. */
  maxBufferedBytes: number
}

/**
 * The default back-pressure limits.
 */
export const DefaultBackpressureOptions: BackpressureOptions = {
  maxInflightMessages: 2_000,
  maxBufferedBytes: 32 * 1024 * 1024,
}

/**
 * Configuration for a shard.
 */
export interface ShardOptions {
  /** The bot token, without a scheme prefix. */
  token: string
  /** The intents bit set. */
  intents: number
  /** This shard's index. */
  shardId: number
  /** The total shard count. */
  shardCount: number
  /** The gateway URL from `GET /gateway/bot`. */
  gatewayUrl: string
  /** The API version to request. */
  version?: string
  /** Transport compression. Defaults to `zlib-stream`; see ADR 7. */
  compression?: CompressionMode
  /** The member count above which a guild omits offline members. */
  largeThreshold?: number
  /** Optional protocol behaviours. A bit set of `GatewayCapabilityFlags`. */
  capabilities?: number
  /** The `User-Agent` to present. */
  userAgent?: string
  /** How long to wait for Hello after the socket opens, in milliseconds. */
  handshakeTimeout?: number
  /** How many consecutive resume attempts before falling back to a fresh identify. */
  maxResumeAttempts?: number
  /** Reconnect pacing. */
  backoff?: Partial<BackoffOptions>
  /** Heartbeat settings. */
  heartbeat?: Partial<HeartbeaterOptions>
  /** Command pacing. */
  sendQueue?: Partial<SendQueueOptions>
  /** Decompression limits. */
  compressionLimits?: Partial<CompressionLimits>
  /** Back-pressure limits. */
  backpressure?: Partial<BackpressureOptions>
  /** Where session state is persisted. */
  sessionStore?: SessionStore
  /** How gateway payloads are serialised. */
  encoding?: Encoding
  /** How sockets are created. */
  transport?: TransportFactory
  /** Timer and randomness sources, injectable for testing. */
  timers?: Timers
  /** An undici `Dispatcher` for proxying. */
  dispatcher?: unknown
}

/**
 * {@link ShardOptions} with every default applied.
 */
export interface ResolvedShardOptions {
  token: string
  intents: number
  shardId: number
  shardCount: number
  gatewayUrl: string
  version: string
  compression: CompressionMode
  largeThreshold: number
  capabilities: number
  userAgent: string
  handshakeTimeout: number
  maxResumeAttempts: number
  backoff: BackoffOptions
  heartbeat: HeartbeaterOptions
  sendQueue: SendQueueOptions
  compressionLimits: CompressionLimits
  backpressure: BackpressureOptions
  sessionStore: SessionStore
  encoding: Encoding
  transport: TransportFactory
  timers: Timers
  dispatcher: unknown
}

/**
 * Applies defaults to shard options.
 *
 * @param options - The caller's options.
 * @returns Options with every field populated.
 *
 * @remarks
 * `zlib-stream` is the default compression rather than `zstd-stream`. Node's zstd support
 * is experimental across the whole Node 22 LTS line, and the available round-trip evidence
 * only demonstrates Node is self-consistent with itself rather than interoperable with
 * Discord's encoder. See ADR 7.
 */
export function resolveShardOptions(options: ShardOptions): ResolvedShardOptions {
  return {
    token: options.token,
    intents: options.intents,
    shardId: options.shardId,
    shardCount: options.shardCount,
    gatewayUrl: options.gatewayUrl,
    version: options.version ?? APIVersion,
    compression: options.compression ?? CompressionMode.ZlibStream,
    largeThreshold: options.largeThreshold ?? 50,
    capabilities: options.capabilities ?? 0,
    userAgent: options.userAgent ?? 'DiscordBot (https://github.com/CustomRL/Vestra, 0.0.0)',
    handshakeTimeout: options.handshakeTimeout ?? 30_000,
    maxResumeAttempts: options.maxResumeAttempts ?? 3,
    backoff: { ...DefaultBackoffOptions, ...options.backoff },
    heartbeat: { ...DefaultHeartbeaterOptions, ...options.heartbeat },
    sendQueue: { ...DefaultSendQueueOptions, ...options.sendQueue },
    compressionLimits: { ...DefaultCompressionLimits, ...options.compressionLimits },
    backpressure: { ...DefaultBackpressureOptions, ...options.backpressure },
    sessionStore: options.sessionStore ?? new InMemorySessionStore(),
    encoding: options.encoding ?? new JsonEncoding(),
    transport: options.transport ?? ((listeners, init) => new WebSocketTransport(listeners, init)),
    timers: options.timers ?? SystemTimers,
    dispatcher: options.dispatcher,
  }
}

/**
 * Builds the websocket URL for a connection.
 *
 * @param baseUrl - The gateway or resume URL.
 * @param version - The API version.
 * @param encoding - The encoding query value.
 * @param compression - The compression query value, or `null` for none.
 * @returns A fully qualified gateway URL.
 */
export function buildGatewayUrl(
  baseUrl: string,
  version: string,
  encoding: string,
  compression: string | null,
): string {
  const url = new URL(baseUrl)
  url.searchParams.set('v', version)
  url.searchParams.set('encoding', encoding)
  if (compression !== null) url.searchParams.set('compress', compression)
  return url.toString()
}
