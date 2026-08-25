import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GatewayIntentBits } from '@vestra/types'
import { scriptedClient, tick } from './scripted-client.ts'

/**
 * The two shard signals the bridge computed and the client threw away.
 *
 * @remarks
 * `ShardBridge` listened for the gateway's `resumed` and `closed` events and called
 * `hooks.onResumed` and `hooks.onDisconnect`; `Client` wired both to `() => undefined`. A
 * consumer had no way to observe a shard reconnecting or its socket closing, and nothing could
 * see the difference — a discarded value and an absent one look identical from outside, which
 * is exactly how `shardGuildsReady` sat unwired until #35.
 *
 * That is what these cases are for. They are not testing that an `EventEmitter` emits; they are
 * testing that the wire from the socket to the listener exists at all, which is the half that
 * was missing.
 *
 * **`ready` is not a substitute.** It fires once for the fleet's first startup and never again,
 * so without `shardResumed` a bot cannot tell a healthy connection from one that has dropped
 * and recovered forty times.
 */

describe('shard lifecycle events', () => {
  it('SL1: reports a socket closing, with the code and reason', async () => {
    const { client, transports } = await scriptedClient({ intents: [GatewayIntentBits.Guilds] })
    const socket = transports[0]
    assert.ok(socket !== undefined)

    const closed: { shardId: number; code: number; reason: string }[] = []
    client.on('shardDisconnect', (shardId, code, reason) => {
      closed.push({ shardId, code, reason })
    })

    try {
      socket.close()
      await tick()

      assert.equal(closed.length, 1, 'the close never reached a listener')
      assert.deepEqual(closed[0], { shardId: 0, code: 1000, reason: '' })
    } finally {
      await client.destroy()
    }
  })

  it('SL2: reports a resume, which is the only signal a reconnect happened', async () => {
    const { client, transports } = await scriptedClient({ intents: [GatewayIntentBits.Guilds] })
    const socket = transports[0]
    assert.ok(socket !== undefined)

    const resumed: number[] = []
    let readyCount = 0
    client.on('shardResumed', (shardId) => {
      resumed.push(shardId)
    })
    client.on('ready', () => {
      readyCount += 1
    })

    try {
      socket.dispatch('RESUMED', {}, 2)
      await tick()

      assert.deepEqual(resumed, [0], 'the resume never reached a listener')
      // The point of the event: `ready` said nothing, because it already fired at startup and
      // fires once per client. A bot watching only `ready` sees a reconnect as silence.
      assert.equal(readyCount, 0, 'ready is not the reconnect signal and must not fire again')
    } finally {
      await client.destroy()
    }
  })

  it('SL4: stays quiet on a deliberate shutdown, which is not a drop', async () => {
    // The distinction the event turns on, and the one the first version of the testing bot's
    // `lifecycle-check` got wrong: it drove the close through `destroy()` and reported the
    // event missing. It was not missing — a shutdown moves the shard to its closing state
    // before the socket is touched, so the close that follows is suppressed on purpose. A bot
    // logging disconnects should not log its own shutdown as an incident.
    const { client } = await scriptedClient({ intents: [GatewayIntentBits.Guilds] })

    const closed: number[] = []
    client.on('shardDisconnect', (shardId) => {
      closed.push(shardId)
    })

    await client.destroy()
    await tick()

    assert.deepEqual(closed, [], 'destroy reported itself as a disconnect')
  })

  it('SL3: names the shard, so a fleet can tell which one moved', async () => {
    // Two shards, because at one shard every arrangement of this passes — including one that
    // hard-codes zero.
    const { client, transports } = await scriptedClient({ intents: [GatewayIntentBits.Guilds] }, 2)
    const [first, second] = transports
    assert.ok(first !== undefined && second !== undefined)

    const resumed: number[] = []
    client.on('shardResumed', (shardId) => {
      resumed.push(shardId)
    })

    try {
      second.dispatch('RESUMED', {}, 2)
      await tick()
      first.dispatch('RESUMED', {}, 2)
      await tick()

      assert.deepEqual(resumed, [1, 0])
    } finally {
      await client.destroy()
    }
  })
})
