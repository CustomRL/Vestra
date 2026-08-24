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
  /**
   * Which group each entry is currently in.
   *
   * @remarks
   * The reverse direction, and it earns its memory twice. It makes removal O(1) instead of
   * a walk over every group, which matters because eviction calls it; and it is the only
   * way to notice that an entry has *moved* — a channel that changes guild, a message
   * re-keyed — so the old group can be corrected rather than left holding a key that now
   * belongs somewhere else.
   */
  readonly #groupOf = new Map<string, string>()

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
    const previous = this.#groupOf.get(entryKey)
    if (previous === groupKey) return
    // Moved rather than added. Without this the entry stays listed under its old group and
    // `group(old)` hands back something that now belongs to another guild entirely.
    if (previous !== undefined) this.remove(previous, entryKey)

    const existing = this.#groups.get(groupKey)
    if (existing === undefined) {
      this.#groups.set(groupKey, new Set([entryKey]))
    } else {
      existing.add(entryKey)
    }
    this.#groupOf.set(entryKey, groupKey)
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
    if (this.#groupOf.get(entryKey) === groupKey) this.#groupOf.delete(entryKey)
  }

  /**
   * Removes an entry from whichever group holds it.
   *
   * @param entryKey - The entry.
   *
   * @remarks
   * O(1) via the reverse map, which matters because this is what eviction calls — once per
   * entry dropped by the bound, the sweep, or lazy expiry.
   */
  removeAnywhere(entryKey: string): void {
    const groupKey = this.#groupOf.get(entryKey)
    if (groupKey === undefined) return
    this.remove(groupKey, entryKey)
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
        this.#groupOf.delete(key)
      }
    }
    if (keys.size === 0) this.#groups.delete(groupKey)
    return live
  }

  /** Forgets a whole group. */
  clearGroup(groupKey: string): void {
    for (const entryKey of this.#groups.get(groupKey) ?? []) this.#groupOf.delete(entryKey)
    this.#groups.delete(groupKey)
  }

  /** Forgets everything. */
  clear(): void {
    this.#groups.clear()
    this.#groupOf.clear()
  }

  /** Which group an entry is indexed under, if any. Exposed for tests. */
  groupOf(entryKey: string): string | undefined {
    return this.#groupOf.get(entryKey)
  }
}
