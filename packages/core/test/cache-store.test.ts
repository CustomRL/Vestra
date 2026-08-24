import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CacheScope,
  CacheStore,
  guildUserKey,
  parseGuildUserKey,
  resolveCachePolicy,
  type CachePolicy,
} from '@vestra/core'

interface Entry {
  id: string
  guildId?: string
  status?: string
}

/** A clock the test drives, so expiry does not need real waiting. */
class Clock {
  #time = 1_000_000
  readonly now = (): number => this.#time
  advance(ms: number): void {
    this.#time += ms
  }
}

function store(
  option: boolean | CachePolicy<Entry> = true,
  options: { grouped?: boolean; clock?: Clock } = {},
): CacheStore<Entry> {
  const policy = resolveCachePolicy<Entry>('messages', option, true)
  const clock = options.clock ?? new Clock()

  return new CacheStore<Entry>({
    scope: CacheScope.Messages,
    policy,
    keyOf: (entry) => entry.id,
    now: clock.now,
    ...(options.grouped === true ? { groupKeyOf: (entry: Entry) => entry.guildId } : {}),
  })
}

describe('cache keys', () => {
  it('CK1: composes and splits a guild-user key', () => {
    const key = guildUserKey('123', '456')
    assert.equal(key, '123:456')
    assert.deepEqual(parseGuildUserKey(key), { guildId: '123', userId: '456' })
  })

  it('CK2: reports a non-composite key rather than guessing', () => {
    assert.equal(parseGuildUserKey('123'), undefined)
  })

  it('CK3: cannot collide, because snowflakes are digit strings', () => {
    // `:` is only safe as a separator because no component can contain one.
    assert.notEqual(guildUserKey('1', '23'), guildUserKey('12', '3'))
  })
})

describe('cache store', () => {
  it('CS1: returns the value from add whether or not it was stored', () => {
    // The property the canonical handler shape depends on. It must keep working under
    // `messages: false`, which is the default, or every handler needs two shapes.
    const enabled = store(true)
    const disabled = store(false)
    const entry: Entry = { id: 'a' }

    assert.equal(enabled.add(entry), entry)
    assert.equal(disabled.add(entry), entry, 'a disabled scope still returns the value')
    assert.equal(enabled.has('a'), true)
    assert.equal(disabled.has('a'), false)
  })

  it('CS2: derives the key from the value', () => {
    const cache = store()
    cache.add({ id: 'abc' })
    assert.equal(cache.get('abc')?.id, 'abc')
  })

  it('CS3: applies the filter on write', () => {
    const cache = store({ filter: (entry) => entry.status !== 'offline' })
    cache.add({ id: 'a', status: 'online' })
    cache.add({ id: 'b', status: 'offline' })

    assert.equal(cache.has('a'), true)
    assert.equal(cache.has('b'), false)
  })

  it('CS4: deletes an existing entry when a write fails the filter', () => {
    // The rule most easily got wrong, and getting it wrong is worse than not filtering:
    // a cached presence would insist someone is online forever after they go offline.
    const cache = store({ filter: (entry) => entry.status !== 'offline' })
    cache.add({ id: 'a', status: 'online' })
    assert.equal(cache.has('a'), true)

    cache.add({ id: 'a', status: 'offline' })
    assert.equal(cache.has('a'), false, 'going offline must evict, not be ignored')
  })

  it('CS5: never consults the filter on read', () => {
    let calls = 0
    const cache = store({
      filter: (entry) => {
        calls += 1
        return entry.status !== 'offline'
      },
    })
    cache.add({ id: 'a', status: 'online' })
    const afterWrite = calls

    cache.get('a')
    cache.has('a')
    assert.equal(calls, afterWrite, 'reads must not depend on user code')
  })

  it('CS6: computes expiry from the policy TTL', () => {
    const clock = new Clock()
    const cache = store({ ttl: 5_000 }, { clock })
    cache.add({ id: 'a' })

    // Readable the instant it is written. Without this the suite passed while every TTL'd
    // entry was invisible from the moment it was stored, because the adapter compared the
    // store's deadline against the real clock rather than the injected one.
    assert.equal(cache.get('a')?.id, 'a', 'a fresh entry must be readable')
    assert.equal(cache.has('a'), true)

    clock.advance(4_999)
    assert.equal(cache.sweep(), 0, 'not due yet')

    clock.advance(2)
    assert.equal(cache.sweep(), 1)
    assert.equal(cache.has('a'), false)
  })

  it('CS7: stores without expiry when the policy has no TTL', () => {
    const clock = new Clock()
    const cache = store(true, { clock })
    cache.add({ id: 'a' })

    clock.advance(10_000_000)
    assert.equal(cache.sweep(), 0)
    assert.equal(cache.has('a'), true)
  })

  it('CS8: groups entries by their group key', () => {
    const cache = store(true, { grouped: true })
    cache.add({ id: 'a', guildId: 'g1' })
    cache.add({ id: 'b', guildId: 'g1' })
    cache.add({ id: 'c', guildId: 'g2' })

    assert.deepEqual(
      cache
        .group('g1')
        .map((entry) => entry.id)
        .sort(),
      ['a', 'b'],
    )
    assert.deepEqual(
      cache.group('g2').map((entry) => entry.id),
      ['c'],
    )
    assert.deepEqual(cache.group('g3'), [], 'an unknown group is empty, not an error')
  })

  it('CS9: prunes the index when the adapter evicted behind its back', () => {
    // The failure this design is most exposed to: an index filling with keys to entries
    // that no longer exist, which reads as a leak in the cache and is a leak in the index.
    const cache = store({ max: 2 }, { grouped: true })
    cache.add({ id: 'a', guildId: 'g1' })
    cache.add({ id: 'b', guildId: 'g1' })
    cache.add({ id: 'c', guildId: 'g1' })

    // `a` was evicted by the bound; the index must not still offer it.
    assert.deepEqual(
      cache
        .group('g1')
        .map((entry) => entry.id)
        .sort(),
      ['b', 'c'],
    )
  })

  it('CS10: drops an entry from its group on delete', () => {
    // Asserted through the index rather than through `group()`. `group()` prunes anything
    // the adapter no longer holds, so it returns the right answer whether or not `delete`
    // touched the index — which is why the first version of this test could not fail.
    const cache = store(true, { grouped: true })
    const index = cache.index
    assert.ok(index !== undefined, 'a grouped scope must have an index')

    cache.add({ id: 'a', guildId: 'g1' })
    assert.equal(index.groupOf('a'), 'g1')

    cache.delete('a')
    assert.equal(index.groupOf('a'), undefined, 'the index must not still hold it')
    assert.deepEqual(cache.group('g1'), [])
  })

  it('CS14: moves an entry when its group key changes', () => {
    // Otherwise the entry stays listed under its old guild, and `guild.channels` hands back
    // a channel belonging to a different guild — for a live entry, forever.
    const cache = store(true, { grouped: true })
    cache.add({ id: 'a', guildId: 'g1' })
    cache.add({ id: 'a', guildId: 'g2' })

    assert.deepEqual(cache.group('g1'), [], 'the old group must not still list it')
    assert.deepEqual(
      cache.group('g2').map((entry) => entry.id),
      ['a'],
    )
  })

  it('CS15: prunes the index when an entry expires lazily', () => {
    // A TTL'd grouped scope otherwise accumulates index entries for every value that ever
    // expired, pruned only if somebody happens to read the group. A bot that never reads
    // `guild.members` would leak while the adapter stayed neatly bounded.
    const clock = new Clock()
    const cache = store({ ttl: 1_000 }, { grouped: true, clock })
    cache.add({ id: 'a', guildId: 'g1' })

    const index = cache.index
    assert.ok(index !== undefined)

    clock.advance(2_000)
    cache.get('a')
    assert.equal(index.groupOf('a'), undefined, 'expiry must reach the index')
  })

  it('CS11: returns nothing for a group on an ungrouped scope', () => {
    // Rather than silently full-scanning, which is a performance cliff nobody sees coming.
    const cache = store(true, { grouped: false })
    cache.add({ id: 'a', guildId: 'g1' })
    assert.deepEqual(cache.group('g1'), [])
  })

  it('CS12: reports whether it is storing anything at all', () => {
    assert.equal(store(true).enabled, true)
    assert.equal(store(false).enabled, false)
    assert.equal(store({ max: 0 }).enabled, false, 'max 0 is a disabled scope')
  })

  it('CS13: clears the index along with the entries', () => {
    const cache = store(true, { grouped: true })
    const index = cache.index
    assert.ok(index !== undefined)

    cache.add({ id: 'a', guildId: 'g1' })
    cache.clear()

    assert.equal(cache.size, 0)
    // Through the index directly, for the same reason as CS10.
    assert.equal(index.groupOf('a'), undefined)
    assert.deepEqual(cache.group('g1'), [])
  })
})
