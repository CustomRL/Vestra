import { APIVersion } from '@vestra/types'

/**
 * A file to upload as part of a multipart request.
 */
export interface RawFile {
  /** The filename, including extension. Discord infers the content type from it. */
  name: string
  /** The file contents. */
  data: ArrayBuffer | Uint8Array | string
  /** An explicit content type, when the extension would be misleading. */
  contentType?: string
  /** The attachment index this file corresponds to in the JSON body. */
  key?: string
}

/**
 * Everything about a single request beyond its method and path.
 */
export interface RequestData {
  /** A JSON body. Ignored when `files` is present unless sent as the `payload_json` part. */
  body?: unknown
  /** Query string parameters. */
  query?: URLSearchParams | Record<string, string | number | boolean | undefined>
  /** Extra headers, merged over the defaults. */
  headers?: Record<string, string>
  /** Files to upload, which switches the request to `multipart/form-data`. */
  files?: RawFile[]
  /**
   * Form parts sent beside the files, each as its own field rather than inside `payload_json`.
   *
   * @remarks
   * For the one endpoint that needs it. `POST /guilds/{id}/stickers` takes `name`,
   * `description` and `tags` as three separate text parts; sending them the usual way, inside
   * `payload_json`, gets a validation error naming fields the caller believes it did send.
   *
   * Only read when `files` is present, because there is no multipart body without one.
   */
  fields?: Record<string, string>
  /**
   * A reason recorded in the guild's audit log.
   *
   * @remarks
   * Sent as `X-Audit-Log-Reason` and URL-encoded, so non-ASCII reasons survive intact.
   * Only meaningful on endpoints Discord audits.
   */
  reason?: string
  /** Whether to send the authorisation header. Defaults to `true`. */
  auth?: boolean
  /** Aborts the request, including while it waits in a rate-limit queue. */
  signal?: AbortSignal
  /** Whether to prefix the path with the API version. Defaults to `true`. */
  versioned?: boolean
}

/**
 * Configuration for a {@link REST} instance.
 */
export interface RESTOptions {
  /** The API base URL, without a version segment. */
  api?: string
  /** The API version to target. */
  version?: string
  /** The CDN base URL. */
  cdn?: string
  /** The authorisation scheme. */
  authPrefix?: 'Bearer' | 'Bot'
  /**
   * The `User-Agent` sent with every request.
   *
   * @remarks
   * Discord requires a user agent identifying the library and version, and may block
   * traffic that does not carry one.
   */
  userAgent?: string
  /** Requests permitted per second across the whole token. */
  globalRequestsPerSecond?: number
  /** Invalid responses tolerated in a ten-minute window before requests are refused. */
  invalidRequestThreshold?: number
  /** How many times to retry a request that failed for a transient reason. */
  retries?: number
  /** How long a single attempt may take before being aborted, in milliseconds. */
  timeout?: number
  /**
   * The longest a request may wait on a rate limit before failing, in milliseconds.
   *
   * @remarks
   * `null` waits indefinitely, which is right for a bot that should be slow rather than
   * lossy. Set a ceiling when a request is served behind something impatient, such as a
   * web request, where a ten-minute stall is worse than an error.
   */
  rateLimitTimeout?: number | null
  /**
   * Extra milliseconds to wait past every rate-limit reset before resuming.
   *
   * @remarks
   * `x-ratelimit-reset-after` and `retry_after` are measured by Discord's edge at the
   * instant it wrote the response. By the time a client has read them the window has
   * already moved on, so a client that resumes at exactly the stated moment is left with
   * nothing but that response's own transit time as slack — and a millisecond of jitter
   * anywhere puts the retry back inside the window it was waiting out.
   *
   * A 429 earned that way is not free: it counts toward the invalid-request budget that
   * ends in a Cloudflare ban on the IP, shared by every application behind it. Fifty
   * milliseconds of throughput is a cheap premium against that.
   *
   * `0` disables it, which is only sensible against a server whose clock and latency you
   * control — a test double, or a proxy that rewrites the headers.
   */
  rateLimitOffset?: number
  /** A `fetch` implementation, for testing or for routing through a proxy. */
  fetch?: typeof globalThis.fetch
}

/**
 * {@link RESTOptions} with every default applied.
 */
export type ResolvedRESTOptions = Required<Omit<RESTOptions, 'rateLimitTimeout'>> & {
  rateLimitTimeout: number | null
}

/**
 * The defaults a {@link REST} instance uses when an option is not supplied.
 */
export const DefaultRESTOptions: ResolvedRESTOptions = {
  api: 'https://discord.com/api',
  version: APIVersion,
  cdn: 'https://cdn.discordapp.com',
  authPrefix: 'Bot',
  userAgent: 'DiscordBot (https://github.com/CustomRL/Vestra, 0.0.0)',
  globalRequestsPerSecond: 50,
  invalidRequestThreshold: 9_500,
  retries: 3,
  timeout: 15_000,
  rateLimitTimeout: null,
  rateLimitOffset: 50,
  fetch: globalThis.fetch,
}

/**
 * Base URLs derived from the resolved options.
 *
 * @param options - Resolved REST options.
 * @returns The versioned API root and the CDN root.
 */
export function routeBases(options: ResolvedRESTOptions): { api: string; cdn: string } {
  return { api: `${options.api}/v${options.version}`, cdn: options.cdn }
}
