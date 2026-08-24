import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GatewayIntentBits, GatewayOpcodes, type GatewaySendPayload } from '@vestra/types'
import { scriptedClient, type ScriptedTransport } from './scripted-client.ts'

/**
 * `client.fetchMembers()` and what it leaves behind.
 *
 * @remarks
 * Driven through a real shard over a scripted transport rather than against a stub, because
 * the defect this covers was an **absence**: the members came back and nothing kept them. A
 * test that called the caching loop directly would have passed on the broken version too, so
 * the request goes out as opcode 8 and the chunk comes back the way Discord sends it.
 */

const GUILD_ID = '613425648685547541'
const USER_ID = '242043489611808769'

/** A member as a chunk carries it. */
function chunkMember(userId: string, name: string): unknown {
  return {
    user: { id: userId, username: name, discriminator: '0', avatar: null },
    roles: [],
    joined_at: '2024-01-01T00:00:00.000000+00:00',
    deaf: false,
    mute: false,
    flags: 0,
  }
}

/**
 * Waits for the shard to put opcode 8 on the wire.
 *
 * @remarks
 * `fetchMembers` is asynchronous all the way down — the chunker registers its pending entry,
 * then `await`s the shard's send — so the payload is not on the transport by the time the
 * call returns. Polled rather than slept on, so the test does not race a fixed delay.
 */
async function sentRequest(transport: ScriptedTransport): Promise<GatewaySendPayload> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const found = transport.sent.find(
      (payload) => payload.op === GatewayOpcodes.RequestGuildMembers,
    )
    if (found !== undefined) return found
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  throw new Error('no opcode 8 was sent')
}

describe('fetching members over the gateway', () => {
  it('FM1: caches what it fetched, into members and users both', async () => {
    // **The bug.** `fetchMembers` resolved with raw payload objects and kept none of them, so
    // the one call that exists to populate a guild's membership was also the one that left
    // the cache empty. A bot that fetched a thousand members still got `undefined` back from
    // `cache.member()` for every one of them.
    const { client, transports } = await scriptedClient({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
      // Both scopes are off by default — ADR 4 keeps the unbounded ones opt-in — so a client
      // that did not ask for them would show an empty cache whether or not `fetchMembers`
      // wrote to it, and this test would pass on the broken build.
      cache: { members: true, users: true },
    })
    const transport = transports[0]
    assert.ok(transport !== undefined)

    try {
      const pending = client.fetchMembers(GUILD_ID)
      const request = await sentRequest(transport)
      const { nonce } = request.d as { nonce: string }

      transport.dispatch(
        'GUILD_MEMBERS_CHUNK',
        {
          guild_id: GUILD_ID,
          members: [chunkMember(USER_ID, 'someone'), chunkMember('99', 'another')],
          chunk_index: 0,
          chunk_count: 1,
          nonce,
        },
        2,
      )

      const members = await pending

      // Structures, not payloads. The raw objects carried `user` and `joined_at`; these
      // carry the structure's own naming, which is what tells the two apart. Mapped rather
      // than indexed so both arrivals are checked and the order is part of the assertion.
      assert.deepEqual(
        members.map((member) => `${member.guildId}:${member.userId}`),
        [`${GUILD_ID}:${USER_ID}`, `${GUILD_ID}:99`],
      )

      // The point of the whole test.
      const cached = client.cache.member(GUILD_ID, USER_ID)
      assert.ok(cached !== undefined, 'the fetched member was not cached')
      assert.equal(cached.userId, USER_ID)
      assert.ok(
        client.cache.member(GUILD_ID, '99') !== undefined,
        'only the first member of the chunk was cached',
      )

      // `users` too, the same as GUILD_CREATE seeding does. A member without its user cached
      // is a member whose `username` nothing can answer.
      const user = client.cache.users.get(USER_ID)
      assert.ok(user !== undefined, 'the member arrived but its user was not cached')
      assert.equal(user.username, 'someone')
    } finally {
      await client.destroy()
    }
  })
})
