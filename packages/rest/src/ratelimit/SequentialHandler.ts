import { setTimeout as sleep } from 'node:timers/promises'
import { RateLimitError } from '../errors/RateLimitError.js'
import { AsyncQueue } from './AsyncQueue.js'
import type { BucketRegistry, BucketState, RouteIdentity } from './BucketRegistry.js'
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
  /** The route-to-bucket-hash map, which also owns bucket state. */
  registry: BucketRegistry
  /** Resolved client options. */
  options: ResolvedRESTOptions
  /** Reports a rate limit to the client's listeners. */
  onRateLimit: (info: RateLimitInfo) => void
}

/** Statuses worth retrying: the request never reached a decision. */
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504])

/**
 * Reads a numeric header, rejecting anything that does not parse to a finite number.
 *
 * @param headers - The response headers.
 * @param name - The header to read.
 * @returns The value, or `null` if absent or unparseable.
 *
 * @remarks
 * `Number()` on a header is not safe. `Headers.get` joins duplicate headers with `", "`,
 * so a proxy that duplicates `x-ratelimit-remaining` yields `Number('0, 0')` — `NaN`. A
 * `Retry-After` in the HTTP-date form that RFC 9110 permits does the same. Every
 * downstream comparison then fails *open*: `NaN <= 0` is false so the bucket looks
 * infinite, `sleep(NaN)` is coerced to 1 ms so backoff becomes a retry storm, and
 * `NaN > ceiling` is false so `rateLimitTimeout` never fires.
 */
function numericHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name)
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * Releases a response whose body will never be read.
 *
 * @param response - The response to discard.
 *
 * @remarks
 * Node's fetch keeps the underlying socket checked out until a body is consumed or
 * cancelled. Abandoning the response of every retried attempt leaks a connection per
 * attempt and eventually exhausts the pool, which presents as unexplained hangs rather
 * than as an error.
 */
async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // The body may already be errored or locked; nothing left to release.
  }
}

/**
 * Paces every request in one rate-limit bucket.
 *
 * @remarks
 * Requests are executed one at a time by default. Discord would permit the whole
 * allowance concurrently, so this leaves throughput on the table — but concurrent
 * requests observe each other's headers out of order, and reconstructing bucket state
 * from interleaved responses is where rate limiters get subtly wrong and start emitting
 * 429s. Serialising makes the state unambiguous, and per-bucket parallelism is available
 * anyway because separate channels and guilds occupy separate buckets.
 *
 * Bucket state lives in the registry, not here, so it is shared with any other route
 * Discord has revealed to use the same bucket and survives this handler being swept.
 */
export class SequentialHandler {
  /** The bucket this handler serialises. */
  readonly bucketKey: string

  readonly #context: HandlerContext
  readonly #queue = new AsyncQueue()

  /**
   * @param bucketKey - The key identifying this bucket.
   * @param context - Shared services.
   */
  constructor(bucketKey: string, context: HandlerContext) {
    this.bucketKey = bucketKey
    this.#context = context
  }

  /** Whether nobody holds or is waiting for this handler, so it can be swept. */
  get inactive(): boolean {
    return this.#queue.remaining === 0
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
    if (!identity.serialise) {
      // Interaction callbacks: no shared allowance to protect, and a three-second
      // deadline that a queue would blow through.
      return await this.#run(identity, method, send, signal)
    }

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
    const state = registry.getState(identity)
    let attempt = 0

    for (;;) {
      await this.#awaitAvailability(state, identity, method, signal)

      if (invalid.shouldStop()) {
        throw new Error(
          `Refusing to send: ${String(invalid.countIn())} invalid requests in the last ten ` +
            'minutes. Continuing risks a Cloudflare ban on this IP for every application ' +
            'sharing it. Fix the failing requests, or raise `invalidRequestThreshold` if ' +
            'this is expected.',
        )
      }

      // The ceiling is re-checked inside the global limiter too: a global block can land
      // between the prediction above and the wait below, and would otherwise stall for
      // its full duration regardless of `rateLimitTimeout`.
      await global.acquire(identity.exemptFromGlobal, signal, (delay, isGlobal) => {
        this.#assertWithinTimeout(delay, identity, method, isGlobal)
        this.#context.onRateLimit({
          bucket: this.bucketKey,
          timeToReset: delay,
          limit: state.limit,
          method,
          route: identity.route,
          global: isGlobal,
          afterRejection: false,
        })
      })

      // Spend the allowance before sending. Two routes sharing a bucket hash have
      // separate queues but one state object, so without this both would read the same
      // `remaining` and send concurrently into the same allowance.
      if (Number.isFinite(state.remaining)) state.remaining -= 1

      let response: Response
      try {
        response = await send()
      } catch (error) {
        // A transport failure never reached Discord, so it is exactly what `retries` is
        // for — but a caller-requested abort must propagate untouched.
        if (signal?.aborted === true || attempt >= options.retries) throw error
        attempt += 1
        await this.#backoff(attempt, signal)
        continue
      }

      invalid.register(response.status)
      this.#applyHeaders(response.headers, identity.route, state, registry)

      if (response.status === 429) {
        const retryAfter = this.#retryAfterFrom(response)
        const scope = response.headers.get('x-ratelimit-scope')
        const isGlobal = scope === 'global' || response.headers.get('x-ratelimit-global') === 'true'

        if (isGlobal) global.blockUntil(Date.now() + retryAfter)

        this.#context.onRateLimit({
          bucket: this.bucketKey,
          timeToReset: retryAfter,
          limit: state.limit,
          method,
          route: identity.route,
          global: isGlobal,
          afterRejection: true,
        })

        if (attempt >= options.retries) return response
        attempt += 1

        this.#assertWithinTimeout(retryAfter, identity, method, isGlobal)
        await discard(response)
        await sleep(retryAfter, undefined, signal ? { signal } : undefined)
        continue
      }

      if (RETRYABLE_STATUSES.has(response.status) && attempt < options.retries) {
        attempt += 1
        await discard(response)
        await this.#backoff(attempt, signal)
        continue
      }

      return response
    }
  }

  /**
   * Sleeps for an exponentially growing, jittered interval.
   *
   * @remarks
   * A fleet of shards retrying a Discord incident in lockstep is indistinguishable from
   * an attack, so the jitter is not decoration.
   */
  async #backoff(attempt: number, signal?: AbortSignal): Promise<void> {
    const base = 2 ** attempt * 500
    const jittered = base * (0.5 + Math.random() * 0.5)
    await sleep(jittered, undefined, signal ? { signal } : undefined)
  }

  /**
   * Waits until this bucket would admit a request.
   */
  async #awaitAvailability(
    state: BucketState,
    identity: RouteIdentity,
    method: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const now = Date.now()
    if (state.remaining > 0 || !Number.isFinite(state.resetAt)) return

    const delay = state.resetAt - now
    if (delay <= 0) {
      // The window has passed; assume a fresh allowance until a response says otherwise.
      state.remaining = Number.isFinite(state.limit) ? state.limit : 1
      return
    }

    this.#assertWithinTimeout(delay, identity, method, false)

    this.#context.onRateLimit({
      bucket: this.bucketKey,
      timeToReset: delay,
      limit: state.limit,
      method,
      route: identity.route,
      global: false,
      afterRejection: false,
    })

    await sleep(delay, undefined, signal ? { signal } : undefined)
    state.remaining = Number.isFinite(state.limit) ? state.limit : 1
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
  #applyHeaders(
    headers: Headers,
    route: string,
    state: BucketState,
    registry: BucketRegistry,
  ): void {
    const hash = headers.get('x-ratelimit-bucket')
    if (hash !== null) registry.setHash(route, hash)

    const limit = numericHeader(headers, 'x-ratelimit-limit')
    if (limit !== null) state.limit = limit

    const remaining = numericHeader(headers, 'x-ratelimit-remaining')
    if (remaining !== null) state.remaining = remaining

    // `reset-after` is relative, so it is immune to clock skew between this machine and
    // Discord's. `reset` is an absolute Unix time and is only a fallback.
    const resetAfter = numericHeader(headers, 'x-ratelimit-reset-after')
    if (resetAfter !== null) {
      state.resetAt = Date.now() + resetAfter * 1000
      return
    }
    const reset = numericHeader(headers, 'x-ratelimit-reset')
    if (reset !== null) state.resetAt = reset * 1000
  }

  /**
   * How long to wait after a 429, in milliseconds.
   */
  #retryAfterFrom(response: Response): number {
    // `x-ratelimit-reset-after` is the most precise, then the standard header. Both are
    // in seconds and may be fractional. Anything unparseable falls through.
    const precise = numericHeader(response.headers, 'x-ratelimit-reset-after')
    if (precise !== null) return precise * 1000

    const header = numericHeader(response.headers, 'retry-after')
    if (header !== null) return header * 1000

    return 1000
  }
}
