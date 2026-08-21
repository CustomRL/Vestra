import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CachePolicyError,
  CacheScope,
  CacheScopes,
  MemoryCacheAdapter,
  NullCacheAdapter,
  resolveCachePolicy,
  type CacheAdapter,
  type CacheCodec,
} from '@vestra/core'

/** A codec the default adapter never calls, present only to satisfy the context. */
const codec: CacheCodec<string> = {
  encode: (value) => value,
  decode: (encoded) => encoded,
}

function memory(
  max = Number.POSITIVE_INFINITY,
  onEvict?: (key: string, value: string) => void,
  now: () => number = Date.now,
): MemoryCacheAdapter<string> {
  return new MemoryCacheAdapter<string>({
    scope: CacheScope.Users,
    max,
    codec,
    now,
    ...(onEvict === undefined ? {} : { onEvict }),
  })
}

const NEVER = Number.POSITIVE_INFINITY

describe('cache policy resolution', () => {
  it('CP1: resolves false to a disabled scope', () => {
    const policy = resolveCachePolicy<string>('users', false, true)
    assert.equal(policy.enabled, false)
  })

  it('CP2: resolves true to enabled and unbounded', () => {
    const policy = resolveCachePolicy<string>('users', true, false)
    assert.deepEqual(
      { enabled: policy.enabled, max: policy.max, ttl: policy.ttl },
      { enabled: true, max: Number.POSITIVE_INFINITY, ttl: 0 },
    )
  })

  it('CP3: treats max 0 as disabled rather than as evict-everything', () => {
    // Two spellings of one intent must not produce two behaviours. The alternative reading
    // is strictly worse: it still runs the filter and the codec, then drops the result.
    const policy = resolveCachePolicy<string>('messages', { max: 0 }, true)
    assert.equal(policy.enabled, false)
  })

  it('CP4: throws on a policy that cannot be honoured as written', () => {
    // Construction time, not a silent correction. A cache that quietly stores nothing
    // because `max` was -1 surfaces as a memory graph nobody connects to the typo.
    for (const bad of [{ max: -1 }, { max: 1.5 }, { ttl: -1 }]) {
      assert.throws(
        () => resolveCachePolicy<string>('members', bad, true),
        CachePolicyError,
        `expected ${JSON.stringify(bad)} to be rejected`,
      )
    }
  })

  it('CP5: falls back only when the consumer said nothing', () => {
    assert.equal(resolveCachePolicy<string>('users', undefined, false).enabled, false)
    assert.equal(resolveCachePolicy<string>('users', undefined, true).enabled, true)
    // An explicit false must beat an enabled default.
    assert.equal(resolveCachePolicy<string>('users', false, true).enabled, false)
  })

  it('CP6: carries the filter through untouched', () => {
    const filter = (value: string): boolean => value !== 'skip'
    const policy = resolveCachePolicy<string>('users', { filter }, true)
    assert.equal(policy.filter, filter, 'the filter must reach the store that enforces it')
  })

  it('CP7: names every scope exactly once', () => {
    assert.equal(new Set(CacheScopes).size, CacheScopes.length)
    assert.equal(CacheScopes.length, Object.keys(CacheScope).length)
  })
})

describe('memory cache adapter', () => {
  it('CE1: evicts the oldest write when the bound is exceeded', () => {
    const cache = memory(2)
    cache.set('a', '1', NEVER)
    cache.set('b', '2', NEVER)
    cache.set('c', '3', NEVER)

    assert.equal(cache.size, 2, 'the bound is never exceeded, even transiently')
    assert.equal(cache.has('a'), false, 'the oldest write goes')
    assert.deepEqual([...cache.keys()], ['b', 'c'])
  })

  it('CE2: refreshes recency on write but not on read', () => {
    const cache = memory(2)
    cache.set('a', '1', NEVER)
    cache.set('b', '2', NEVER)

    // A read must not promote: iteration order changing under a read is a nasty surprise
    // for anything iterating while it resolves.
    cache.get('a')
    cache.set('c', '3', NEVER)
    assert.equal(cache.has('a'), false, 'reading must not have saved `a`')

    // A write must promote, or an entry rewritten on every message still ages out on its
    // original insertion, which is backwards for a bounded cache.
    const rewritten = memory(2)
    rewritten.set('a', '1', NEVER)
    rewritten.set('b', '2', NEVER)
    rewritten.set('a', '1 again', NEVER)
    rewritten.set('c', '3', NEVER)
    assert.equal(rewritten.has('a'), true, 'rewriting must have saved `a`')
    assert.equal(rewritten.has('b'), false)
  })

  it('CE3: does not grow when an existing key is rewritten', () => {
    const cache = memory(2)
    cache.set('a', '1', NEVER)
    cache.set('a', '2', NEVER)
    assert.equal(cache.size, 1)
    assert.equal(cache.get('a'), '2')
  })

  it('CE4: hides an expired entry from get and has', () => {
    const cache = memory()
    cache.set('a', '1', Date.now() - 1)

    assert.equal(cache.get('a'), undefined)
    assert.equal(cache.has('a'), false)
    assert.equal(cache.size, 0, 'reading an expired entry drops it there and then')
  })

  it('CE5: sweeps only what has expired', () => {
    const cache = memory()
    const now = Date.now()
    cache.set('gone', '1', now - 1)
    cache.set('alive', '2', now + 60_000)

    assert.equal(cache.sweep(now), 1)
    assert.equal(cache.has('alive'), true)
    assert.equal(cache.size, 1)
  })

  it('CE6: stops the sweep at the first live entry', () => {
    // The sweep is O(expired), not O(n), because a uniform per-scope TTL plus
    // move-to-tail-on-write makes insertion order ascending deadline order. If that ever
    // stops holding, this is where it shows.
    // The fixture must put an expired entry AFTER a live one, or the assertion holds
    // whether the walk stops early or runs to the end — which is how the first version of
    // this test passed with `break` mutated to `continue`.
    const cache = memory()
    const now = Date.now()
    cache.set('a', '1', now - 2)
    cache.set('b', '2', now + 60_000)
    cache.set('c', '3', now - 1)

    assert.equal(cache.sweep(now), 1, 'the walk must stop at `b` and never reach `c`')
    assert.equal(cache.has('c'), false, '`c` is expired, so it must not be readable')
    assert.deepEqual([...cache.keys()], ['b'], 'only the live entry is iterable')
  })

  it('CE7: keeps the expiry map in step with the value map', () => {
    // The invariant the two-map layout buys its allocation savings with. Every mutation
    // touches both, so this is the property that has to hold rather than be impossible.
    // Unbounded on purpose: this isolates the expiry/value invariant. An earlier draft
    // used max 3 and then stored four live keys, so the bound evicted the entry the test
    // was asserting on and the failure looked like an expiry bug.
    const cache = memory()
    const now = Date.now()
    cache.set('a', '1', now + 1_000)
    cache.set('b', '2', NEVER)
    cache.set('a', '1 again', NEVER)
    cache.delete('b')
    cache.set('c', '3', now + 1_000)
    cache.set('d', '4', now + 1_000)
    cache.set('e', '5', now + 1_000)

    // Swept PAST the rewritten key's original deadline. Stopping short of it was why the
    // first version of this test passed even with the expiry-map cleanup removed.
    cache.sweep(now + 2_000)
    assert.equal(cache.has('a'), true, '`a` was rewritten as permanent and must survive')
    assert.equal(cache.has('c'), false, 'entries still holding a deadline must go')
  })

  it('CE8: reports eviction to the index when asked', () => {
    const evicted: string[] = []
    const cache = memory(1, (key) => evicted.push(key))
    cache.set('a', '1', NEVER)
    cache.set('b', '2', NEVER)

    assert.deepEqual(evicted, ['a'])
  })

  it('CE10: never yields through an iterator what get would refuse', () => {
    // The adapter publishes three obligations, and "never return an entry past its
    // expiresAt" is one of them. Raw Map iterators broke it: a caller iterating keys and
    // looking each one up got `undefined` for something it had just been told exists.
    const cache = memory()
    cache.set('dead', '1', Date.now() - 1)
    cache.set('live', '2', NEVER)

    assert.deepEqual([...cache.keys()], ['live'])
    assert.deepEqual([...cache.values()], ['2'])
    assert.deepEqual([...cache.entries()], [['live', '2']])
  })

  it('CE11: reports lazy expiry to the index, not just the bound and the sweep', () => {
    // Lazy expiry is the only path where an entry vanishes without anything above the
    // adapter being called, so it is the path an index most needs told about.
    const evicted: string[] = []
    const cache = memory(Number.POSITIVE_INFINITY, (key) => evicted.push(key))
    cache.set('a', '1', Date.now() - 1)

    cache.get('a')
    assert.deepEqual(evicted, ['a'])
  })

  it('CE9: clears both maps', () => {
    const cache = memory()
    cache.set('a', '1', Date.now() + 60_000)
    cache.clear()

    assert.equal(cache.size, 0)
    assert.equal(cache.sweep(Date.now() + 120_000), 0, 'no orphaned expiry entries')
  })
})

describe('null cache adapter', () => {
  it('CA1: is substitutable for a real adapter', () => {
    // A disabled scope is this, never `undefined`, so no handler branches on whether a
    // scope exists. Accepting and discarding writes is what makes that work; a version
    // that threw would force back exactly the branching this removes.
    const cache: CacheAdapter<string> = new NullCacheAdapter<string>()

    cache.set('a', '1', NEVER)
    assert.equal(cache.get('a'), undefined)
    assert.equal(cache.has('a'), false)
    assert.equal(cache.delete('a'), false)
    assert.equal(cache.size, 0)
    assert.equal(cache.sweep(Date.now()), 0)
    assert.deepEqual([...cache.keys()], [])
    assert.deepEqual([...cache.values()], [])
    assert.deepEqual([...cache.entries()], [])
    cache.clear()
  })
})
