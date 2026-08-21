import type { CacheAdapter } from './CacheAdapter.js'
import { CacheIndex } from './CacheIndex.js'
import type { ResolvedCachePolicy } from './CachePolicy.js'
import type { CacheScope } from './CacheScopes.js'

/**
 * The handler- and structure-facing cache API for one scope.
 *
 * @remarks
 * Everything scope-specific lives here rather than in the adapter: key derivation, the
 * write filter, expiry arithmetic, and the secondary index. That split is what keeps the
 * third-party surface at ten opaque methods, and it is why a third-party adapter cannot get
 * filtering subtly wrong — it never sees the filter.
 *
 * See `docs/design/phase-4-core.md` §4.12.
 */

/** How a store derives keys and groups from the values it holds. */
export interface CacheStoreOptions<V> {
  /** Which entity type this store holds. */
  scope: CacheScope
  /** The resolved policy. */
  policy: ResolvedCachePolicy<V>
  /** Where entries actually go. */
  adapter: CacheAdapter<V>
  /** Derives an entry's key from the value itself. */
  keyOf: (value: V) => string
  /**
   * Derives the group an entry belongs to, if the scope has one.
   *
   * @remarks
   * Omitted for scopes with no natural grouping — a user belongs to no single guild.
   */
  groupKeyOf?: (value: V) => string | undefined
  /** The clock, injectable so expiry can be tested without waiting. */
  now?: () => number
}

/**
 * Cached entries for one scope.
 */
export class CacheStore<V> {
  readonly #scope: CacheScope
  readonly #policy: ResolvedCachePolicy<V>
  readonly #adapter: CacheAdapter<V>
  readonly #keyOf: (value: V) => string
  readonly #groupKeyOf: ((value: V) => string | undefined) | undefined
  readonly #now: () => number
  readonly #index: CacheIndex | undefined

  /**
   * @param options - How this store derives keys, and where entries go.
   */
  constructor(options: CacheStoreOptions<V>) {
    this.#scope = options.scope
    this.#policy = options.policy
    this.#adapter = options.adapter
    this.#keyOf = options.keyOf
    this.#groupKeyOf = options.groupKeyOf
    this.#now = options.now ?? Date.now
    this.#index = options.groupKeyOf === undefined ? undefined : new CacheIndex()
  }

  /** Which entity type this store holds. */
  get scope(): CacheScope {
    return this.#scope
  }

  /** Whether anything is stored at all. */
  get enabled(): boolean {
    return this.#policy.enabled
  }

  /** How many entries are stored, including any expired but not yet swept. */
  get size(): number {
    return this.#adapter.size
  }

  /**
   * The value, or `undefined` if absent or expired.
   *
   * @param key - The entry's key.
   * @returns The value.
   *
   * @remarks
   * The filter is never consulted here. Doing so would double the cost of every read and
   * make reads depend on user code.
   */
  get(key: string): V | undefined {
    return this.#adapter.get(key)
  }

  /** Whether a live entry exists. */
  has(key: string): boolean {
    return this.#adapter.has(key)
  }

  /**
   * Stores a value under its own derived key.
   *
   * @param value - The value to store.
   * @returns The value it was given, **whether or not it was stored**.
   *
   * @remarks
   * Returning the argument rather than `V | undefined` is what lets one handler shape serve
   * every configuration. The canonical handler is
   *
   * ```ts
   * const message = client.cache.messages.add(new Message(data, client))
   * client.emit('messageCreate', message)
   * ```
   *
   * and that has to keep working under `messages: false`, which is the default. A
   * `V | undefined` return would force every handler to hold the object separately from the
   * cache call, for no gain.
   */
  add(value: V): V {
    return this.set(this.#keyOf(value), value)
  }

  /**
   * Stores a value under an explicit key.
   *
   * @param key - The key to store under.
   * @param value - The value to store.
   * @returns The value it was given, whether or not it was stored.
   *
   * @remarks
   * A value that fails the filter **deletes any existing entry for that key**. This is the
   * rule most easily got wrong, and getting it wrong is worse than not filtering at all:
   * `presences: { filter: (p) => p.status !== 'offline' }` must remove a user who goes
   * offline, not leave a cached presence insisting they are online forever.
   *
   * The filter is not guarded locally. It is user code on the dispatch path and is
   * contained where every other user callback is; an inconsistent local `try` would hide a
   * bug here and not two lines away.
   */
  set(key: string, value: V): V {
    if (!this.#policy.enabled) return value

    if (this.#policy.filter !== undefined && !this.#policy.filter(value, key)) {
      this.delete(key)
      return value
    }

    const ttl = this.#policy.ttl
    const expiresAt = ttl === 0 ? Number.POSITIVE_INFINITY : this.#now() + ttl
    this.#adapter.set(key, value, expiresAt)

    const groupKey = this.#groupKeyOf?.(value)
    if (groupKey !== undefined) this.#index?.add(groupKey, key)

    return value
  }

  /**
   * Removes an entry.
   *
   * @param key - The entry's key.
   * @returns Whether one was there.
   */
  delete(key: string): boolean {
    const existing = this.#adapter.get(key)
    const removed = this.#adapter.delete(key)

    if (existing !== undefined && this.#index !== undefined) {
      const groupKey = this.#groupKeyOf?.(existing)
      if (groupKey === undefined) {
        this.#index.removeAnywhere(key)
      } else {
        this.#index.remove(groupKey, key)
      }
    }
    return removed
  }

  /**
   * Every cached entry belonging to one group.
   *
   * @param groupKey - The group — a guild ID for members, a channel ID for messages.
   * @returns The values still present.
   *
   * @remarks
   * Index-backed, and verified against the adapter on the way out, because an adapter may
   * evict without reporting it. A scope with no group key returns nothing rather than
   * scanning: a full scan disguised as an index lookup is a performance cliff nobody sees
   * coming.
   */
  group(groupKey: string): V[] {
    if (this.#index === undefined) return []

    const keys = this.#index.entries(groupKey, (key) => this.#adapter.has(key))
    const values: V[] = []
    for (const key of keys) {
      const value = this.#adapter.get(key)
      if (value !== undefined) values.push(value)
    }
    return values
  }

  /** The keys, in the adapter's order. */
  keys(): IterableIterator<string> {
    return this.#adapter.keys()
  }

  /** The values, in the adapter's order. */
  values(): IterableIterator<V> {
    return this.#adapter.values()
  }

  /** The entries, in the adapter's order. */
  entries(): IterableIterator<[key: string, value: V]> {
    return this.#adapter.entries()
  }

  /** Drops everything, including the index. */
  clear(): void {
    this.#adapter.clear()
    this.#index?.clear()
  }

  /**
   * Drops expired entries.
   *
   * @param now - The current epoch millisecond, defaulting to the store's clock.
   * @returns How many entries were dropped.
   */
  sweep(now: number = this.#now()): number {
    return this.#adapter.sweep(now)
  }
}
