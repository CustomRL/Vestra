import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Client, REST, SystemTimers } from '@vestra/core'
import { GatewayIntentBits } from '@vestra/types'
import { scriptedClient } from './scripted-client.ts'

/**
 * Where a client option ends up.
 *
 * @remarks
 * §4.2 hoists four options to the top level — `token`, `intents`, `userAgent`, `timers` — on
 * one argument: each is needed by more than one subsystem, so leaving it nested means a user
 * who sets it once has set it for half their traffic. That is a claim about wiring, and wiring
 * is exactly what nothing had checked: `userAgent` was reaching the shards and not the REST
 * client, which is the failure the hoisting exists to prevent, on a header Discord requires.
 *
 * Every case here is one option and where it must arrive. None of them is clever, and that is
 * the point — a fan-out that quietly drops one destination fails nothing else.
 */

const TOKEN = 'not.a.real.token'

/** A client that never connects, for reading resolved configuration off. */
function client(options: Record<string, unknown> = {}): Client {
  return new Client({ token: TOKEN, intents: 0, ...options })
}

describe('client option fan-out', () => {
  it('O1: sends one userAgent to both REST and the gateway', async () => {
    // **The bug.** `userAgent` was passed to `ShardManager` and not to `REST`, so a bot that
    // identified itself correctly to the gateway sent Discord's default-hostile blank agent on
    // every HTTP request. Silent, because nothing fails until Discord decides to care.
    const agent = 'DiscordBot (https://example.invalid, 9.9.9)'
    const built = client({ userAgent: agent })
    try {
      assert.equal(built.rest.options.userAgent, agent, 'REST did not get the user agent')
      assert.equal(built.options.userAgent, agent)
    } finally {
      await built.destroy()
    }
  })

  it('O1b: lets a nested userAgent win, because it is the more specific statement', async () => {
    const built = client({ userAgent: 'client-level', rest: { userAgent: 'rest-level' } })
    try {
      assert.equal(built.rest.options.userAgent, 'rest-level')
      assert.equal(built.options.userAgent, 'client-level')
    } finally {
      await built.destroy()
    }
  })

  it('O2: uses one timers source for the gateway and for cache sweeps', async () => {
    // Not two knobs. A test that mocks time has to mock it once, or the sweeper keeps a real
    // timer alive while the gateway runs on a fake clock and the suite hangs on exit.
    //
    // Identified by its interval rather than by a count, because the gateway arms timers of
    // its own through the same seam and a bare count would pass on those alone.
    const SWEEP_MS = 45_678
    const intervals: number[] = []
    const timers = {
      ...SystemTimers,
      setTimeout: (callback: () => void, ms: number) => {
        intervals.push(ms)
        return SystemTimers.setTimeout(callback, ms)
      },
    }

    const { client: built } = await scriptedClient({
      // A TTL'd scope, because the sweeper deliberately arms nothing when no scope expires --
      // that is what makes the default configuration cost no timer at all.
      cache: { users: { ttl: 60_000 } },
      sweepInterval: SWEEP_MS,
      gateway: { timers },
    })
    try {
      assert.ok(
        intervals.includes(SWEEP_MS),
        `the sweeper did not use the injected timers; saw ${intervals.join(', ')}`,
      )
    } finally {
      await built.destroy()
    }
  })

  it('O2b: sweeps the REST rate-limit handlers on the client tick', async () => {
    // **The leak the rebuilt reachability guard found.** `REST.sweep()` drops handlers that
    // have gone idle, and its own TSDoc warns "the count is unbounded without this" -- but
    // nothing called it, in `src` or in any test, so a long-running client accumulated one
    // handler per route and major parameter for the life of the process.
    //
    // Driven through the real timer seam rather than by reconstructing a sweeper, because the
    // thing under test is the client's own wiring. The interval is distinctive so the sweep
    // callback can be told apart from the gateway's own timers.
    const SWEEP_MS = 45_678
    let tick: (() => void) | undefined
    const timers = {
      ...SystemTimers,
      setTimeout: (callback: () => void, ms: number) => {
        if (ms === SWEEP_MS) tick = callback
        return SystemTimers.setTimeout(callback, ms)
      },
    }

    const { client: built } = await scriptedClient({
      sweepInterval: SWEEP_MS,
      gateway: { timers },
    })

    let swept = 0
    const original = built.rest.sweep.bind(built.rest)
    built.rest.sweep = () => {
      swept += 1
      return original()
    }

    try {
      // The default cache has no TTL'd scope, so before this fix `needed` was false and the
      // timer was never armed at all -- which is the right answer for the cache and was the
      // wrong one for the rate-limit handlers meant to ride along with it.
      assert.ok(tick !== undefined, 'the client armed no sweep timer')

      tick()
      assert.equal(swept, 1, 'the client tick did not sweep the rate-limit handlers')
    } finally {
      await built.destroy()
    }
  })

  it('O3: folds an intents array to the same bit set as the bitwise form', async () => {
    const array = client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    })
    const bits = client({ intents: GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages })
    try {
      assert.equal(array.options.intents, bits.options.intents)
      assert.notEqual(array.options.intents, 0)
    } finally {
      await array.destroy()
      await bits.destroy()
    }
  })

  it('O4: hands the throttler and session store to the manager by identity', async () => {
    // By identity, not by value. These are what make a multi-process deployment correct — one
    // shared identify allowance across every process — and a client that copied them would
    // give each process its own, which is the failure they exist to prevent.
    const sessionStore = {
      load: () => Promise.resolve(undefined),
      save: () => Promise.resolve(undefined),
    }
    const throttler = { acquire: () => Promise.resolve(undefined) }
    const built = client({ gateway: { sessionStore, throttler } })
    try {
      assert.equal(built.options.gateway.sessionStore, sessionStore)
      assert.equal(built.options.gateway.throttler, throttler)
    } finally {
      await built.destroy()
    }
  })

  it('O5: uses a REST instance as-is and does not re-token it', async () => {
    // Sharing one REST across clients is the supported way to keep rate-limit buckets coherent.
    // Calling `setToken` on it would let the second client silently retoken the first.
    const shared = new REST({ userAgent: 'shared' }).setToken('someone.elses.token')
    const built = client({ rest: shared, userAgent: 'ignored-here' })
    try {
      assert.equal(built.rest, shared, 'the client built its own REST instead')
      assert.equal(built.rest.options.userAgent, 'shared', 'the client overwrote its options')
    } finally {
      await built.destroy()
    }
  })

  it('O6: defaults fetchGatewayBot to its own REST, and honours an override', async () => {
    const plain = client()
    try {
      assert.equal(plain.options.gateway.fetchGatewayBot, undefined, 'a default was baked in')
    } finally {
      await plain.destroy()
    }

    const fetchGatewayBot = (): Promise<never> => Promise.reject(new Error('not called'))
    const overridden = client({ gateway: { fetchGatewayBot } })
    try {
      assert.equal(overridden.options.gateway.fetchGatewayBot, fetchGatewayBot)
    } finally {
      await overridden.destroy()
    }
  })

  it('O8: treats an option explicitly set to undefined as absent', async () => {
    // `{ sweepInterval: undefined }` is what a caller's own optional config produces, and it
    // must mean "I did not set this" rather than "turn it off". The two differ: `null` disables
    // the sweeper entirely, and reading `undefined` as `null` would silently stop it.
    const built = client({ sweepInterval: undefined })
    try {
      assert.equal(built.options.sweepInterval, 60_000)
    } finally {
      await built.destroy()
    }

    const disabled = client({ sweepInterval: null })
    try {
      assert.equal(disabled.options.sweepInterval, null)
    } finally {
      await disabled.destroy()
    }
  })

  it('O9: warns rather than throwing when the two API versions disagree', async () => {
    // Legal, and almost never intended. It surfaces much later as a close code 4012 or a route
    // that does not exist, and neither of those mentions the other half of the configuration.
    const warnings: string[] = []
    const onWarning = (warning: Error): void => {
      if (warning.name === 'VestraVersionMismatch') warnings.push(warning.message)
    }
    process.on('warning', onWarning)

    const built = client({ rest: { version: '10' }, gateway: { version: '9' } })
    try {
      // `process.emitWarning` delivers on a later tick.
      await new Promise((resolve) => setTimeout(resolve, 20))
      assert.equal(warnings.length, 1, 'no mismatch warning was emitted')
      assert.match(warnings[0] ?? '', /v10 over REST and v9 over the gateway/)
    } finally {
      process.off('warning', onWarning)
      await built.destroy()
    }
  })

  it('O9b: stays quiet when the versions agree', async () => {
    const warnings: string[] = []
    const onWarning = (warning: Error): void => {
      if (warning.name === 'VestraVersionMismatch') warnings.push(warning.message)
    }
    process.on('warning', onWarning)

    const matched = client({ gateway: { version: '10' } })
    const defaulted = client()
    try {
      await new Promise((resolve) => setTimeout(resolve, 20))
      assert.deepEqual(warnings, [])
    } finally {
      process.off('warning', onWarning)
      await matched.destroy()
      await defaulted.destroy()
    }
  })
})
