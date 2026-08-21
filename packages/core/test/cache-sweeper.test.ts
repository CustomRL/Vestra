import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Timers } from '@vestra/gateway'
import { CacheRegistry, CacheSweeper, Role } from '@vestra/core'

const client = { name: 'test-client' }

/** Timers the test drives, recording what was armed. */
class ManualTimers implements Timers {
  #time = 1_000_000
  #next = 1
  readonly pending = new Map<number, { at: number; callback: () => void }>()
  /** How many timers have ever been armed, so "no timer at all" is observable. */
  armed = 0

  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = this.#next++
    this.armed += 1
    this.pending.set(id, { at: this.#time + ms, callback })
    return id as unknown as ReturnType<typeof setTimeout>
  }

  clearTimeout(handle: ReturnType<typeof setTimeout>): void {
    this.pending.delete(handle as unknown as number)
  }

  now(): number {
    return this.#time
  }

  random(): number {
    return 0.5
  }

  advance(ms: number): void {
    const target = this.#time + ms
    for (;;) {
      const due = [...this.pending.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort(([, a], [, b]) => a.at - b.at)[0]
      if (due === undefined) break

      this.pending.delete(due[0])
      this.#time = due[1].at
      due[1].callback()
    }
    this.#time = target
  }
}

function role(id: string): Role<typeof client> {
  return new Role(
    {
      id,
      name: 'r',
      color: 0,
      colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
      hoist: false,
      position: 0,
      permissions: '0',
      managed: false,
      mentionable: false,
      flags: 0,
    },
    client,
  )
}

describe('cache sweeper', () => {
  it('CW1: arms no timer at all under the default configuration', () => {
    // The answer to "a timer per cache is expensive": no scope has a TTL by default, so the
    // common case pays nothing rather than paying a little.
    const timers = new ManualTimers()
    const cache = new CacheRegistry<typeof client>({ now: () => timers.now() })
    const sweeper = new CacheSweeper(cache.stores, timers)

    sweeper.start()

    assert.equal(sweeper.needed, false)
    assert.equal(sweeper.running, false)
    assert.equal(timers.armed, 0, 'nothing may be armed when nothing can expire')
  })

  it('CW2: arms a timer when a scope has a TTL', () => {
    const timers = new ManualTimers()
    const cache = new CacheRegistry<typeof client>({
      roles: { ttl: 1_000 },
      now: () => timers.now(),
    })
    const sweeper = new CacheSweeper(cache.stores, timers)

    sweeper.start()
    assert.equal(sweeper.needed, true)
    assert.equal(timers.armed, 1)
  })

  it('CW3: drops expired entries when the timer fires, and re-arms', () => {
    // `setTimeout` re-armed after the sweep rather than `setInterval`, so a sweep that runs
    // long delays the next one instead of stacking on itself.
    const timers = new ManualTimers()
    const cache = new CacheRegistry<typeof client>({
      roles: { ttl: 1_000 },
      now: () => timers.now(),
    })
    const sweeper = new CacheSweeper(cache.stores, timers, 5_000)

    cache.roles.add(role('1'))
    sweeper.start()

    timers.advance(5_000)
    assert.equal(cache.roles.size, 0, 'the entry expired and was swept')
    assert.equal(timers.armed, 2, 'the timer re-armed itself')
  })

  it('CW4: visits only the scopes that can expire', () => {
    // A scope with no TTL can never hold an expired entry, so walking it is pure cost —
    // filtered once at construction rather than tested on every tick.
    const timers = new ManualTimers()
    const cache = new CacheRegistry<typeof client>({
      roles: { ttl: 1_000 },
      users: true,
      now: () => timers.now(),
    })
    const sweeper = new CacheSweeper(cache.stores, timers)

    cache.roles.add(role('1'))
    cache.users.add({ id: 'u' } as never)

    timers.advance(2_000)
    assert.equal(sweeper.sweep(), 1, 'only the TTL scope contributes')
    assert.equal(cache.users.size, 1, 'the untimed scope is untouched')
  })

  it('CW5: never arms when the interval is null', () => {
    // For consumers driving `cache.sweep()` from their own scheduler. `REST.sweep()` sets
    // the precedent in this repository.
    const timers = new ManualTimers()
    const cache = new CacheRegistry<typeof client>({
      roles: { ttl: 1_000 },
      now: () => timers.now(),
    })
    const sweeper = new CacheSweeper(cache.stores, timers, null)

    sweeper.start()
    assert.equal(timers.armed, 0)
    assert.equal(sweeper.needed, false)

    // Manual sweeping still works.
    cache.roles.add(role('1'))
    timers.advance(2_000)
    assert.equal(sweeper.sweep(), 1)
  })

  it('CW6: stops idempotently', () => {
    // `destroy()` may run twice, and a client that throws on a second shutdown is worse
    // than one that shrugs.
    const timers = new ManualTimers()
    const cache = new CacheRegistry<typeof client>({
      roles: { ttl: 1_000 },
      now: () => timers.now(),
    })
    const sweeper = new CacheSweeper(cache.stores, timers)

    sweeper.start()
    sweeper.stop()
    assert.doesNotThrow(() => {
      sweeper.stop()
    })
    assert.equal(sweeper.running, false)
    assert.equal(timers.pending.size, 0, 'the timer must not outlive the sweeper')
  })

  it('CW7: does not arm twice when started twice', () => {
    const timers = new ManualTimers()
    const cache = new CacheRegistry<typeof client>({
      roles: { ttl: 1_000 },
      now: () => timers.now(),
    })
    const sweeper = new CacheSweeper(cache.stores, timers)

    sweeper.start()
    sweeper.start()
    assert.equal(timers.armed, 1)
  })
})
