import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Client, ClientError, ClientErrorCode } from '@vestra/core'
import { GatewayIntentBits } from '@vestra/types'
import { scriptedClient, tick } from './scripted-client.ts'

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
