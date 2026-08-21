import type { CacheScope } from './CacheScopes.js'

/**
 * The storage contract a third party implements.
 *
 * @remarks
 * This is the published surface: ten members, one instance per scope. Everything
 * scope-specific — key derivation, the write filter, indexes, expiry arithmetic — lives
 * above it in `@vestra/core`, so an adapter sees opaque string keys and absolute
 * timestamps and cannot get the policy subtly wrong.
 *
 * A third-party adapter's obligations are three sentences: honour `max`, never return an
 * entry past its `expiresAt`, and drop expired entries when `sweep` is called.
 */

/**
 * Serialisation for adapters that leave the process.
 *
 * @remarks
 * Exists so an out-of-process adapter has something to call. The in-memory default never
 * calls it, which is why it is on the context rather than on the interface itself.
 */
export interface CacheCodec<V> {
  /** Turns a value into something transportable. */
  encode: (value: V) => string
  /** Reconstructs a value. */
  decode: (encoded: string) => V
}

/**
 * What an adapter is told about the scope it is storing.
 */
export interface CacheScopeContext<V> {
  /** Which entity type this instance stores. */
  readonly scope: CacheScope
  /** Maximum entries. `Infinity` when unbounded. */
  readonly max: number
  /** Serialisation for adapters that leave the process. Never called by the default. */
  readonly codec: CacheCodec<V>
  /**
   * Optional eager notification that an entry was dropped.
   *
   * @remarks
   * Optional because the secondary indexes above are correct without it — they verify
   * against the adapter on read. Implementing it makes them faster, not correct.
   */
  readonly onEvict?: (key: string, value: V) => void
}

/**
 * Builds one adapter per scope.
 *
 * @remarks
 * Per scope, not per cache. A consumer who wants Redis for members and memory for
 * everything else configures one scope, rather than implementing storage for all eleven.
 */
export type CacheAdapterFactory = <V>(context: CacheScopeContext<V>) => CacheAdapter<V>

/**
 * Storage for one scope.
 */
export interface CacheAdapter<V> {
  /** The value, or `undefined` if absent or expired. */
  get: (key: string) => V | undefined
  /**
   * Stores a value.
   *
   * @param key - The entry's key.
   * @param value - The value to store.
   * @param expiresAt - An absolute epoch millisecond, or `Infinity` for no expiry.
   *
   * @remarks
   * The absolute deadline is computed above and handed down, so the adapter never reads a
   * clock to decide policy. It also hands a Redis adapter something it can pass straight
   * to `PEXPIREAT`.
   */
  set: (key: string, value: V, expiresAt: number) => void
  /** Removes an entry. Returns whether one was there. */
  delete: (key: string) => boolean
  /** Whether a live, unexpired entry exists. Must agree with `get`. */
  has: (key: string) => boolean
  /** Drops everything. */
  clear: () => void
  /**
   * How many entries are stored.
   *
   * @remarks
   * The raw count, which **may include entries that have expired but not yet been swept**.
   * Making it exact costs an O(n) walk on what looks like a property access. `get` and
   * `has` both check expiry, so no expired entry is ever observable through them.
   */
  readonly size: number
  /** The keys, in the adapter's own order. */
  keys: () => IterableIterator<string>
  /** The values, in the adapter's own order. */
  values: () => IterableIterator<V>
  /** The entries, in the adapter's own order. */
  entries: () => IterableIterator<[key: string, value: V]>
  /**
   * Drops expired entries.
   *
   * @param now - The current epoch millisecond.
   * @returns How many entries were dropped.
   */
  sweep: (now: number) => number
}

/**
 * An asynchronous backing store, consulted only by explicit fetches.
 *
 * @remarks
 * The escape hatch for a remote cache. Every {@link CacheAdapter} method is synchronous,
 * because an async cache makes dispatch handling asynchronous and turns `message.guild`
 * into a promise — see `docs/design/phase-4-core.md` §4.10 for the full argument.
 *
 * That decision costs the memory-offloading case, and this recovers most of it: an adapter
 * may also implement this, and an explicit `fetch` consults the sync adapter, then this,
 * then REST. Property accessors never touch it, so `message.member` stays `undefined` when
 * the sync layer misses. That asymmetry is the honest price and must be documented
 * wherever a remote adapter is recommended.
 */
export interface AsyncCacheSource<V> {
  /** Loads a value from the remote store. */
  load: (key: string) => Promise<V | undefined>
  /** Optionally writes back, so the remote store stays warm. */
  store?: (key: string, value: V, expiresAt: number) => Promise<void>
}
