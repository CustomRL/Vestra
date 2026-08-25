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
import { ApplicationCommandRoutes } from './routes/application-commands.js'
import { AuditLogRoutes } from './routes/audit-logs.js'
import { BanRoutes } from './routes/bans.js'
import { MemberRoutes } from './routes/members.js'
import { PollRoutes } from './routes/polls.js'
import { RoleRoutes } from './routes/roles.js'
import { AutoModerationRoutes } from './routes/auto-moderation.js'
import { EmojiRoutes } from './routes/emojis.js'
import { ScheduledEventRoutes } from './routes/scheduled-events.js'
import { StageInstanceRoutes } from './routes/stage-instances.js'
import { StickerRoutes } from './routes/stickers.js'
import { ThreadRoutes } from './routes/threads.js'
import { ChannelRoutes } from './routes/channels.js'
import { GatewayRoutes } from './routes/gateway.js'
import { InteractionRoutes } from './routes/interactions.js'
import { GuildRoutes } from './routes/guilds.js'
import { InviteRoutes } from './routes/invites.js'
import { WebhookRoutes } from './routes/webhooks.js'
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
 * The error for an authorised request made before a token was set.
 *
 * @param path - The route that was attempted, so the message names it.
 * @returns The error to throw.
 *
 * @remarks
 * Shared so the precondition in `raw()` and the guard inside `#send` cannot drift into two
 * different messages for one mistake.
 */
function missingToken(path: string): Error {
  return new Error(
    `Cannot send an authorised request to ${path} before setToken() is called. ` +
      'Pass `auth: false` for endpoints that do not need a token.',
  )
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
  /** The guild itself, and the channels and invites it owns. */
  readonly guilds: GuildRoutes
  /** Guild member endpoints. */
  readonly members: MemberRoutes
  /** Ban endpoints. */
  readonly bans: BanRoutes
  /** Guild role endpoints. */
  readonly roles: RoleRoutes
  /** User endpoints. */
  readonly users: UserRoutes
  /** Gateway bootstrap endpoints. */
  readonly gateway: GatewayRoutes
  /**
   * Interaction response endpoints.
   *
   * @remarks
   * These authenticate with the interaction token rather than the bot token, and are the one
   * family the rate limiter does not queue — the initial response has a three-second deadline.
   */
  readonly interactions: InteractionRoutes
  /**
   * Webhook endpoints.
   *
   * @remarks
   * The `*WithToken` forms and `execute` send no bot token: a webhook's ID and token are a
   * credential in their own right, so those routes are unauthenticated and must stay that way.
   */
  readonly webhooks: WebhookRoutes
  /**
   * Invite endpoints addressed by code.
   *
   * @remarks
   * Creating and listing invites belongs to the channel and guild that own them, so those are
   * on `channels` and `guilds`; only the two routes keyed by the code alone are here.
   */
  readonly invites: InviteRoutes
  /**
   * Application command registration.
   *
   * @remarks
   * Global and guild forms are separate methods because the difference is not a parameter: a
   * guild command is live immediately and a global one takes up to an hour, so the choice is
   * a deployment decision rather than an argument.
   */
  readonly commands: ApplicationCommandRoutes
  /**
   * Emoji endpoints, for guilds and for the application itself.
   *
   * @remarks
   * Both live here because they are one resource with two owners. A guild emoji counts
   * against a guild's slots and can be limited to roles; an application emoji belongs to the
   * bot and works everywhere it does.
   */
  readonly emojis: EmojiRoutes
  /**
   * Sticker endpoints.
   *
   * @remarks
   * Creating one is the only route in the API whose parameters are discrete form parts rather
   * than a `payload_json` object, which is why `RequestData` has a `fields` member at all.
   */
  readonly stickers: StickerRoutes
  /**
   * Poll endpoints.
   *
   * @remarks
   * A poll is a field on a message rather than a resource of its own, so only two things need
   * routes: who voted for an answer, and ending one early.
   */
  readonly polls: PollRoutes
  /**
   * Membership of and access to existing threads.
   *
   * @remarks
   * Starting a thread is on `channels`, because a thread is started from a channel or from a
   * message. What is here is everything addressed by a thread that already exists.
   */
  readonly threads: ThreadRoutes
  /**
   * The audit log.
   *
   * @remarks
   * Its own namespace rather than a guild method, because what it returns is a page of
   * entries plus every entity those entries name — and the side lists are the reason the
   * route is usable at all.
   */
  readonly auditLogs: AuditLogRoutes
  /** Auto-moderation rule endpoints. */
  readonly autoModeration: AutoModerationRoutes
  /** Guild scheduled event endpoints. */
  readonly scheduledEvents: ScheduledEventRoutes
  /**
   * Stage instance endpoints.
   *
   * @remarks
   * Addressed by the stage *channel's* ID rather than the instance's, which is the one thing
   * about this resource that reads wrong and compiles fine.
   */
  readonly stageInstances: StageInstanceRoutes

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
    this.interactions = new InteractionRoutes(this)
    this.guilds = new GuildRoutes(this)
    this.members = new MemberRoutes(this)
    this.bans = new BanRoutes(this)
    this.roles = new RoleRoutes(this)
    this.webhooks = new WebhookRoutes(this)
    this.invites = new InviteRoutes(this)
    this.commands = new ApplicationCommandRoutes(this)
    this.emojis = new EmojiRoutes(this)
    this.stickers = new StickerRoutes(this)
    this.polls = new PollRoutes(this)
    this.threads = new ThreadRoutes(this)
    this.auditLogs = new AuditLogRoutes(this)
    this.autoModeration = new AutoModerationRoutes(this)
    this.scheduledEvents = new ScheduledEventRoutes(this)
    this.stageInstances = new StageInstanceRoutes(this)
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
    // **Before the queue, not inside the send.** A missing token is a configuration mistake,
    // and no number of retries makes one succeed — but the send closure is what the retry
    // loop wraps, so throwing there cost four attempts and about five seconds of exponential
    // backoff to arrive at the same error the first attempt already knew.
    if (request.auth !== false && this.#token === null) throw missingToken(request.path)

    const identity = this.#registry.getIdentity(request.method, request.path)
    // Stable for the life of the route: deliberately not the bucket hash, which changes
    // the moment Discord first reveals it and would strand this handler mid-queue.
    const bucketKey = this.#registry.getHandlerKey(identity)

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

    // Built with set() rather than from an object literal: header names are
    // case-insensitive, but object keys are not, so `{ 'User-Agent': a, 'user-agent': b }`
    // survives as two entries and Headers joins them into one malformed value.
    const headers = new Headers()
    headers.set('User-Agent', this.#options.userAgent)
    if (request.headers !== undefined) {
      for (const [name, value] of Object.entries(request.headers)) headers.set(name, value)
    }

    if (request.auth !== false) {
      // Checked again in `raw()` before queueing, and that is where the useful failure comes
      // from. This one cannot be reached through the public API and exists so `#send` is
      // correct on its own terms rather than only in the order it happens to be called.
      if (this.#token === null) throw missingToken(request.path)
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
      body = buildFormData(request.body, request.files, request.fields)
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
      if (!isJson) return await response.arrayBuffer()
      try {
        return await response.json()
      } catch (error) {
        // A truncated or mislabelled body must not surface as a bare SyntaxError with no
        // indication of which request produced it.
        throw new HTTPError(
          response.status,
          response.statusText,
          request.method,
          request.path,
          `response declared JSON but did not parse: ${String(error)}`,
        )
      }
    }

    if (isJson) {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        throw new HTTPError(
          response.status,
          response.statusText,
          request.method,
          request.path,
          await response.text().catch(() => undefined),
        )
      }
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
