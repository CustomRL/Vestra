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
}

/** Snowflakes as they appear in a path. */
const SNOWFLAKE = /\d{17,20}/g

/** The three parameters Discord scopes buckets by. */
const MAJOR_PARAMETER = /^\/(?:channels|guilds|webhooks)\/(\d{17,20})/

/** A webhook or interaction token, which is opaque and not a snowflake. */
const WEBHOOK_WITH_TOKEN = /^\/webhooks\/(\d{17,20})\/([^/?]+)/

/**
 * How long an unused bucket hash is kept before being swept.
 *
 * @remarks
 * A long-lived bot touches many routes across many channels. Without expiry the hash map
 * grows for the process lifetime — small per entry, unbounded in aggregate.
 */
const HASH_TTL = 86_400_000

/**
 * Maps routes to the bucket hashes Discord assigns them.
 *
 * @remarks
 * Rate limits are keyed by an opaque `x-ratelimit-bucket` hash, not by route: several
 * routes can share one bucket, and Discord may re-map them at any time. Until a route
 * has been seen once its hash is unknown, so requests are provisionally keyed by the
 * normalised route — pessimistic, and self-correcting on the first response.
 */
export class BucketRegistry {
  readonly #hashes = new Map<string, { hash: string; usedAt: number }>()

  /**
   * Derives the bucket-relevant identity of a request.
   *
   * @param method - The HTTP method.
   * @param path - The request path, with or without a query string.
   * @returns The normalised route, its major parameter, and its global-limit exemption.
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

    return {
      route: `${method}:${route}`,
      majorParameter,
      // Interaction callbacks do not count against the global limit, so a bot under load
      // can still respond to interactions while its other traffic is throttled.
      exemptFromGlobal: pathname.startsWith('/interactions/'),
    }
  }

  /**
   * The key of the queue a request should wait in.
   *
   * @param identity - The request's route identity.
   * @returns A bucket key, provisional until Discord has assigned the route a hash.
   */
  getBucketKey(identity: RouteIdentity): string {
    const known = this.#hashes.get(identity.route)
    if (known !== undefined) {
      known.usedAt = Date.now()
      return `${known.hash}:${identity.majorParameter}`
    }
    return `provisional:${identity.route}:${identity.majorParameter}`
  }

  /**
   * Records the bucket hash Discord returned for a route.
   *
   * @param route - The normalised route.
   * @param hash - The value of the `x-ratelimit-bucket` header.
   */
  setHash(route: string, hash: string): void {
    this.#hashes.set(route, { hash, usedAt: Date.now() })
  }

  /**
   * Drops hashes for routes that have not been used recently.
   *
   * @param now - The current time, injectable so the sweep is testable.
   * @returns How many entries were removed.
   */
  sweep(now = Date.now()): number {
    let removed = 0
    for (const [route, entry] of this.#hashes) {
      if (now - entry.usedAt > HASH_TTL) {
        this.#hashes.delete(route)
        removed += 1
      }
    }
    return removed
  }

  /** How many route-to-hash mappings are held. */
  get size(): number {
    return this.#hashes.size
  }
}
