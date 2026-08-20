import { setTimeout as sleep } from 'node:timers/promises'
import { RateLimitError } from '../errors/RateLimitError.js'
import { AsyncQueue } from './AsyncQueue.js'
import type { BucketRegistry, RouteIdentity } from './BucketRegistry.js'
import type { GlobalLimiter } from './GlobalLimiter.js'
import type { InvalidRequestTracker } from './InvalidRequestTracker.js'
import type { ResolvedRESTOptions } from '../RESTOptions.js'

/**
 * Details of a rate limit a request had to wait on.
 */
export interface RateLimitInfo {
  /** The bucket that delayed the request. */
  bucket: string
  /** How long the request waited, in milliseconds. */
  timeToReset: number
  /** The bucket's request allowance, if known. */
  limit: number
  /** The HTTP method. */
  method: string
  /** The normalised route. */
  route: string
  /** Whether the limit was global. */
  global: boolean
  /** Whether the wait followed a 429, rather than being predicted from headers. */
  afterRejection: boolean
}

/**
 * Shared services a handler needs but does not own.
 */
export interface HandlerContext {
  /** The account-wide limiter. */
  global: GlobalLimiter
  /** The Cloudflare ban guard. */
  invalid: InvalidRequestTracker
  /** The route-to-bucket-hash map. */
  registry: BucketRegistry
  /** Resolved client options. */
  options: ResolvedRESTOptions
  /** Reports a rate limit to the client's listeners. */
  onRateLimit: (info: RateLimitInfo) => void
}

/** Statuses worth retrying: the request never reached a decision. */
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504])

/**
 * Serialises and paces every request in one rate-limit bucket.
 *
 * @remarks
 * Requests in a bucket are executed one at a time. Discord would permit the whole
 * allowance concurrently, so this leaves throughput on the table — but concurrent
 * requests observe each other's headers out of order, and reconstructing bucket state
 * from interleaved responses is where rate limiters get subtly wrong and start emitting
 * 429s. Serialising makes the state unambiguous, and per-bucket parallelism is available
 * anyway because separate channels and guilds occupy separate buckets.
 */
export class SequentialHandler {
  /** The bucket this handler serialises. */
  readonly bucketKey: string

  readonly #context: HandlerContext
  readonly #queue = new AsyncQueue()

  /** The bucket's total allowance, once a response has revealed it. */
  #limit = Number.POSITIVE_INFINITY
  /** Requests left in the current window. */
  #remaining = 1
  /** When the window resets, as a millisecond timestamp. */
  #resetAt = 0

  /**
   * @param bucketKey - The key identifying this bucket.
   * @param context - Shared services.
   */
  constructor(bucketKey: string, context: HandlerContext) {
    this.bucketKey = bucketKey
    this.#context = context
  }

  /** Whether the handler holds no state and has nobody waiting, so it can be swept. */
  get inactive(): boolean {
    return this.#queue.remaining === 0 && this.#resetAt <= Date.now()
  }

  /**
   * Queues a request, waiting for the bucket and the global limiter in turn.
   *
   * @param identity - The request's route identity.
   * @param method - The HTTP method, for diagnostics.
   * @param send - Performs the HTTP request. Called once per attempt.
   * @param signal - Aborts the request, including while queued.
   * @returns The final response.
   */
  async queue(
    identity: RouteIdentity,
    method: string,
    send: () => Promise<Response>,
    signal?: AbortSignal,
  ): Promise<Response> {
    const release = await this.#queue.acquire(signal)
    try {
      return await this.#run(identity, method, send, signal)
    } finally {
      release()
    }
  }

  async #run(
    identity: RouteIdentity,
    method: string,
    send: () => Promise<Response>,
    signal?: AbortSignal,
  ): Promise<Response> {
    const { options, global, invalid, registry } = this.#context
    let attempt = 0

    for (;;) {
      await this.#awaitAvailability(identity, method, false, signal)

      if (invalid.shouldStop()) {
        throw new Error(
          `Refusing to send: ${String(invalid.countIn())} invalid requests in the last ten ` +
            'minutes. Continuing risks a Cloudflare ban on this IP for every application ' +
            'sharing it. Fix the failing requests, or raise `invalidRequestThreshold` if ' +
            'this is expected.',
        )
      }

      // Consume the global allowance only once the bucket has cleared, so a request
      // stalled on its bucket does not hold a global token it cannot use.
      await global.acquire(identity.exemptFromGlobal, signal)

      const response = await send()

      invalid.register(response.status)
      this.#applyHeaders(response.headers, identity.route, registry)

      if (response.status === 429) {
        const retryAfter = this.#retryAfterFrom(response)
        const scope = response.headers.get('x-ratelimit-scope')

        if (scope === 'global') {
          global.blockUntil(Date.now() + retryAfter)
        }

        this.#context.onRateLimit({
          bucket: this.bucketKey,
          timeToReset: retryAfter,
          limit: this.#limit,
          method,
          route: identity.route,
          global: scope === 'global',
          afterRejection: true,
        })

        if (attempt >= options.retries) return response
        attempt += 1

        this.#assertWithinTimeout(retryAfter, identity, method, scope === 'global')
        await sleep(retryAfter, undefined, signal ? { signal } : undefined)
        continue
      }

      if (RETRYABLE_STATUSES.has(response.status) && attempt < options.retries) {
        attempt += 1
        // Exponential backoff with jitter: a fleet of shards retrying a Discord incident
        // in lockstep is indistinguishable from an attack.
        const backoff = 2 ** attempt * 500
        const jittered = backoff * (0.5 + Math.random() * 0.5)
        await sleep(jittered, undefined, signal ? { signal } : undefined)
        continue
      }

      return response
    }
  }

  /**
   * Waits until both this bucket and the global limiter would admit a request.
   */
  async #awaitAvailability(
    identity: RouteIdentity,
    method: string,
    afterRejection: boolean,
    signal?: AbortSignal,
  ): Promise<void> {
    const now = Date.now()
    const bucketDelay = this.#remaining <= 0 ? Math.max(0, this.#resetAt - now) : 0
    const globalDelay = this.#context.global.delayFor(identity.exemptFromGlobal, now)
    const delay = Math.max(bucketDelay, globalDelay)
    if (delay <= 0) return

    this.#assertWithinTimeout(delay, identity, method, globalDelay > bucketDelay)

    this.#context.onRateLimit({
      bucket: this.bucketKey,
      timeToReset: delay,
      limit: this.#limit,
      method,
      route: identity.route,
      global: globalDelay > bucketDelay,
      afterRejection,
    })

    await sleep(bucketDelay, undefined, signal ? { signal } : undefined)
  }

  #assertWithinTimeout(
    delay: number,
    identity: RouteIdentity,
    method: string,
    global: boolean,
  ): void {
    const ceiling = this.#context.options.rateLimitTimeout
    if (ceiling !== null && delay > ceiling) {
      throw new RateLimitError({
        timeToReset: delay,
        bucket: this.bucketKey,
        method,
        path: identity.route,
        global,
      })
    }
  }

  /**
   * Updates bucket state from a response's rate-limit headers.
   */
  #applyHeaders(headers: Headers, route: string, registry: BucketRegistry): void {
    const hash = headers.get('x-ratelimit-bucket')
    if (hash !== null) registry.setHash(route, hash)

    const limit = headers.get('x-ratelimit-limit')
    if (limit !== null) this.#limit = Number(limit)

    const remaining = headers.get('x-ratelimit-remaining')
    if (remaining !== null) this.#remaining = Number(remaining)

    // `reset-after` is relative, so it is immune to clock skew between this machine and
    // Discord's. `reset` is an absolute Unix time and is only a fallback.
    const resetAfter = headers.get('x-ratelimit-reset-after')
    if (resetAfter !== null) {
      this.#resetAt = Date.now() + Number(resetAfter) * 1000
      return
    }
    const reset = headers.get('x-ratelimit-reset')
    if (reset !== null) this.#resetAt = Number(reset) * 1000
  }

  /**
   * How long to wait after a 429, in milliseconds.
   */
  #retryAfterFrom(response: Response): number {
    // `x-ratelimit-reset-after` is the most precise, then the standard header. Both are
    // in seconds and may be fractional.
    const precise = response.headers.get('x-ratelimit-reset-after')
    if (precise !== null) return Number(precise) * 1000

    const header = response.headers.get('retry-after')
    if (header !== null) return Number(header) * 1000

    return 1000
  }
}
