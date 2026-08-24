import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Client, ClientError, ClientErrorCode } from '@vestra/core'
import { CompressionMode } from '@vestra/gateway'
import { GatewayIntentBits, GatewayOpcodes } from '@vestra/types'
import { ScriptedTransport, scriptedClient, tick } from './scripted-client.ts'

/**
 * Shutdown, and what it owes anything still waiting.
 *
 * @remarks
 * §7.10's L group, which had no tests. Shutdown is where a library leaks: every promise handed
 * out has to be settled by something, and the failure mode when one is not is a process that
 * will not exit and gives no reason why.
 *
 * `whenReady()` was one. It waited on the manager's `allReady`, so a client destroyed while
 * somebody awaited readiness left that promise pending for the life of the process —
 * `await Promise.all([client.whenReady(), client.destroy()])` deadlocked outright.
 */

/** A client wired to a scripted socket, stopped wherever the caller wants it. */
function halfway(): { client: Client; login: Promise<unknown>; transports: ScriptedTransport[] } {
  const transports: ScriptedTransport[] = []
  const client = new Client({
    token: 'not.a.real.token',
    intents: 0,
    gateway: {
      compression: CompressionMode.None,
      fetchGatewayBot: () =>
        Promise.resolve({
          url: 'wss://gateway.discord.gg/',
          shards: 1,
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

/** Waits for the transport the shard builds inside `connect()`. */
async function firstTransport(transports: ScriptedTransport[]): Promise<ScriptedTransport> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const first = transports[0]
    if (first !== undefined) return first
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  throw new Error('no transport was created')
}

describe('client lifecycle', () => {
  it('L9: resolves whenReady immediately once the fleet is up', async () => {
    const { client } = await scriptedClient({ intents: [GatewayIntentBits.Guilds] })
    try {
      // Already ready, so this must not wait on an event that has been and gone. Raced against
      // a short timer rather than simply awaited, because the failure is a hang and a hang is
      // indistinguishable from a slow pass without one.
      const raced = await Promise.race([
        client.whenReady().then(() => 'ready'),
        new Promise((resolve) => {
          setTimeout(() => {
            resolve('hung')
          }, 500)
        }),
      ])
      assert.equal(raced, 'ready')
    } finally {
      await client.destroy()
    }
  })

  it('L11: destroys idempotently', async () => {
    const { client, transports } = await scriptedClient({ intents: [GatewayIntentBits.Guilds] })
    await client.destroy()
    const sends = transports[0]?.sends.length ?? 0

    // The second call must resolve rather than throw, and must not talk to a socket that is
    // already gone. A client that threw on a second shutdown turns one failure into two, in
    // the exact place where the first failure is being handled.
    await client.destroy()
    assert.equal(transports[0]?.sends.length ?? 0, sends, 'the second destroy sent something')
  })

  it('L13: fails a pending whenReady rather than leaving it hanging', async () => {
    // **The bug.** Nothing settled these. The promise stayed pending, holding its closure and
    // its listener, and the caller waited forever.
    // Never connected, so no shard has reported ready and `whenReady` genuinely waits. Built
    // directly rather than through the harness, which brings every shard up before returning.
    const client = new Client({ token: 'not.a.real.token', intents: 0 })

    const pending = client.whenReady()
    await tick()

    await client.destroy()

    await assert.rejects(pending, (error: unknown) => {
      assert.ok(error instanceof ClientError)
      assert.equal(error.code, ClientErrorCode.Destroyed)
      return true
    })
  })

  it('L13b: rejects a member request outstanding across a destroy', async () => {
    const { client } = await scriptedClient({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    })
    const pending = client.fetchMembers('613425648685547541')
    await tick()

    await client.destroy()
    await assert.rejects(pending, /destroyed/)
  })

  it('L15: settles login when the client is destroyed mid-handshake', async () => {
    // After `hello`, before `ready` — the window where the socket is open, the shard is
    // identifying, and nothing has reported anything yet. A `login()` left pending here is the
    // worst version of the leak, because it is the promise every bot has on its first line.
    const { client, login, transports } = halfway()
    const socket = await firstTransport(transports)

    socket.open()
    await tick()
    socket.receive({ op: GatewayOpcodes.Hello, d: { heartbeat_interval: 45_000 } })
    await tick()

    await client.destroy()

    const settled = await Promise.race([
      login,
      new Promise((resolve) => {
        setTimeout(() => {
          resolve('hung')
        }, 2_000)
      }),
    ])
    assert.notEqual(settled, 'hung', 'login never settled after a mid-handshake destroy')
  })

  it('L16: bridges a shard before it connects, so no early dispatch is missed', async () => {
    // The bridge is built from `shardSpawn`, which the manager emits synchronously before it
    // opens the socket. If it were attached after `connect()` resolved, a fast server could
    // deliver READY into a shard nobody was listening to — and the client would sit there with
    // no identity, having been told nothing.
    const { client, login, transports } = halfway()
    const socket = await firstTransport(transports)

    const seen: string[] = []
    client.on('raw', (payload) => {
      seen.push(payload.t)
    })

    socket.open()
    await tick()
    socket.receive({ op: GatewayOpcodes.Hello, d: { heartbeat_interval: 45_000 } })
    await tick()
    socket.dispatch(
      'READY',
      {
        v: 10,
        user: { id: '1', username: 'bot', discriminator: '0', avatar: null, bot: true },
        guilds: [],
        session_id: 'session',
        resume_gateway_url: 'wss://gateway.discord.gg/',
        shard: [0, 1],
        application: { id: '1', flags: 0 },
      },
      1,
    )

    try {
      await login
      // The very first dispatch of the connection reached the router, which is only true if the
      // bridge was listening before the socket carried anything.
      assert.deepEqual(seen, ['READY'])
      assert.equal(client.user?.id, '1', 'READY was routed but the identity was not set')
    } finally {
      await client.destroy()
    }
  })

  it('L14: refuses whenReady after destroy rather than hanging on it', async () => {
    const { client } = await scriptedClient({ intents: [GatewayIntentBits.Guilds] })
    await client.destroy()

    await assert.rejects(client.whenReady(), (error: unknown) => {
      assert.ok(error instanceof ClientError)
      assert.equal(error.code, ClientErrorCode.Destroyed)
      return true
    })
  })
})
