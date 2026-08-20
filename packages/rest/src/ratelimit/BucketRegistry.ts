/**
 * Identifies the rate-limit bucket a request belongs to.
 */
export interface RouteIdentity {
  /** The normalised route, used to look up the bucket hash Discord assigned. */
  route: string
  /**
   * The value of the route's major parameter, or `'global'`.
   *
   * @remarks
   * Discord scopes a bucket by channel, guild or webhook: sending to channel A and
   * channel B draws on separate allowances even though the route is identical. Ignoring
   * this makes a bot needlessly slow; inventing it where it does not apply makes it
   * exceed the real limit.
   */
  majorParameter: string
  /** Whether the route is exempt from the global request limit. */
  exemptFromGlobal: boolean
  /**
   * Whether requests on this route must be executed one at a time.
   *
   * @remarks
   * False only for interaction callbacks. Every callback in a process shares one route
   * and has no major parameter, so serialising them funnels the entire application
   * through a single queue at one request per round trip. Discord gives an interaction
   * three seconds to be acknowledged, so under any real load that queue misses the
   * deadline and users see "This interaction failed". There is no shared allowance to
   * protect: an interaction token is single-use for its callback.
   */
  serialise: boolean
}

/**
 * The rate-limit state of one Discord bucket.
 *
 * @remarks
 * Held by the registry rather than by a handler so that it survives a route graduating
 * from its provisional key to its real bucket hash. Losing it at that moment means the
 * first `remaining: 0` a process ever sees for a route is discarded, and the next
 * request goes out immediately into an exhausted window.
 */
export interface BucketState {
  /** The bucket's total allowance, once a response has revealed it. */
  limit: number
  /** Requests left in the current window. */
  remaining: number
  /** When the window resets, as a millisecond timestamp. */
  resetAt: number
  /** When this state was last touched, for sweeping. */
  usedAt: number
}

/** Snowflakes as they appear in a path. */
const SNOWFLAKE = /\d{17,20}/g

/** The three parameters Discord scopes buckets by. */
const MAJOR_PARAMETER = /^\/(?:channels|guilds|webhooks)\/(\d{17,20})/

/** A webhook or interaction token, which is opaque and not a snowflake. */
const WEBHOOK_WITH_TOKEN = /^\/webhooks\/(\d{17,20})\/([^/?]+)/

/**
 * How long an unused bucket hash or state is kept before being swept.
 *
 * @remarks
 * A long-lived bot touches many routes across many channels. Without expiry these maps
 * grow for the process lifetime — small per entry, unbounded in aggregate.
 */
const ENTRY_TTL = 86_400_000

/**
 * Maps routes to the bucket hashes Discord assigns them, and owns each bucket's state.
 *
 * @remarks
 * Rate limits are keyed by an opaque `x-ratelimit-bucket` hash, not by route: several
 * routes can share one bucket, and Discord may re-map them at any time. Until a route
 * has been seen once its hash is unknown, so its state is held under a provisional key
 * and migrated — not discarded — the moment the real hash arrives.
 */
export class BucketRegistry {
  readonly #hashes = new Map<string, { hash: string; usedAt: number }>()
  readonly #states = new Map<string, BucketState>()

  /**
   * Derives the bucket-relevant identity of a request.
   *
   * @param method - The HTTP method.
   * @param path - The request path, with or without a query string.
   * @returns The normalised route, its major parameter, and its scheduling flags.
   */
  getIdentity(method: string, path: string): RouteIdentity {
    const pathname = path.split('?', 1)[0] ?? path

    let majorParameter = MAJOR_PARAMETER.exec(pathname)?.[1] ?? 'global'

    // A webhook's token is part of its major parameter: two webhooks on one channel have
    // independent allowances.
    const webhook = WEBHOOK_WITH_TOKEN.exec(pathname)
    if (webhook?.[1] !== undefined && webhook[2] !== undefined) {
      majorParameter = `${webhook[1]}:${webhook[2]}`
    }

    let route = pathname
      // Reaction emoji are arbitrary text, including unicode and custom `name:id` forms.
      .replace(/\/reactions\/[^/]+\/[^/]+/g, '/reactions/:emoji/:user')
      .replace(/\/reactions\/[^/]+/g, '/reactions/:emoji')
      .replace(SNOWFLAKE, ':id')
      // Tokens are opaque, so collapse them or every webhook becomes its own route.
      .replace(/^\/webhooks\/:id\/[^/]+/, '/webhooks/:id/:token')
      .replace(/^\/interactions\/:id\/[^/]+/, '/interactions/:id/:token')

    // Deleting a message carries a stricter, separate limit from every other operation
    // on the same route, and Discord does not express that in the bucket hash.
    if (method === 'DELETE' && route === '/channels/:id/messages/:id') {
      route = `${route}:delete`
    }

    const isInteraction = pathname.startsWith('/interactions/')

    return {
      route: `${method}:${route}`,
      majorParameter,
      // Interaction callbacks do not count against the global limit, so a bot under load
      // can still respond to interactions while its other traffic is throttled.
      exemptFromGlobal: isInteraction,
      serialise: !isInteraction,
    }
  }

  /**
   * The key of the queue a request should wait in.
   *
   * @param identity - The request's route identity.
   * @returns A stable key that never changes for a given route and major parameter.
   *
   * @remarks
   * Deliberately independent of the bucket hash. Keying a queue by the hash means the key
   * changes the moment Discord first reveals it, which silently routes later requests to
   * a fresh, empty handler while the original is still draining — two queues running one
   * Discord bucket concurrently. Bucket *state* is shared across routes via the hash
   * instead; see {@link getState}.
   */
  getHandlerKey(identity: RouteIdentity): string {
    return `${identity.route}:${identity.majorParameter}`
  }

  /**
   * The shared state of the bucket a request draws on.
   *
   * @param identity - The request's route identity.
   * @returns The state, created on first use. Two routes that Discord has revealed to
   *          share a bucket hash receive the same object.
   */
  getState(identity: RouteIdentity): BucketState {
    const key = this.#stateKey(identity)
    let state = this.#states.get(key)
    if (state === undefined) {
      state = {
        limit: Number.POSITIVE_INFINITY,
        remaining: 1,
        resetAt: 0,
        usedAt: Date.now(),
      }
      this.#states.set(key, state)
    } else {
      state.usedAt = Date.now()
    }
    return state
  }

  /**
   * Records the bucket hash Discord returned for a route, migrating its state.
   *
   * @param route - The normalised route.
   * @param hash - The value of the `x-ratelimit-bucket` header.
   *
   * @remarks
   * Migration is the point. Any state accumulated under the provisional key is merged
   * into the hash-keyed state rather than abandoned, taking the more restrictive value of
   * each field so a known-exhausted window is never optimistically forgotten.
   */
  setHash(route: string, hash: string): void {
    const existing = this.#hashes.get(route)
    if (existing?.hash === hash) {
      existing.usedAt = Date.now()
      return
    }

    this.#hashes.set(route, { hash, usedAt: Date.now() })

    const prefix = `pending:${route}:`
    for (const [key, pending] of this.#states) {
      if (!key.startsWith(prefix)) continue
      const major = key.slice(prefix.length)
      const target = `${hash}:${major}`

      const current = this.#states.get(target)
      if (current === undefined) {
        this.#states.set(target, pending)
      } else {
        current.limit = Math.min(current.limit, pending.limit)
        current.remaining = Math.min(current.remaining, pending.remaining)
        current.resetAt = Math.max(current.resetAt, pending.resetAt)
        current.usedAt = Date.now()
      }
      this.#states.delete(key)
    }
  }

  /**
   * Drops hashes and bucket states that have gone unused.
   *
   * @param now - The current time, injectable so the sweep is testable.
   * @returns How many entries were removed.
   */
  sweep(now = Date.now()): number {
    let removed = 0
    for (const [route, entry] of this.#hashes) {
      if (now - entry.usedAt > ENTRY_TTL) {
        this.#hashes.delete(route)
        removed += 1
      }
    }
    for (const [key, state] of this.#states) {
      if (now - state.usedAt > ENTRY_TTL) {
        this.#states.delete(key)
        removed += 1
      }
    }
    return removed
  }

  /** How many route-to-hash mappings are held. */
  get size(): number {
    return this.#hashes.size
  }

  /**
   * Where a route's state lives: under its hash once known, provisionally until then.
   */
  #stateKey(identity: RouteIdentity): string {
    const known = this.#hashes.get(identity.route)
    if (known !== undefined) {
      known.usedAt = Date.now()
      return `${known.hash}:${identity.majorParameter}`
    }
    return `pending:${identity.route}:${identity.majorParameter}`
  }
}
