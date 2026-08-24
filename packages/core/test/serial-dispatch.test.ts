/* eslint-disable @typescript-eslint/no-misused-promises --
 * An `async` listener is the whole subject of this file. `ClientEvents` types listeners as
 * returning `void`, which is honest about the default path — the promise is discarded there
 * — and the rule is right to object to it in general. In serial mode that same promise is
 * the completion signal, and lint cannot tell the two modes apart from the listener alone.
 * Consumers turning serial mode on will meet this, which is why `serialDispatch` says so.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GatewayIntentBits } from '@vestra/types'
import { scriptedClient, tick, type ScriptedTransport } from './scripted-client.ts'

/**
 * Opt-in serial dispatch.
 *
 * @remarks
 * Every case here drives a real shard, because the feature is a property of the path from
 * the socket to a listener and nothing shorter can observe it. A `DispatchQueue` exercised
 * on its own would prove the queue dequeues in order while saying nothing about whether the
 * client's emit hands it anything to wait on — which is the entire mechanism, and the part
 * that was believed impossible.
 */

const GUILD_ID = '613425648685547541'

/** A `GUILD_CREATE` payload, minimal but complete enough for the handler. */
function guild(id: string): unknown {
  return {
    id,
    name: `guild ${id}`,
    owner_id: '1',
    roles: [],
    emojis: [],
    features: [],
    channels: [],
    threads: [],
    members: [],
    voice_states: [],
    presences: [],
    stage_instances: [],
    guild_scheduled_events: [],
    unavailable: false,
    member_count: 1,
    joined_at: '2024-01-01T00:00:00.000000+00:00',
    large: false,
    verification_level: 0,
    default_message_notifications: 0,
    explicit_content_filter: 0,
    mfa_level: 0,
    premium_tier: 0,
    nsfw_level: 0,
    system_channel_flags: 0,
    afk_timeout: 300,
  }
}

/** Sends `count` `GUILD_CREATE` dispatches, numbered from 1. */
function stream(transport: ScriptedTransport, count: number, from = 10): void {
  for (let index = 0; index < count; index += 1) {
    transport.dispatch('GUILD_CREATE', guild(String(from + index)), 100 + index)
  }
}

/** Resolves after `ms`, for a listener that deliberately takes its time. */
async function slow(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

describe('serial dispatch', () => {
  it('Q1: completes an async listener before the next dispatch is routed', async () => {
    const { client, transports } = await scriptedClient({
      intents: [GatewayIntentBits.Guilds],
      serialDispatch: true,
    })
    const transport = transports[0]
    assert.ok(transport !== undefined)

    const order: string[] = []
    client.on('guildCreate', async (created) => {
      order.push(`enter ${created.id}`)
      await slow(15)
      order.push(`leave ${created.id}`)
    })

    try {
      stream(transport, 3)
      await slow(200)

      assert.deepEqual(order, [
        'enter 10',
        'leave 10',
        'enter 11',
        'leave 11',
        'enter 12',
        'leave 12',
      ])
    } finally {
      await client.destroy()
    }
  })

  it('Q2: a slow listener on one shard does not delay another shard', async () => {
    const { client, transports } = await scriptedClient(
      { intents: [GatewayIntentBits.Guilds], serialDispatch: true },
      2,
    )
    const [first, second] = transports
    assert.ok(first !== undefined && second !== undefined)

    const finished: string[] = []
    client.on('raw', async (_payload, shardId) => {
      if (shardId === 0) await slow(120)
      finished.push(`shard ${String(shardId)}`)
    })

    try {
      // Shard 0 goes first and blocks for far longer than shard 1 needs. A single global
      // queue would put shard 1 behind it and the order would come out reversed.
      first.dispatch('GUILD_CREATE', guild('20'), 200)
      second.dispatch('GUILD_CREATE', guild('21'), 200)
      await slow(300)

      assert.deepEqual(finished, ['shard 1', 'shard 0'])
    } finally {
      await client.destroy()
    }
  })

  it('Q3: drops the newest past maxQueued and reports it', async () => {
    const { client, transports } = await scriptedClient({
      intents: [GatewayIntentBits.Guilds],
      serialDispatch: { maxQueued: 2 },
    })
    const transport = transports[0]
    assert.ok(transport !== undefined)

    const dropped: { id: string; shardId: number; depth: number }[] = []
    const seen: string[] = []
    client.on('dispatchDropped', (payload, shardId, depth) => {
      dropped.push({ id: (payload.d as { id: string }).id, shardId, depth })
    })
    client.on('guildCreate', async (created) => {
      seen.push(created.id)
      await slow(40)
    })

    try {
      // Five arrive while the first is still in a listener: one is routed immediately, two
      // fit in the queue, and the last two have nowhere to go.
      stream(transport, 5)
      await slow(400)

      // Drop-newest, so the survivors are contiguous from the front. Drop-oldest would have
      // kept 13 and 14 and thrown away the earlier ones, reordering causality.
      assert.deepEqual(seen, ['10', '11', '12'])
      assert.deepEqual(
        dropped.map((entry) => entry.id),
        ['13', '14'],
      )
      assert.deepEqual(
        dropped.map((entry) => entry.shardId),
        [0, 0],
      )
      assert.deepEqual(
        dropped.map((entry) => entry.depth),
        [2, 2],
      )
    } finally {
      await client.destroy()
    }
  })

  it('Q4: default mode routes the next dispatch before the async listener resolves', async () => {
    // Pins the documented non-guarantee so nobody "fixes" it into an await. The gateway does
    // not wait on listener return values and core publishes exactly that, in the same words.
    const { client, transports } = await scriptedClient({ intents: [GatewayIntentBits.Guilds] })
    const transport = transports[0]
    assert.ok(transport !== undefined)

    const order: string[] = []
    client.on('guildCreate', async (created) => {
      order.push(`enter ${created.id}`)
      await slow(15)
      order.push(`leave ${created.id}`)
    })

    try {
      stream(transport, 2)
      await slow(200)

      assert.deepEqual(order, ['enter 10', 'enter 11', 'leave 10', 'leave 11'])
    } finally {
      await client.destroy()
    }
  })

  it('Q5: clears the backlog on a fresh identify', async () => {
    const { client, transports } = await scriptedClient({
      intents: [GatewayIntentBits.Guilds],
      serialDispatch: true,
    })
    const transport = transports[0]
    assert.ok(transport !== undefined)

    const seen: string[] = []
    client.on('guildCreate', async (created) => {
      seen.push(created.id)
      await slow(30)
    })

    try {
      stream(transport, 4)
      // A second READY is a new session, so the backlog behind it belongs to a session whose
      // sequence numbers no longer mean anything.
      transport.dispatch(
        'READY',
        {
          v: 10,
          user: { id: '1', username: 'bot', discriminator: '0', avatar: null, bot: true },
          guilds: [],
          session_id: 'session-two',
          resume_gateway_url: 'wss://gateway.discord.gg/',
          shard: [0, 1],
          application: { id: '1', flags: 0 },
        },
        1,
      )
      await slow(400)

      // The first was already out of the queue and in a listener when READY arrived; the
      // rest were still waiting and went with the session.
      assert.deepEqual(seen, ['10'])
    } finally {
      await client.destroy()
    }
  })

  it('Q7: keeps the backlog across a resume', async () => {
    // The other half of Q5, and the half that is easy to get wrong by clearing on any
    // reconnect. A resumed session's backlog is still in sequence order and still wanted;
    // dropping it would lose dispatches Discord considers delivered.
    const { client, transports } = await scriptedClient({
      intents: [GatewayIntentBits.Guilds],
      serialDispatch: true,
    })
    const transport = transports[0]
    assert.ok(transport !== undefined)

    const seen: string[] = []
    client.on('guildCreate', async (created) => {
      seen.push(created.id)
      await slow(30)
    })

    try {
      stream(transport, 4)
      transport.dispatch('RESUMED', {}, 2)
      await slow(400)

      assert.deepEqual(seen, ['10', '11', '12', '13'])
    } finally {
      await client.destroy()
    }
  })

  it('Q6: reports a listener whose promise rejects', async () => {
    // Awaiting a promise marks it handled, so a rejection that reached `unhandledRejection`
    // on the default path would go silent the moment serial mode was switched on. It takes
    // the router's ordinary error path instead.
    const { client, transports } = await scriptedClient({
      intents: [GatewayIntentBits.Guilds],
      serialDispatch: true,
    })
    const transport = transports[0]
    assert.ok(transport !== undefined)

    const errors: { message: string; event: string; shardId: number }[] = []
    client.on('error', (error, context) => {
      errors.push({ message: error.message, event: context.event, shardId: context.shardId })
    })
    client.on('guildCreate', async () => {
      await Promise.resolve()
      throw new Error('listener blew up')
    })

    try {
      transport.dispatch('GUILD_CREATE', guild(GUILD_ID), 300)
      await tick()
      await slow(50)

      assert.equal(errors.length, 1)
      const [reported] = errors
      assert.ok(reported !== undefined)
      assert.equal(reported.event, 'GUILD_CREATE')
      assert.equal(reported.shardId, 0)
      assert.match(reported.message, /listener blew up/)
    } finally {
      await client.destroy()
    }
  })
})
