/**
 * A secondary index from a group to the entries in it.
 *
 * @remarks
 * What makes `guild.channels`, `guild.members` and `channel.messages` possible without
 * scanning every entry in the scope. The index maps a group key — a guild ID, a channel ID
 * — to the set of entry keys belonging to it.
 *
 * **The index is a hint, not a source of truth.** An adapter may evict an entry whenever it
 * likes, and a third-party adapter is not obliged to say so: `onEvict` is optional
 * precisely because requiring it would make the contract harder to implement correctly than
 * to implement at all. So every read verifies against the adapter and drops what has gone.
 * Implementing `onEvict` makes the index smaller and the reads cheaper; it does not make
 * them correct, because they already are.
 *
 * That verification is what stops the failure this design is most exposed to: an index that
 * slowly fills with keys to entries that no longer exist, which looks like a memory leak in
 * the cache and is actually a leak in the thing indexing it.
 */
export class CacheIndex {
  readonly #groups = new Map<string, Set<string>>()

  /** How many groups are indexed. */
  get size(): number {
    return this.#groups.size
  }

  /**
   * Records that an entry belongs to a group.
   *
   * @param groupKey - The group.
   * @param entryKey - The entry.
   */
  add(groupKey: string, entryKey: string): void {
    const existing = this.#groups.get(groupKey)
    if (existing === undefined) {
      this.#groups.set(groupKey, new Set([entryKey]))
      return
    }
    existing.add(entryKey)
  }

  /**
   * Removes an entry from a group.
   *
   * @param groupKey - The group.
   * @param entryKey - The entry.
   *
   * @remarks
   * An emptied group is removed outright. Leaving empty sets behind would make the index
   * grow with every guild the bot has ever seen rather than with every guild it currently
   * caches anything for.
   */
  remove(groupKey: string, entryKey: string): void {
    const existing = this.#groups.get(groupKey)
    if (existing === undefined) return

    existing.delete(entryKey)
    if (existing.size === 0) this.#groups.delete(groupKey)
  }

  /**
   * Removes an entry from whichever group holds it.
   *
   * @param entryKey - The entry.
   *
   * @remarks
   * O(groups). Used only when an entry is dropped without its group being known — an
   * eviction reported by an adapter that does not track groups. The caller that knows the
   * group should use {@link remove} instead.
   */
  removeAnywhere(entryKey: string): void {
    for (const [groupKey, entries] of this.#groups) {
      if (!entries.delete(entryKey)) continue
      if (entries.size === 0) this.#groups.delete(groupKey)
    }
  }

  /**
   * The entry keys in a group, verified against a live check.
   *
   * @param groupKey - The group.
   * @param exists - Whether an entry is still present.
   * @returns The keys that are still there.
   *
   * @remarks
   * Prunes as it goes, so a group whose entries have been evicted shrinks on the next read
   * rather than growing forever.
   */
  entries(groupKey: string, exists: (entryKey: string) => boolean): string[] {
    const keys = this.#groups.get(groupKey)
    if (keys === undefined) return []

    const live: string[] = []
    for (const key of keys) {
      if (exists(key)) {
        live.push(key)
      } else {
        keys.delete(key)
      }
    }
    if (keys.size === 0) this.#groups.delete(groupKey)
    return live
  }

  /** Forgets a whole group. */
  clearGroup(groupKey: string): void {
    this.#groups.delete(groupKey)
  }

  /** Forgets everything. */
  clear(): void {
    this.#groups.clear()
  }
}
