import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Client, CompressionMode } from '@vestra/core'
import { GatewayIntentBits, GatewayOpcodes } from '@vestra/types'
import { ScriptedTransport, tick } from './scripted-client.ts'

/**
 * What `ready` means, and how it differs from `login()`.
 *
 * @remarks
 * **`ready` fired on the first shard while claiming to mean the fleet.** Its own TSDoc said
 * "once per client, not once per shard" and §5.4 said "every owned shard has reached READY",
 * and the implementation set a flag on whichever shard got there first. On the single-shard
 * bot almost everybody runs those are the same moment, which is why nothing caught it — and on
 * a larger fleet it meant a `ready` handler ran with most shards still identifying and most
 * guilds not yet cached.
 *
 * The two are genuinely different questions and now fire at different times, which is the
 * thing worth pinning: `login()` answers "can I talk to Discord" and resolves on the first
 * shard, because a two-hundred shard bot spends over a minute on identify pacing alone and a
 * startup line has to come out before that. `ready` answers "is the fleet up".
 *
 * Driven at two shards, because at one shard every arrangement of this code passes.
 */

const READY_PAYLOAD = {
  v: 10,
  user: { id: '1', username: 'bot', discriminator: '0', avatar: null, bot: true },
  guilds: [],
  session_id: 'session',
  resume_gateway_url: 'wss://gateway.discord.gg/',
  application: { id: '1', flags: 0 },
}

/** A two-shard client whose handshakes the test drives one at a time. */
function fleet(): {
  client: Client
  /** Settled either way: a rejection is caught so the race below can inspect the outcome. */
  login: Promise<unknown>
  transports: ScriptedTransport[]
} {
  const transports: ScriptedTransport[] = []
  const client = new Client({
    token: 'not.a.real.token',
    intents: [GatewayIntentBits.Guilds],
    gateway: {
      compression: CompressionMode.None,
      shardCount: 2,
      fetchGatewayBot: () =>
        Promise.resolve({
          url: 'wss://gateway.discord.gg/',
          shards: 2,
          session_start_limit: { total: 1000, remaining: 1000, reset_after: 0, max_concurrency: 1 },
        }),
      transport: (listeners) => {
        const transport = new ScriptedTransport(listeners)
        transports.push(transport)
        return transport
      },
    },
  })

  return { client, login: client.login().catch((error: unknown) => error), transports }
}

/** Waits for the transport a shard builds inside `connect()`. */
async function transportAt(
  transports: ScriptedTransport[],
  index: number,
): Promise<ScriptedTransport> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const found = transports[index]
    if (found !== undefined) return found
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  throw new Error(`shard ${String(index)} never built a transport`)
}

/** Brings one scripted shard from open to READY. */
async function bringUp(socket: ScriptedTransport, shardId: number): Promise<void> {
  socket.open()
  await tick()
  socket.receive({ op: GatewayOpcodes.Hello, d: { heartbeat_interval: 45_000 } })
  await tick()
  socket.dispatch('READY', { ...READY_PAYLOAD, shard: [shardId, 2] }, 1)
  await tick()
}

describe('client readiness', () => {
  it('RD1: resolves login on the first shard and holds ready for the fleet', async () => {
    const { client, login, transports } = fleet()

    let readyCount = 0
    client.on('ready', () => {
      readyCount += 1
    })

    try {
      await bringUp(await transportAt(transports, 0), 0)

      // login() is answered, because it asks whether Discord is reachable at all.
      const settled = await Promise.race([
        login.then(() => 'resolved'),
        new Promise((resolve) => {
          setTimeout(() => {
            resolve('pending')
          }, 1_000)
        }),
      ])
      assert.equal(settled, 'resolved', 'login did not resolve on the first shard')

      // `ready` is not, because shard 1 has not identified. This is the assertion the old
      // implementation failed: it fired here.
      assert.equal(readyCount, 0, 'ready fired with half the fleet still identifying')

      await bringUp(await transportAt(transports, 1), 1)
      assert.equal(readyCount, 1, 'ready did not fire once the fleet was up')
    } finally {
      await client.destroy()
    }
  })

  it('RD2: fires ready once per client, not once per shard', async () => {
    const { client, login, transports } = fleet()

    let readyCount = 0
    client.on('ready', () => {
      readyCount += 1
    })

    try {
      await bringUp(await transportAt(transports, 0), 0)
      await bringUp(await transportAt(transports, 1), 1)
      await login
      await tick()

      assert.equal(readyCount, 1, `ready fired ${String(readyCount)} times`)
    } finally {
      await client.destroy()
    }
  })

  it('RD3: reports the guild stream draining, which was computed and thrown away', async () => {
    // `GuildReadyTracker` runs, decides, and called a hook the client wired to `() => undefined`
    // — while `ready`'s own documentation pointed at a `shardGuildsReady` event that did not
    // exist. The signal is public now.
    const { client, login, transports } = fleet()

    const drained: number[] = []
    client.on('shardGuildsReady', (shardId, unresolved) => {
      drained.push(shardId)
      assert.deepEqual(unresolved, [], 'READY promised no guilds, so none can be unresolved')
    })

    try {
      await bringUp(await transportAt(transports, 0), 0)
      await bringUp(await transportAt(transports, 1), 1)
      await login
      await tick()

      assert.deepEqual(drained.sort(), [0, 1], 'both shards should have reported their stream')
    } finally {
      await client.destroy()
    }
  })
})
