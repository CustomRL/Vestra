import { EventEmitter } from 'node:events'
import { DiscordAPIError } from './errors/DiscordAPIError.js'
import { HTTPError } from './errors/HTTPError.js'
import { buildFormData } from './files/FormDataBuilder.js'
import {
  DefaultRESTOptions,
  routeBases,
  type RequestData,
  type ResolvedRESTOptions,
  type RESTOptions,
} from './RESTOptions.js'
import { BucketRegistry } from './ratelimit/BucketRegistry.js'
import { GlobalLimiter } from './ratelimit/GlobalLimiter.js'
import { InvalidRequestTracker } from './ratelimit/InvalidRequestTracker.js'
import {
  SequentialHandler,
  type HandlerContext,
  type RateLimitInfo,
} from './ratelimit/SequentialHandler.js'
import { ChannelRoutes } from './routes/channels.js'
import { GatewayRoutes } from './routes/gateway.js'
import { GuildRoutes } from './routes/guilds.js'
import { UserRoutes } from './routes/users.js'

/** HTTP methods the client issues. */
export type RequestMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'

/** A fully described request. */
export interface InternalRequest extends RequestData {
  /** The HTTP method. */
  method: RequestMethod
  /** The path, relative to the versioned API root. */
  path: string
}

/**
 * Events a {@link REST} instance emits.
 */
export interface RESTEvents {
  /** A request had to wait on a rate limit. */
  rateLimited: [info: RateLimitInfo]
  /** A response was received, before any error is thrown for it. */
  response: [request: InternalRequest, status: number]
}

/**
 * A Discord REST client.
 *
 * @remarks
 * Rate limiting is bucket-accurate rather than route-based: Discord keys limits by an
 * opaque hash that several routes may share and that can be remapped at any time, so
 * anything derived purely from the URL is a guess that drifts.
 *
 * @example
 * ```ts
 * const rest = new REST().setToken(process.env.TOKEN)
 * const message = await rest.post<APIMessage>('/channels/123/messages', {
 *   body: { content: 'hello' },
 * })
 * ```
 */
export class REST extends EventEmitter<RESTEvents> {
  readonly #options: ResolvedRESTOptions
  readonly #registry = new BucketRegistry()
  readonly #global: GlobalLimiter
  readonly #invalid: InvalidRequestTracker
  readonly #handlers = new Map<string, SequentialHandler>()
  readonly #context: HandlerContext
  #token: string | null = null

  /** Channel and message endpoints. */
  readonly channels: ChannelRoutes
  /** Guild, member, ban and role endpoints. */
  readonly guilds: GuildRoutes
  /** User endpoints. */
  readonly users: UserRoutes
  /** Gateway bootstrap endpoints. */
  readonly gateway: GatewayRoutes

  /**
   * @param options - Overrides for the client defaults.
   */
  constructor(options: RESTOptions = {}) {
    super()
    this.#options = { ...DefaultRESTOptions, ...options }
    this.#global = new GlobalLimiter(this.#options.globalRequestsPerSecond)
    this.#invalid = new InvalidRequestTracker(this.#options.invalidRequestThreshold)
    this.#context = {
      global: this.#global,
      invalid: this.#invalid,
      registry: this.#registry,
      options: this.#options,
      onRateLimit: (info) => {
        this.emit('rateLimited', info)
      },
    }

    this.channels = new ChannelRoutes(this)
    this.guilds = new GuildRoutes(this)
    this.users = new UserRoutes(this)
    this.gateway = new GatewayRoutes(this)
  }

  /**
   * Sets the token used for authorised requests.
   *
   * @param token - The bot or bearer token, without a scheme prefix.
   * @returns This client, for chaining.
   */
  setToken(token: string): this {
    this.#token = token
    return this
  }

  /** The resolved options in use. */
  get options(): Readonly<ResolvedRESTOptions> {
    return this.#options
  }

  /** Performs a `GET`. */
  async get<T>(path: string, data?: RequestData): Promise<T> {
    return await this.request<T>({ ...data, method: 'GET', path })
  }

  /** Performs a `POST`. */
  async post<T>(path: string, data?: RequestData): Promise<T> {
    return await this.request<T>({ ...data, method: 'POST', path })
  }

  /** Performs a `PUT`. */
  async put<T>(path: string, data?: RequestData): Promise<T> {
    return await this.request<T>({ ...data, method: 'PUT', path })
  }

  /** Performs a `PATCH`. */
  async patch<T>(path: string, data?: RequestData): Promise<T> {
    return await this.request<T>({ ...data, method: 'PATCH', path })
  }

  /** Performs a `DELETE`. */
  async delete<T>(path: string, data?: RequestData): Promise<T> {
    return await this.request<T>({ ...data, method: 'DELETE', path })
  }

  /**
   * Performs a request and parses the response.
   *
   * @typeParam T - The expected response body.
   * @param request - The request to perform.
   * @returns The parsed body, or `undefined` for a `204`.
   * @throws {@link DiscordAPIError} when Discord describes the failure in the body.
   * @throws {@link HTTPError} for any other unsuccessful response.
   */
  async request<T>(request: InternalRequest): Promise<T> {
    const response = await this.raw(request)
    return (await this.#parse(response, request)) as T
  }

  /**
   * Performs a request and returns the raw response.
   *
   * @param request - The request to perform.
   * @returns The response, whatever its status. Nothing is thrown for a 4xx or 5xx.
   *
   * @remarks
   * The escape hatch for endpoints Vestra does not model, and for reading headers or
   * streaming a body directly.
   */
  async raw(request: InternalRequest): Promise<Response> {
    const identity = this.#registry.getIdentity(request.method, request.path)
    const bucketKey = this.#registry.getBucketKey(identity)

    let handler = this.#handlers.get(bucketKey)
    if (handler === undefined) {
      handler = new SequentialHandler(bucketKey, this.#context)
      this.#handlers.set(bucketKey, handler)
    }

    const response = await handler.queue(
      identity,
      request.method,
      async () => await this.#send(request),
      request.signal,
    )

    this.emit('response', request, response.status)
    return response
  }

  /**
   * Issues a single HTTP attempt.
   */
  async #send(request: InternalRequest): Promise<Response> {
    const { api } = routeBases(this.#options)
    const base = request.versioned === false ? this.#options.api : api
    const url = new URL(`${base}${request.path}`)

    if (request.query !== undefined) {
      const query =
        request.query instanceof URLSearchParams
          ? request.query
          : new URLSearchParams(
              Object.entries(request.query)
                .filter((entry): entry is [string, string | number | boolean] => entry[1] != null)
                .map(([key, value]) => [key, String(value)]),
            )
      url.search = query.toString()
    }

    const headers = new Headers({
      'User-Agent': this.#options.userAgent,
      ...request.headers,
    })

    if (request.auth !== false) {
      if (this.#token === null) {
        throw new Error(
          `Cannot send an authorised request to ${request.path} before setToken() is called. ` +
            'Pass `auth: false` for endpoints that do not need a token.',
        )
      }
      headers.set('Authorization', `${this.#options.authPrefix} ${this.#token}`)
    }

    if (request.reason !== undefined) {
      // Audit log reasons may contain any text; encoding keeps non-ASCII intact rather
      // than producing an invalid header.
      headers.set('X-Audit-Log-Reason', encodeURIComponent(request.reason))
    }

    // Narrower than fetch's BodyInit, which is a DOM type unavailable under `lib: es2023`.
    // These are the only two shapes this client ever produces.
    let body: FormData | string | undefined
    if (request.files !== undefined && request.files.length > 0) {
      // Content-Type is deliberately left unset: fetch adds it with the boundary, and
      // overriding it produces a request Discord cannot parse.
      body = buildFormData(request.body, request.files)
    } else if (request.body !== undefined) {
      headers.set('Content-Type', 'application/json')
      body = JSON.stringify(request.body)
    }

    // The timeout applies per attempt, not to the queued wait, so a request delayed
    // behind a long rate limit is not cancelled for being slow to start.
    const signals: AbortSignal[] = [AbortSignal.timeout(this.#options.timeout)]
    if (request.signal !== undefined) signals.push(request.signal)

    return await this.#options.fetch(url, {
      method: request.method,
      headers,
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.any(signals),
    })
  }

  /**
   * Turns a response into a parsed body, or the appropriate error.
   */
  async #parse(response: Response, request: InternalRequest): Promise<unknown> {
    if (response.status === 204) return undefined

    const contentType = response.headers.get('content-type') ?? ''
    const isJson = contentType.includes('application/json')

    if (response.ok) {
      return isJson ? await response.json() : await response.arrayBuffer()
    }

    if (isJson) {
      const body: unknown = await response.json()
      if (DiscordAPIError.isErrorBody(body)) {
        throw new DiscordAPIError(body, response.status, request.method, request.path)
      }
      throw new HTTPError(
        response.status,
        response.statusText,
        request.method,
        request.path,
        JSON.stringify(body),
      )
    }

    throw new HTTPError(
      response.status,
      response.statusText,
      request.method,
      request.path,
      await response.text().catch(() => undefined),
    )
  }

  /**
   * Drops bucket handlers and route hashes that are no longer in use.
   *
   * @returns How many handlers and hashes were removed.
   *
   * @remarks
   * Worth calling periodically in a long-lived process that touches many channels or
   * guilds; each idle handler is small, but the count is unbounded without this.
   */
  sweep(): { handlers: number; hashes: number } {
    let handlers = 0
    for (const [key, handler] of this.#handlers) {
      if (handler.inactive) {
        this.#handlers.delete(key)
        handlers += 1
      }
    }
    return { handlers, hashes: this.#registry.sweep() }
  }
}
