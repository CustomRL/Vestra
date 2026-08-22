import type { CacheAdapter, CacheScopeContext } from './CacheAdapter.js'

/**
 * The default in-process adapter.
 *
 * @remarks
 * Two maps rather than one map of records. A single `Map<string, { value, expiresAt }>`
 * reads more tidily and allocates a wrapper object per entry on the **default**
 * configuration, where no scope has a TTL and the wrapper is pure overhead. The two-map
 * form makes the common path one hash lookup and no allocation, and pays for it with two
 * lookups on scopes that do expire, plus an invariant — the expiry map holds exactly the
 * keys the value map holds — that has to be tested rather than made impossible. Every
 * mutation touching both maps lives in this one class, so that is a property test rather
 * than an architectural risk. The allocation argument itself is unmeasured; see
 * `docs/design/phase-4-core.md` §8-D3.
 *
 * **Eviction order is write-recency: insertion order, refreshed on write, never on read.**
 * A JS `Map` iterates in insertion order, so the oldest write is the first key and eviction
 * is O(1) with no side list. Re-setting an existing key does not move it, so `set` deletes
 * before inserting — without that, an entry rewritten on every message still ages out on
 * its original insertion, which is backwards for a bounded cache. True LRU with read
 * promotion was rejected: it puts a delete-and-reinsert on the read path, which is the
 * hotter of the two, and makes iteration order change under a read.
 *
 * `Map.prototype.delete` is used deliberately. CONTRIBUTING.md's "never `delete`" rule is
 * about `delete obj.prop` deoptimising an object's shape, and it names `Map` as the
 * alternative.
 */
export class MemoryCacheAdapter<V> implements CacheAdapter<V> {
  readonly #max: number
  readonly #onEvict: ((key: string, value: V) => void) | undefined
  readonly #now: () => number
  readonly #values = new Map<string, V>()

  /**
   * Absolute deadlines, or `undefined` when the scope never expires.
   *
   * @remarks
   * Constructed lazily on the first expiring write, so a scope with no TTL never allocates
   * it at all.
   */
  #expiry: Map<string, number> | undefined

  /**
   * @param context - What this instance is storing, and under what bound.
   */
  constructor(context: CacheScopeContext<V>) {
    this.#max = context.max
    this.#onEvict = context.onEvict
    this.#now = context.now
  }

  /** How many entries are stored, including any expired but not yet swept. */
  get size(): number {
    return this.#values.size
  }

  /**
   * The value, or `undefined` if absent or expired.
   *
   * @param key - The entry's key.
   * @returns The value.
   *
   * @remarks
   * Expiry is checked here as well as in the sweep, and an expired entry found on read is
   * dropped on the spot. Without that, an entry could be served for a whole sweep interval
   * past its deadline, which would make `ttl` a lie.
   */
  get(key: string): V | undefined {
    if (this.#hasExpired(key)) {
      this.#evict(key)
      return undefined
    }
    return this.#values.get(key)
  }

  /**
   * Whether a live entry exists.
   *
   * @param key - The entry's key.
   * @returns Whether it is present and unexpired.
   */
  has(key: string): boolean {
    if (this.#hasExpired(key)) {
      this.#evict(key)
      return false
    }
    return this.#values.has(key)
  }

  /**
   * Stores a value, evicting the oldest writes if the bound is exceeded.
   *
   * @param key - The entry's key.
   * @param value - The value to store.
   * @param expiresAt - An absolute epoch millisecond, or `Infinity` for no expiry.
   */
  set(key: string, value: V, expiresAt: number): void {
    // Unconditional, so a rewritten key moves to the tail and ages from its latest write.
    this.#values.delete(key)
    this.#values.set(key, value)

    if (expiresAt === Number.POSITIVE_INFINITY) {
      this.#expiry?.delete(key)
    } else {
      this.#expiry ??= new Map()
      this.#expiry.delete(key)
      this.#expiry.set(key, expiresAt)
    }

    // On write rather than on a timer, so the bound is never exceeded even transiently.
    while (this.#values.size > this.#max) {
      const oldest = this.#values.keys().next()
      if (oldest.done === true) break
      this.#evict(oldest.value)
    }
  }

  /**
   * Removes an entry.
   *
   * @param key - The entry's key.
   * @returns Whether one was there.
   */
  delete(key: string): boolean {
    this.#expiry?.delete(key)
    return this.#values.delete(key)
  }

  /** Drops everything. */
  clear(): void {
    this.#values.clear()
    this.#expiry?.clear()
  }

  /**
   * The keys, oldest write first, skipping anything expired.
   *
   * @remarks
   * Generators rather than the raw `Map` iterators, because handing back a key that `get`
   * would refuse breaks the contract this adapter publishes — "never return an entry past
   * its `expiresAt`" — and produces the worst kind of bug above: a caller iterates keys,
   * looks each one up, and gets `undefined` for something it was just told exists.
   *
   * The cost is one comparison per item on iteration. Unlike the read path, iteration is
   * already O(n), so a per-item check does not change its order.
   *
   * Expired entries are skipped rather than dropped here. Deleting during iteration of the
   * same map is legal, but the sweep is where removal belongs, and a read-shaped method
   * that quietly mutates is a surprise.
   */
  *keys(): IterableIterator<string> {
    for (const key of this.#values.keys()) {
      if (!this.#hasExpired(key)) yield key
    }
  }

  /** The values, oldest write first, skipping anything expired. */
  *values(): IterableIterator<V> {
    for (const [key, value] of this.#values) {
      if (!this.#hasExpired(key)) yield value
    }
  }

  /** The entries, oldest write first, skipping anything expired. */
  *entries(): IterableIterator<[key: string, value: V]> {
    for (const entry of this.#values) {
      if (!this.#hasExpired(entry[0])) yield entry
    }
  }

  /**
   * Drops expired entries.
   *
   * @param now - The current epoch millisecond.
   * @returns How many entries were dropped.
   *
   * @remarks
   * O(expired), not O(n). TTL is per scope rather than per entry, and `set` moves each key
   * to the tail, so insertion order is also ascending deadline order — the walk can stop at
   * the first entry that is still live.
   *
   * That shortcut is a property of *this* adapter and of a uniform TTL. An adapter offering
   * per-entry TTLs must walk everything, and would break silently here.
   */
  sweep(now: number): number {
    const expiry = this.#expiry
    if (expiry === undefined) return 0

    let dropped = 0
    for (const [key, expiresAt] of expiry) {
      if (expiresAt > now) break
      this.#evict(key)
      dropped += 1
    }
    return dropped
  }

  #hasExpired(key: string): boolean {
    const expiresAt = this.#expiry?.get(key)
    // The store's clock, not the environment's. A store driving a test clock and an adapter
    // reading `Date.now()` disagree by however far the two have drifted, which makes every
    // entry the store just wrote look long expired.
    return expiresAt !== undefined && expiresAt <= this.#now()
  }

  #drop(key: string): void {
    this.#values.delete(key)
    this.#expiry?.delete(key)
  }

  #evict(key: string): void {
    const value = this.#values.get(key)
    this.#drop(key)
    if (value !== undefined) this.#onEvict?.(key, value)
  }
}
