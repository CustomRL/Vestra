import type { CacheAdapter } from './CacheAdapter.js'

/**
 * The adapter a disabled scope gets.
 *
 * @remarks
 * A disabled scope is this, never `undefined`. That is the whole point: no handler ever
 * writes `if (client.cache.members)`, no accessor branches on whether a scope exists, and
 * turning a scope off changes what is stored rather than what the code looks like. One
 * virtual call that does nothing is cheaper than a branch in every caller, and far cheaper
 * than the bug where somebody forgets the branch.
 *
 * It accepts writes and discards them, which is what makes it substitutable. A version that
 * threw on `set` would force exactly the branching this exists to remove.
 */
export class NullCacheAdapter<V> implements CacheAdapter<V> {
  /** Always zero. */
  readonly size = 0

  /**
   * Always `undefined`.
   *
   * @returns Nothing, because nothing was stored.
   */
  get(): V | undefined {
    return undefined
  }

  /**
   * Discards the write.
   */
  set(): void {
    // Intentionally empty. See the class remarks: accepting and discarding is what makes
    // this substitutable for a real adapter.
  }

  /**
   * Always `false`.
   *
   * @returns `false`, because nothing was ever stored.
   */
  delete(): boolean {
    return false
  }

  /**
   * Always `false`.
   *
   * @returns `false`.
   */
  has(): boolean {
    return false
  }

  /** Does nothing. */
  clear(): void {
    // Intentionally empty.
  }

  /** An empty iterator. */
  *keys(): IterableIterator<string> {
    // Intentionally yields nothing.
  }

  /** An empty iterator. */
  *values(): IterableIterator<V> {
    // Intentionally yields nothing.
  }

  /** An empty iterator. */
  *entries(): IterableIterator<[key: string, value: V]> {
    // Intentionally yields nothing.
  }

  /**
   * Always zero.
   *
   * @returns `0`, because nothing is ever stored to expire.
   */
  sweep(): number {
    return 0
  }
}
