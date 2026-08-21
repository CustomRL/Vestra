import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CompressionMode,
  GuildReadyTracker,
  LocalIdentifyThrottler,
  MAX_PAYLOAD_BYTES,
  PayloadTooLargeError,
  SendQueue,
  SendTimeoutError,
  SessionLimitError,
  ShardManager,
  receivesGuildlessEvents,
  shardIdForGuild,
  type Timers,
} from '@vestra/gateway'
import { GatewayOpcodes } from '@vestra/types'
import { MockTransportFleet } from './mock-transport.ts'

/** Lets queued microtasks and timers settle. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

/** Timers whose clock the test controls. */
class ManualTimers implements Timers {
  #time = 0
  #next = 1
  readonly #pending = new Map<number, { at: number; callback: () => void }>()

  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = this.#next++
    this.#pending.set(id, { at: this.#time + ms, callback })
    return id as unknown as ReturnType<typeof setTimeout>
  }

  clearTimeout(handle: ReturnType<typeof setTimeout>): void {
    this.#pending.delete(handle as unknown as number)
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
      const due = [...this.#pending.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)
      const first = due[0]
      if (first === undefined) break
      this.#pending.delete(first[0])
      this.#time = first[1].at
      first[1].callback()
    }
    this.#time = target
  }
}

describe('shard routing', () => {
  it('routes a guild by its creation timestamp bits', () => {
    // (guild_id >> 22) % num_shards, verbatim from Discord's formula.
    const guildId = '197038439483310086'
    const expected = Number(BigInt(guildId) >> 22n) % 4
    assert.equal(shardIdForGuild(guildId, 4), expected)
  })

  it('puts every guild on shard 0 when unsharded', () => {
    for (const id of ['1', '197038439483310086', '999999999999999999']) {
      assert.equal(shardIdForGuild(id, 1), 0)
    }
  })

  it('marks shard 0 as the one carrying guild-less events', () => {
    // DMs, entitlements and subscriptions have no guild to route by, so shards are not
    // interchangeable and DM handling must never be round-robined.
    assert.equal(receivesGuildlessEvents(0), true)
    assert.equal(receivesGuildlessEvents(1), false)
  })
})

describe('identify throttler', () => {
  it('serialises shards that share a rate limit key', async () => {
    // rate_limit_key = shard_id % max_concurrency. Shards 3, 19 and 35 all share key 3
    // with max_concurrency 16, so they must identify five seconds apart — the case a
    // `floor(shard_id / max_concurrency)` shortcut gets wrong.
    const throttler = new LocalIdentifyThrottler(16)
    const started = Date.now()

    await throttler.waitForIdentify(3)
    const first = Date.now() - started
    assert.ok(first < 100, 'the first identify in a bucket should not wait')

    const pending = throttler.waitForIdentify(19)
    const settled = await Promise.race([
      pending.then(() => 'done' as const),
      new Promise<'waiting'>((resolve) => {
        setTimeout(() => {
          resolve('waiting')
        }, 50)
      }),
    ])
    assert.equal(settled, 'waiting', 'a shard sharing a key identified immediately')
  })

  it('lets different keys identify concurrently', async () => {
    const throttler = new LocalIdentifyThrottler(16)
    const started = Date.now()
    await Promise.all(
      [0, 1, 2, 3].map(async (id) => {
        await throttler.waitForIdentify(id)
      }),
    )
    assert.ok(Date.now() - started < 100, 'distinct buckets were serialised')
  })

  it('refuses a max_concurrency that cannot be right', () => {
    // It comes from GET /gateway/bot and must never be guessed.
    assert.throws(() => new LocalIdentifyThrottler(0), RangeError)
    assert.throws(() => new LocalIdentifyThrottler(-1), RangeError)
  })
})

describe('send queue', () => {
  it('rejects a payload the gateway would close the connection over', () => {
    // Without the pre-send check the symptom is a 4002 close hundreds of milliseconds
    // later, with nothing linking it to the call that caused it.
    const queue = new SendQueue()
    const oversized = 'x'.repeat(MAX_PAYLOAD_BYTES + 1)

    assert.throws(
      () => {
        queue.assertWithinSizeLimit(oversized, GatewayOpcodes.RequestGuildMembers)
      },
      (error: unknown) => {
        assert.ok(error instanceof PayloadTooLargeError)
        assert.equal(error.opcode, GatewayOpcodes.RequestGuildMembers)
        assert.ok(error.size > MAX_PAYLOAD_BYTES)
        return true
      },
    )
  })

  it('holds back an allowance for heartbeats', async () => {
    // Without the reserve, a burst of user commands delays a heartbeat past its interval,
    // no ACK arrives, and the shard diagnoses a zombie — a loop whose real cause is a rate
    // limit rather than a dead connection.
    const queue = new SendQueue({
      limit: 10,
      windowMs: 60_000,
      heartbeatReserve: 2,
      sendTimeout: null,
    })

    for (let i = 0; i < 8; i += 1) await queue.acquire()

    assert.ok(queue.delayFor(false) > 0, 'user sends should be throttled at the reserve')
    assert.equal(queue.delayFor(true), 0, 'heartbeats should still have room')
    assert.equal(queue.tryTakeHeartbeatSlot(), true)
  })

  it('fails fast when a send would wait longer than allowed', async () => {
    const queue = new SendQueue({
      limit: 2,
      windowMs: 60_000,
      heartbeatReserve: 0,
      sendTimeout: 100,
    })
    await queue.acquire()
    await queue.acquire()

    await assert.rejects(queue.acquire(), SendTimeoutError)
  })
})

describe('guild readiness', () => {
  it('drains on GUILD_CREATE and on GUILD_DELETE', () => {
    // Both are required. Guilds unavailable during an outage arrive as a delete, so
    // tracking only creates means those never clear and every restart during a Discord
    // incident falls through to the timeout.
    const timers = new ManualTimers()
    let reported: string[] | null = null
    const tracker = new GuildReadyTracker({ idleMs: 15_000, enabled: true }, timers, (u) => {
      reported = u
    })

    tracker.seed(['1', '2', '3'])
    tracker.resolve('1') // GUILD_CREATE
    tracker.resolve('2') // GUILD_DELETE, an outage guild
    assert.equal(reported, null)

    tracker.resolve('3')
    assert.deepEqual(reported, [])
  })

  it('uses an idle timer, so a slow stream is not cut off', () => {
    const timers = new ManualTimers()
    let reported: string[] | null = null
    const tracker = new GuildReadyTracker({ idleMs: 1_000, enabled: true }, timers, (u) => {
      reported = u
    })

    tracker.seed(['1', '2', '3', '4', '5', 'stuck'])

    // Guilds keep arriving, just slowly — 900ms apart against a 1s idle window. Total
    // elapsed reaches 4.5s, far past any absolute deadline of 1s, and a large shard
    // streaming for minutes is exactly this shape.
    for (const id of ['1', '2', '3', '4', '5']) {
      timers.advance(900)
      assert.equal(reported, null, 'the idle timer fired while guilds were still arriving')
      tracker.resolve(id)
    }

    // The stream stops. Now the idle window elapses and completion is reported, naming
    // what never arrived rather than hiding it.
    timers.advance(1_001)
    assert.deepEqual(reported, ['stuck'])
  })

  it('completes immediately without the Guilds intent', () => {
    // GUILD_CREATE never arrives, so the set could never drain — an interaction-only bot
    // would otherwise pay the full timeout on every connect.
    const timers = new ManualTimers()
    let reported: string[] | null = null
    const tracker = new GuildReadyTracker({ idleMs: 15_000, enabled: false }, timers, (u) => {
      reported = u
    })

    tracker.seed(['1', '2'])
    assert.deepEqual(reported, [], 'tracking should short-circuit when disabled')
  })
})

describe('shard manager preflight', () => {
  const info = (overrides: Record<string, unknown> = {}) => ({
    url: 'wss://gateway.discord.gg/',
    shards: 2,
    session_start_limit: {
      total: 1000,
      remaining: 900,
      reset_after: 3_600_000,
      max_concurrency: 1,
    },
    ...overrides,
  })

  it('refuses to start when the session budget cannot cover the fleet', async () => {
    // Overrunning does not throttle: it terminates every session, resets the token, and
    // emails the owner. A retry loop would turn a config mistake into a manual recovery.
    const manager = new ShardManager({
      token: 't',
      intents: 0,
      fetchGatewayBot: () =>
        Promise.resolve(
          info({
            session_start_limit: {
              total: 1000,
              remaining: 1,
              reset_after: 5_000,
              max_concurrency: 1,
            },
          }),
        ),
      shardCount: 4,
    })

    await assert.rejects(manager.connect(), (error: unknown) => {
      assert.ok(error instanceof SessionLimitError)
      assert.equal(error.remaining, 1)
      assert.equal(error.resetAfter, 5_000)
      return true
    })
    assert.equal(manager.shards.size, 0, 'no shard should have been created')
  })

  it('warns rather than refusing when the budget is merely tight', async () => {
    const manager = new ShardManager({
      token: 't',
      intents: 0,
      fetchGatewayBot: () =>
        Promise.resolve(
          info({
            session_start_limit: {
              total: 1000,
              remaining: 3,
              reset_after: 5_000,
              max_concurrency: 1,
            },
          }),
        ),
      shardCount: 2,
      transport: () => {
        throw new Error('should not connect in this test')
      },
    })

    const warnings: number[] = []
    manager.on('sessionStartWarning', (remaining) => warnings.push(remaining))
    await manager.connect().catch(() => undefined)

    assert.deepEqual(warnings, [3])
  })
})

describe('shard manager readiness', () => {
  /**
   * `allReady` must not outrun the consumer's own `ready` handlers.
   *
   * @remarks
   * The manager registers its readiness counter inside `connect()`, and `shardSpawn` is
   * the first point a consumer can attach to a shard — so the manager's listener is always
   * registered first, and `EventEmitter` runs listeners in registration order.
   *
   * That made `allReady` fire before any consumer had processed READY, so state derived
   * from it was a tick stale. With a single shard both land in the same millisecond, which
   * is exactly why the race went unnoticed: it looks like correct output until the value
   * read in an `allReady` handler happens to matter.
   */
  it('fires allReady after the consumer has handled ready', async () => {
    const fleet = new MockTransportFleet()
    const order: string[] = []

    const manager = new ShardManager({
      token: 't',
      intents: 0,
      shardCount: 1,
      // The mock speaks plain JSON, so decompression is out of the picture here.
      compression: CompressionMode.None,
      fetchGatewayBot: () =>
        Promise.resolve({
          url: 'wss://gateway.discord.gg/',
          shards: 1,
          session_start_limit: {
            total: 1000,
            remaining: 1000,
            reset_after: 5_000,
            max_concurrency: 1,
          },
        }),
      transport: fleet.factory,
    })

    manager.on('shardSpawn', (shardId) => {
      const shard = manager.shards.get(shardId)
      shard?.on('ready', () => {
        order.push('consumer ready')
      })
    })
    manager.on('allReady', () => {
      order.push('allReady')
    })

    await manager.connect()

    fleet.current.open()
    fleet.current.receive({ op: GatewayOpcodes.Hello, d: { heartbeat_interval: 40_000 } })
    await flush()

    fleet.current.receive({
      op: GatewayOpcodes.Dispatch,
      t: 'READY',
      s: 1,
      d: {
        v: 10,
        user: { id: '1' },
        guilds: [],
        session_id: 'sess-1',
        resume_gateway_url: 'wss://resume.discord.gg/',
        application: { id: '1', flags: 0 },
      },
    })
    await flush()

    assert.deepEqual(
      order,
      ['consumer ready', 'allReady'],
      'allReady must mean "every shard is ready and the consumer has seen it"',
    )

    await manager.destroy(false)
  })
})
