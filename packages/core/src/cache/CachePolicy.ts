/**
 * Per-scope cache policy, and its resolution into a total record.
 *
 * @remarks
 * ADR 4 fixes the shape — a maximum entry count, a TTL and a predicate filter, per type.
 * Everything here is the resolution of that into something the rest of the cache can rely
 * on without re-deciding defaults at each call site.
 */

/**
 * What a consumer may say about one scope.
 */
export interface CachePolicy<V> {
  /**
   * Maximum entries in this scope. Omit for unbounded.
   *
   * @remarks
   * Enforced by the adapter, because only the adapter knows its own eviction order.
   */
  max?: number
  /**
   * Milliseconds an entry survives its last write. Omit for no expiry.
   *
   * @remarks
   * Measured from the write, not the read: a value that is read constantly still expires,
   * because a cache entry going stale is a function of when the source last changed.
   */
  ttl?: number
  /**
   * Evaluated on every write; a value that fails is not stored.
   *
   * @remarks
   * Enforced above the adapter so that consumer code runs in exactly one place. An adapter
   * that forgot to call it would silently over-cache, which is the failure mode hardest to
   * notice — everything works, memory just grows.
   */
  filter?: (value: V, key: string) => boolean
}

/**
 * How a scope is configured.
 *
 * @remarks
 * `false` disables it, `true` enables it with no limits, and an object is a policy.
 */
export type CacheOption<V> = boolean | CachePolicy<V>

/**
 * A policy with every field decided.
 *
 * @remarks
 * Total on purpose: no `undefined`, no optional fields, nothing left for a caller to
 * default a second time. `max` carries `Infinity` and `ttl` carries `0` rather than being
 * absent, so the hot path compares numbers instead of testing for presence.
 */
export interface ResolvedCachePolicy<V> {
  /** Whether anything is stored at all. */
  enabled: boolean
  /** Maximum entries. `Infinity` when unbounded. */
  max: number
  /** Milliseconds an entry survives its last write. `0` when it never expires. */
  ttl: number
  /** The write predicate, or `undefined` when everything is stored. */
  filter: ((value: V, key: string) => boolean) | undefined
}

/**
 * Thrown when a cache policy cannot be honoured as written.
 *
 * @remarks
 * Construction-time rather than a silent correction. A cache that quietly degrades to
 * storing nothing because `max` was `-1` is a support ticket six months later, by which
 * time nobody connects the memory graph to the typo.
 */
export class CachePolicyError extends Error {
  /** The scope whose policy was rejected. */
  readonly scope: string

  /**
   * @param scope - The scope being configured.
   * @param message - What is wrong with it.
   */
  constructor(scope: string, message: string) {
    super(`Invalid cache policy for "${scope}": ${message}`)
    this.name = 'CachePolicyError'
    this.scope = scope
  }
}

function assertMax(scope: string, max: number): void {
  // `Infinity` is the canonical spelling of unbounded — `true` resolves to it, and both
  // `ResolvedCachePolicy.max` and `CacheScopeContext.max` document it as such. Rejecting it
  // here would make the same number a valid value in one interface and an error in another.
  if (max === Number.POSITIVE_INFINITY) return
  if (!Number.isFinite(max)) {
    throw new CachePolicyError(scope, `\`max\` must be a finite number, got ${String(max)}.`)
  }
  if (!Number.isInteger(max)) {
    throw new CachePolicyError(scope, `\`max\` must be a whole number, got ${String(max)}.`)
  }
  if (max < 0) {
    throw new CachePolicyError(scope, `\`max\` must not be negative, got ${String(max)}.`)
  }
}

function assertTtl(scope: string, ttl: number): void {
  if (!Number.isFinite(ttl)) {
    throw new CachePolicyError(scope, `\`ttl\` must be a finite number, got ${String(ttl)}.`)
  }
  if (ttl < 0) {
    throw new CachePolicyError(scope, `\`ttl\` must not be negative, got ${String(ttl)}.`)
  }
}

/**
 * Resolves one scope's option into a total policy.
 *
 * @param scope - The scope being configured, used only in error messages.
 * @param option - What the consumer asked for, or `undefined` to take the default.
 * @param fallback - The policy to use when `option` is `undefined`.
 * @returns The resolved policy.
 * @throws {@link CachePolicyError} when `max` or `ttl` cannot be honoured.
 *
 * @remarks
 * `{ max: 0 }` resolves to disabled rather than to an enabled cache that evicts everything
 * it stores. Two spellings of one intent must not produce two behaviours, and the
 * alternative reading — a cache that accepts every write and immediately drops it — is
 * strictly worse than not storing at all, because it still runs the filter and the codec.
 */
export function resolveCachePolicy<V>(
  scope: string,
  option: CacheOption<V> | undefined,
  fallback: CacheOption<V>,
): ResolvedCachePolicy<V> {
  const chosen = option ?? fallback

  if (chosen === false) {
    return { enabled: false, max: 0, ttl: 0, filter: undefined }
  }
  if (chosen === true) {
    return { enabled: true, max: Number.POSITIVE_INFINITY, ttl: 0, filter: undefined }
  }

  const max = chosen.max ?? Number.POSITIVE_INFINITY
  const ttl = chosen.ttl ?? 0

  if (chosen.max !== undefined) assertMax(scope, chosen.max)
  if (chosen.ttl !== undefined) assertTtl(scope, chosen.ttl)

  // A bound of zero is a disabled scope spelled differently.
  if (max === 0) {
    return { enabled: false, max: 0, ttl: 0, filter: undefined }
  }

  return { enabled: true, max, ttl, filter: chosen.filter }
}
