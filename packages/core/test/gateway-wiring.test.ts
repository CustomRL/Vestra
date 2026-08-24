import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GatewayIntentBits, GatewayOpcodes } from '@vestra/types'
import { scriptedClient, tick } from './scripted-client.ts'

/**
 * The wiring between the client and the gateway companions it alone constructs.
 *
 * @remarks
 * §4.3 lists three session mechanics the bridge runs before the router — the guild-ready
 * tracker, `MemberChunker.handleChunk`, and `MemberChunker.handleRateLimited` — and says why
 * they are deliberately not handlers: they must keep working regardless of what a consumer
 * opts out of.
 *
 * The third was never wired. `MemberChunker.handleRateLimited` is exported, documented and
 * unit-tested in `@vestra/gateway`, and was called by nobody, which is a failure mode this
 * project has already met once. Nothing catches that shape except a test that drives the real
 * path, because the method works perfectly in isolation.
 */

const GUILD_ID = '613425648685547541'

/** Waits for the shard to put an opcode on the wire, rather than racing a fixed delay. */
async function sentOpcode(
  transport: { sent: { op: number; d?: unknown }[] },
  op: number,
): Promise<{ op: number; d?: unknown }> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const found = transport.sent.find((payload) => payload.op === op)
    if (found !== undefined) return found
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  throw new Error(`opcode ${String(op)} was never sent`)
}

describe('gateway wiring', () => {
  it('W3: fails a member request the gateway says it rate limited', async () => {
    // **The bug.** `RATE_LIMITED` was in the unhandled list with a reason that described the
    // connection-level signal and forgot the member-request half. Discord answers a limited
    // `REQUEST_GUILD_MEMBERS` with this instead of chunks, carrying the nonce — and with
    // nothing routing it, the caller waited out the full sixty-second timeout and was then
    // told the request "may have been silently dropped, or the GuildMembers intent may be
    // missing". A guess, when the server had said exactly what happened.
    const { client, transports } = await scriptedClient({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    })
    const transport = transports[0]
    assert.ok(transport !== undefined)

    try {
      const pending = client.fetchMembers(GUILD_ID)
      const request = await sentOpcode(transport, GatewayOpcodes.RequestGuildMembers)
      const { nonce } = request.d as { nonce: string }

      transport.dispatch(
        'RATE_LIMITED',
        {
          opcode: GatewayOpcodes.RequestGuildMembers,
          retry_after: 30,
          meta: { guild_id: GUILD_ID, nonce },
        },
        2,
      )

      await assert.rejects(
        pending,
        (error: unknown) => {
          assert.ok(error instanceof Error)
          // Named, and with the server's own figure. The timeout message says the opposite —
          // that nobody knows why — so matching this is what tells the two paths apart.
          assert.match(error.message, /rate limited/)
          assert.match(error.message, /30s/)
          return true
        },
        'the request was not failed by the rate-limit notice',
      )
    } finally {
      await client.destroy()
    }
  })

  it('W3b: holds the guild off until the retry window the gateway named', async () => {
    // The other half of `handleRateLimited`, and the half that stops a retry loop: the notice
    // also sets the per-guild gate, so the immediate retry a caller writes is refused locally
    // rather than walking into the same limit.
    const { client, transports } = await scriptedClient({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    })
    const transport = transports[0]
    assert.ok(transport !== undefined)

    try {
      const pending = client.fetchMembers(GUILD_ID)
      const request = await sentOpcode(transport, GatewayOpcodes.RequestGuildMembers)
      const { nonce } = request.d as { nonce: string }

      transport.dispatch(
        'RATE_LIMITED',
        {
          opcode: GatewayOpcodes.RequestGuildMembers,
          retry_after: 30,
          meta: { guild_id: GUILD_ID, nonce },
        },
        2,
      )
      await assert.rejects(pending)

      const before = transport.sent.length
      await assert.rejects(client.fetchMembers(GUILD_ID), /limited to once per guild/)
      assert.equal(transport.sent.length, before, 'the retry was sent anyway')
    } finally {
      await client.destroy()
    }
  })

  it('W4: rejects an outstanding member request when the session is replaced', async () => {
    // Chunks belong to a session. One outstanding across a fresh identify will never arrive,
    // so leaving the promise pending would hang the caller and leak its closure for the life
    // of the process.
    const { client, transports } = await scriptedClient({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    })
    const transport = transports[0]
    assert.ok(transport !== undefined)

    try {
      const pending = client.fetchMembers(GUILD_ID)
      await sentOpcode(transport, GatewayOpcodes.RequestGuildMembers)

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

      await assert.rejects(pending, /fresh identify/)
    } finally {
      await client.destroy()
    }
  })

  it('W5: fetches gateway information once, whatever the shard count', async () => {
    // Once per login, not once per shard. `/gateway/bot` carries the session-start budget for
    // the whole token, and a client that asked per shard would spend a two-hundred shard bot's
    // allowance on finding out how much of it there was.
    let calls = 0
    const { client } = await scriptedClient(
      {
        gateway: {
          fetchGatewayBot: () => {
            calls += 1
            return Promise.resolve({
              url: 'wss://gateway.discord.gg/',
              shards: 3,
              session_start_limit: {
                total: 1000,
                remaining: 1000,
                reset_after: 0,
                max_concurrency: 1,
              },
            })
          },
        },
      },
      3,
    )
    try {
      await tick()
      assert.equal(calls, 1, `gateway information was fetched ${String(calls)} times`)
    } finally {
      await client.destroy()
    }
  })
})
