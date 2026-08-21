import assert from 'node:assert/strict'
import { it } from 'node:test'
import { CacheScope, type CacheAdapterFactory } from '@vestra/core'

/**
 * The obligations any `CacheAdapter` must meet, as a runnable suite.
 *
 * @remarks
 * ADR 4 promises that "a Redis or SQLite adapter is a third-party package implementing one
 * interface". This is what makes that a checkable claim rather than an aspiration: an
 * implementer imports this, passes their factory, and finds out.
 *
 * It tests only what the interface promises — honour `max`, never return an entry past its
 * `expiresAt`, drop expired entries on `sweep`. It deliberately does **not** test eviction
 * *order*: write-recency is the default adapter's choice, not the contract's, and an
 * adapter implementing true LRU is conforming. Anything asserted here becomes something
 * every future adapter must reproduce, so the bar for adding a case is that the interface
 * genuinely requires it.
 *
 * @example
 * ```ts
 * runCacheAdapterConformance('redis', (context) => new RedisCacheAdapter(context))
 * ```
 */

/** A clock the suite drives, so no case waits on real time. */
class TestClock {
  #time = 1_000_000
  readonly now = (): number => this.#time
  advance(ms: number): void {
    this.#time += ms
  }
}

/**
 * Runs the conformance suite against one adapter implementation.
 *
 * @param name - The adapter's name, used in test titles.
 * @param factory - Builds the adapter under test.
 */
export function runCacheAdapterConformance(name: string, factory: CacheAdapterFactory): void {
  const build = (
    max = Number.POSITIVE_INFINITY,
    clock = new TestClock(),
  ): ReturnType<typeof factory<string>> =>
    factory<string>({
      scope: CacheScope.Users,
      max,
      codec: { encode: (value) => value, decode: (encoded) => encoded },
      now: clock.now,
    })

  const NEVER = Number.POSITIVE_INFINITY

  it(`${name} CA1: stores and returns a value`, () => {
    const cache = build()
    cache.set('a', '1', NEVER)

    assert.equal(cache.get('a'), '1')
    assert.equal(cache.has('a'), true)
    assert.equal(cache.size, 1)
  })

  it(`${name} CA2: reports a missing key as absent rather than throwing`, () => {
    const cache = build()
    assert.equal(cache.get('nope'), undefined)
    assert.equal(cache.has('nope'), false)
    assert.equal(cache.delete('nope'), false)
  })

  it(`${name} CA3: overwrites rather than duplicating`, () => {
    const cache = build()
    cache.set('a', '1', NEVER)
    cache.set('a', '2', NEVER)

    assert.equal(cache.get('a'), '2')
    assert.equal(cache.size, 1)
  })

  it(`${name} CA4: honours max`, () => {
    // The bound must hold after every write, not merely on average. An adapter that lets
    // the count drift above it and trims later has a memory profile nobody configured.
    const cache = build(3)
    for (const key of ['a', 'b', 'c', 'd', 'e']) cache.set(key, key, NEVER)

    assert.equal(cache.size, 3, 'the bound must never be exceeded')
  })

  it(`${name} CA5: never returns an entry past its expiresAt`, () => {
    const clock = new TestClock()
    const cache = build(Number.POSITIVE_INFINITY, clock)
    cache.set('a', '1', clock.now() + 1_000)

    assert.equal(cache.get('a'), '1', 'still live')
    clock.advance(1_001)
    assert.equal(cache.get('a'), undefined, 'expired')
    assert.equal(cache.has('a'), false, 'has must agree with get')
  })

  it(`${name} CA6: measures expiry against the supplied clock, not the wall clock`, () => {
    // The deadline arrives absolute and is compared against `context.now`. An adapter
    // reading `Date.now()` instead disagrees with whatever computed the deadline, and hides
    // every entry written under a clock that differs from the machine's.
    const clock = new TestClock()
    const cache = build(Number.POSITIVE_INFINITY, clock)
    cache.set('a', '1', clock.now() + 5_000)

    assert.equal(cache.get('a'), '1', 'a freshly written entry must be readable')
  })

  it(`${name} CA7: treats Infinity as never expiring`, () => {
    const clock = new TestClock()
    const cache = build(Number.POSITIVE_INFINITY, clock)
    cache.set('a', '1', NEVER)

    clock.advance(10_000_000)
    assert.equal(cache.get('a'), '1')
    assert.equal(cache.sweep(clock.now()), 0)
  })

  it(`${name} CA8: drops expired entries on sweep and reports how many`, () => {
    const clock = new TestClock()
    const cache = build(Number.POSITIVE_INFINITY, clock)
    cache.set('gone', '1', clock.now() + 1_000)
    cache.set('stays', '2', NEVER)

    clock.advance(1_001)
    assert.equal(cache.sweep(clock.now()), 1)
    assert.equal(cache.has('stays'), true)
  })

  it(`${name} CA9: never iterates an entry get would refuse`, () => {
    // The three iterators and `get` must agree. A caller that iterates keys, looks each one
    // up and receives `undefined` has been handed something that does not exist.
    const clock = new TestClock()
    const cache = build(Number.POSITIVE_INFINITY, clock)
    cache.set('dead', '1', clock.now() + 1_000)
    cache.set('live', '2', NEVER)
    clock.advance(1_001)

    assert.deepEqual([...cache.keys()], ['live'])
    assert.deepEqual([...cache.values()], ['2'])
    assert.deepEqual([...cache.entries()], [['live', '2']])
  })

  it(`${name} CA10: clears everything`, () => {
    const cache = build()
    cache.set('a', '1', NEVER)
    cache.set('b', '2', NEVER)
    cache.clear()

    assert.equal(cache.size, 0)
    assert.equal(cache.get('a'), undefined)
    assert.deepEqual([...cache.keys()], [])
  })

  it(`${name} CA11: reports eviction when it implements onEvict`, () => {
    // Optional to implement. But an adapter that implements it must fire it for every way
    // an entry leaves — including lazy expiry on read, which is the only path where an
    // entry disappears with nothing above the adapter being called.
    const clock = new TestClock()
    const evicted: string[] = []
    const cache = factory<string>({
      scope: CacheScope.Users,
      max: Number.POSITIVE_INFINITY,
      codec: { encode: (value) => value, decode: (encoded) => encoded },
      now: clock.now,
      onEvict: (key) => evicted.push(key),
    })

    cache.set('a', '1', clock.now() + 1_000)
    clock.advance(1_001)
    cache.get('a')

    assert.deepEqual(evicted, ['a'], 'lazy expiry must be reported like any other drop')
  })
}
