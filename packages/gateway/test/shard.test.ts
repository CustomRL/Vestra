import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CompressionMode, Shard, ShardState, type ShardOptions, type Timers } from '@vestra/gateway'
import { GatewayOpcodes } from '@vestra/types'
import { MockTransportFleet } from './mock-transport.ts'

/**
 * Deterministic timers: callbacks are collected, and the test decides when they fire.
 */
class ManualTimers implements Timers {
  #time = 1_000_000
  #next = 1
  readonly #pending = new Map<number, { at: number; callback: () => void }>()
  /** The value `random()` returns, so jitter is predictable. */
  randomValue = 0.5

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
    return this.randomValue
  }

  /** Advances time, firing anything due. */
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

  /** How many timers are outstanding. */
  get pending(): number {
    return this.#pending.size
  }
}

/**
 * Drains pending microtasks.
 *
 * @remarks
 * Sending an Identify runs through the identify throttler and then the send queue, each
 * of which awaits. A fixed pair of `Promise.resolve()` ticks is not enough and silently
 * asserts against a payload that has not been written yet.
 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

interface Harness {
  shard: Shard
  fleet: MockTransportFleet
  timers: ManualTimers
  events: string[]
}

function harness(overrides: Partial<ShardOptions> = {}): Harness {
  const fleet = new MockTransportFleet()
  const timers = new ManualTimers()
  const events: string[] = []

  const shard = new Shard({
    token: 'token',
    intents: 513,
    shardId: 0,
    shardCount: 1,
    gatewayUrl: 'wss://gateway.discord.gg/',
    // The mock speaks plain JSON, so decompression is out of the picture for these tests.
    compression: CompressionMode.None,
    transport: fleet.factory,
    timers,
    ...overrides,
  })

  shard.on('stateChange', (_from, to) => events.push(to))
  shard.on('error', () => undefined)

  return { shard, fleet, timers, events }
}

/** Drives a shard from construction to Ready via a fresh identify. */
async function reachReady(h: Harness, sessionId = 'sess-1'): Promise<void> {
  await h.shard.connect()
  h.fleet.current.open()
  h.fleet.current.receive({ op: GatewayOpcodes.Hello, d: { heartbeat_interval: 40_000 } })
  await flush()
  h.fleet.current.receive({
    op: GatewayOpcodes.Dispatch,
    t: 'READY',
    s: 1,
    d: {
      v: 10,
      user: { id: '1' },
      guilds: [],
      session_id: sessionId,
      resume_gateway_url: 'wss://resume.discord.gg/',
      application: { id: '1', flags: 0 },
    },
  })
}

describe('handshake', () => {
  it('sends nothing until Hello arrives', async () => {
    const h = harness()
    await h.shard.connect()
    h.fleet.current.open()

    assert.equal(h.shard.state, ShardState.Handshaking)
    assert.deepEqual(h.fleet.current.sends, [], 'a payload was sent before Hello')
  })

  it('starts heartbeating and identifies without waiting for the first beat', async () => {
    // Blocking Identify on the jittered first beat would delay login by up to a full
    // interval, which presents as a hung startup.
    const h = harness()
    await h.shard.connect()
    h.fleet.current.open()
    h.fleet.current.receive({ op: GatewayOpcodes.Hello, d: { heartbeat_interval: 40_000 } })
    await flush()

    const sent = h.fleet.current.sentPayloads
    assert.equal(sent.length, 1, 'expected exactly the Identify')
    assert.equal(sent[0]?.op, GatewayOpcodes.Identify)
    assert.equal(h.shard.state, ShardState.Identifying)
  })

  it('carries shard, intents and properties on the Identify', async () => {
    const h = harness()
    await h.shard.connect()
    h.fleet.current.open()
    h.fleet.current.receive({ op: GatewayOpcodes.Hello, d: { heartbeat_interval: 40_000 } })
    await flush()

    const identify = h.fleet.current.sentPayloads[0]
    assert.ok(identify)
    assert.equal(identify.op, GatewayOpcodes.Identify)
    assert.deepEqual(identify.d.shard, [0, 1])
    assert.equal(identify.d.intents, 513)
    assert.ok(identify.d.properties.browser.length > 0)
    assert.equal('compress' in identify.d, false, 'compress belongs in the URL, not identify')
  })

  it('caches the session and resume URL from READY', async () => {
    const h = harness()
    await reachReady(h)

    assert.equal(h.shard.state, ShardState.Ready)
    assert.equal(h.shard.sequence, 1)
  })

  it('puts the compression mode in the URL, not the payload', async () => {
    const h = harness({ compression: CompressionMode.ZlibStream })
    await h.shard.connect()

    assert.match(h.fleet.current.connects[0] ?? '', /compress=zlib-stream/)
    assert.match(h.fleet.current.connects[0] ?? '', /encoding=json/)
    assert.match(h.fleet.current.connects[0] ?? '', /v=10/)
  })
})

describe('heartbeats', () => {
  it('jitters only the first beat, then keeps exact cadence', async () => {
    const h = harness()
    h.timers.randomValue = 0.5
    await reachReady(h)
    const before = h.fleet.current.sends.length

    // First beat lands at interval * 0.5.
    h.timers.advance(20_000)
    assert.equal(h.fleet.current.sends.length, before + 1, 'first beat did not fire at the jitter')

    // Acknowledge so the next beat is not diagnosed as a zombie.
    h.fleet.current.receive({ op: GatewayOpcodes.HeartbeatAck })

    // Subsequent beats are a full interval apart, not re-jittered.
    h.timers.advance(39_999)
    assert.equal(h.fleet.current.sends.length, before + 1, 'second beat fired early')
    h.timers.advance(1)
    assert.equal(h.fleet.current.sends.length, before + 2)
  })

  it('does not call a requested beat near the scheduled one a zombie', async () => {
    // Found by review. A beat Discord *requests* sets the same outstanding-acknowledgement flag
    // as a scheduled one, and the zombie check read that flag rather than how long it had been
    // outstanding. So a requested beat arriving within a round trip of the scheduled beat left
    // an ack legitimately in flight when the timer fired, and a healthy socket was abandoned
    // and a resume spent — about one RTT of exposure per interval.
    const h = harness()
    h.timers.randomValue = 0.5
    await reachReady(h)

    h.timers.advance(20_000) // the jittered first beat
    h.fleet.current.receive({ op: GatewayOpcodes.HeartbeatAck })

    // Almost a full interval later, Discord asks for a beat out of band.
    h.timers.advance(39_990)
    h.fleet.current.receive({ op: GatewayOpcodes.Heartbeat })

    // The scheduled beat is now due, ten milliseconds after the requested one went out.
    h.timers.advance(10)

    assert.notEqual(h.shard.state, ShardState.Reconnecting, 'a healthy socket was called a zombie')
    assert.equal(h.shard.state, ShardState.Ready)
  })

  it('still calls a genuinely unacknowledged beat a zombie', async () => {
    // The control. Without it the fix above could be "never declare a zombie", which would
    // leave a dead connection running forever.
    const h = harness()
    h.timers.randomValue = 0.5
    await reachReady(h)

    h.timers.advance(20_000) // the first beat, never acknowledged
    h.timers.advance(40_000) // a whole interval later

    assert.equal(h.shard.state, ShardState.Reconnecting, 'a dead connection was left running')
  })

  it('sends the last dispatch sequence, and control frames never overwrite it', async () => {
    const h = harness()
    await reachReady(h)

    h.fleet.current.receive({ op: GatewayOpcodes.Dispatch, t: 'TYPING_START', s: 7, d: {} })
    // Control frames carry s: null. Letting that through turns a resumable session into a
    // 4007 on the next resume.
    h.fleet.current.receive({ op: GatewayOpcodes.HeartbeatAck })
    h.fleet.current.receive({ op: GatewayOpcodes.Heartbeat })

    const beats = h.fleet.current.sentPayloads.filter((p) => p.op === GatewayOpcodes.Heartbeat)
    assert.ok(beats.length > 0)
    assert.equal(beats.at(-1)?.d, 7)
    assert.equal(h.shard.sequence, 7)
  })

  it('beats immediately when the gateway asks', async () => {
    const h = harness()
    await reachReady(h)
    const before = h.fleet.current.sends.length

    h.fleet.current.receive({ op: GatewayOpcodes.Heartbeat })

    assert.equal(h.fleet.current.sends.length, before + 1)
  })

  it('abandons rather than closes a zombie connection', async () => {
    // The critical one. A graceful close needs a reply from a peer that has stopped
    // replying, so the socket would sit in CLOSING forever.
    const h = harness()
    await reachReady(h)
    const transport = h.fleet.current

    let zombies = 0
    h.shard.on('zombie', () => (zombies += 1))

    h.timers.advance(20_000) // first beat
    h.timers.advance(40_000) // next beat due, still un-acknowledged

    assert.equal(zombies, 1)
    assert.equal(transport.destroys, 1, 'the socket was not abandoned')
    assert.deepEqual(transport.closes, [], 'a graceful close was attempted on a zombie')
  })

  it('still reconnects when a close event never arrives', async () => {
    // The regression this design exists to prevent: against a peer that swallows the
    // closing handshake, a shard that waits for the close event hangs permanently.
    const h = harness()
    await reachReady(h)
    h.fleet.current.swallowClose = true

    h.timers.advance(20_000)
    h.timers.advance(40_000)

    assert.equal(h.shard.state, ShardState.Reconnecting)
    h.timers.advance(120_000)
    assert.ok(h.fleet.created.length >= 2, 'the shard never opened a replacement connection')
  })
})

describe('resume versus identify', () => {
  it('resumes against the resume URL after an abrupt close', async () => {
    const h = harness()
    await reachReady(h)

    h.fleet.current.serverClose(1006, '', false)
    h.timers.advance(120_000)

    const second = h.fleet.created[1]
    assert.ok(second, 'no reconnect was attempted')
    assert.match(second.connects[0] ?? '', /resume\.discord\.gg/)

    second.open()
    second.receive({ op: GatewayOpcodes.Hello, d: { heartbeat_interval: 40_000 } })
    await flush()

    const resume = second.sentPayloads[0]
    assert.ok(resume)
    assert.equal(resume.op, GatewayOpcodes.Resume, 'expected a Resume, not an Identify')
    assert.equal(resume.d.seq, 1, 'Resume must carry `seq`, not `s`')
  })

  it('closes with 4000 and resumes when the gateway asks to reconnect', async () => {
    const h = harness()
    await reachReady(h)
    const transport = h.fleet.current

    transport.receive({ op: GatewayOpcodes.Reconnect })

    assert.deepEqual(
      transport.closes.map((c) => c.code),
      [4000],
      'op 7 must close with a resumable code, never 1000',
    )
  })

  it('identifies afresh when the session cannot be resumed', async () => {
    const h = harness()
    await reachReady(h)

    h.fleet.current.receive({ op: GatewayOpcodes.InvalidSession, d: false })
    h.timers.advance(120_000)

    const second = h.fleet.created[1]
    assert.ok(second)
    assert.match(second.connects[0] ?? '', /gateway\.discord\.gg/, 'must fall back to the base URL')

    second.open()
    second.receive({ op: GatewayOpcodes.Hello, d: { heartbeat_interval: 40_000 } })
    await flush()
    assert.equal(second.sentPayloads[0]?.op, GatewayOpcodes.Identify)
  })

  it('clears the session on 4007 and 4009', async () => {
    for (const code of [4007, 4009]) {
      const h = harness()
      await reachReady(h)

      h.fleet.current.serverClose(code, 'gone', true)
      h.timers.advance(120_000)

      const second = h.fleet.created[1]
      assert.ok(second, `no reconnect after ${String(code)}`)
      assert.match(
        second.connects[0] ?? '',
        /gateway\.discord\.gg/,
        `${String(code)} must discard the session and use the base URL`,
      )
    }
  })

  it('stops permanently on an unrecoverable close code', async () => {
    for (const code of [4004, 4010, 4011, 4012, 4013, 4014]) {
      const h = harness()
      await reachReady(h)

      h.fleet.current.serverClose(code, 'nope', true)
      h.timers.advance(300_000)

      assert.equal(h.shard.state, ShardState.Fatal, `${String(code)} should be fatal`)
      assert.equal(
        h.fleet.created.length,
        1,
        `${String(code)} reconnected, which can never succeed`,
      )
    }
  })

  it('does not reset backoff merely because a socket opened', async () => {
    // The common failure is a socket that opens and is immediately rejected. Resetting on
    // open makes the backoff useless in exactly that case.
    const h = harness({
      backoff: { baseMs: 1_000, capMs: 60_000, maxAttempts: null, random: () => 1 },
    })
    await h.shard.connect()

    const delays: number[] = []
    let previous = 0
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const transport = h.fleet.created.at(-1)
      assert.ok(transport)
      transport.open()
      transport.serverClose(4000, 'transient', true)

      // Find how far time must advance for the reconnect to fire.
      let waited = 0
      while (h.fleet.created.length === attempt + 1 && waited < 200_000) {
        h.timers.advance(500)
        waited += 500
      }
      delays.push(waited)
      assert.ok(waited > previous || attempt === 0, 'backoff did not grow between attempts')
      previous = waited
    }

    assert.ok((delays[2] ?? 0) > (delays[0] ?? 0), `backoff did not grow: ${delays.join(', ')}`)
  })
})

describe('replay', () => {
  it('flags dispatches between Resume and RESUMED, and advances the sequence', async () => {
    const h = harness()
    await reachReady(h)

    h.fleet.current.serverClose(1006, '', false)
    h.timers.advance(120_000)

    const second = h.fleet.created[1]
    assert.ok(second)
    second.open()
    second.receive({ op: GatewayOpcodes.Hello, d: { heartbeat_interval: 40_000 } })
    await flush()

    const replayed: boolean[] = []
    h.shard.on('dispatch', (_payload, wasReplayed) => replayed.push(wasReplayed))

    second.receive({ op: GatewayOpcodes.Dispatch, t: 'MESSAGE_CREATE', s: 2, d: {} })
    second.receive({ op: GatewayOpcodes.Dispatch, t: 'MESSAGE_CREATE', s: 3, d: {} })
    assert.deepEqual(replayed, [true, true])
    assert.equal(h.shard.sequence, 3, 'replayed dispatches must still advance the sequence')

    second.receive({ op: GatewayOpcodes.Dispatch, t: 'RESUMED', s: 4, d: undefined })
    second.receive({ op: GatewayOpcodes.Dispatch, t: 'MESSAGE_CREATE', s: 5, d: {} })

    assert.equal(replayed.at(-1), false, 'RESUMED did not clear the replay flag')
    assert.equal(h.shard.state, ShardState.Ready)
  })
})

describe('shutdown', () => {
  it('ends the session with 1000 by default', async () => {
    const h = harness()
    await reachReady(h)
    const transport = h.fleet.current

    await h.shard.destroy()

    assert.equal(transport.closes[0]?.code, 1000)
    assert.equal(h.shard.state, ShardState.Closed)
  })

  it('keeps the session resumable when asked', async () => {
    // Closing with 1000 invalidates the session, so a reconnect implemented as
    // close-then-connect silently converts every cheap resume into a full identify.
    const h = harness()
    await reachReady(h)
    const transport = h.fleet.current

    await h.shard.destroy('resume')

    assert.equal(transport.closes[0]?.code, 4000)
  })
})
