import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MemberChunker, SystemTimers } from '@vestra/gateway'
import {
  GatewayIntentBits,
  GatewayOpcodes,
  type GatewayRequestGuildMembersData,
} from '@vestra/types'

/** A member with only the fields these tests care about. */
function member(id: string): never {
  return { user: { id } } as never
}

function chunker(intents?: number): {
  chunker: MemberChunker
  sent: GatewayRequestGuildMembersData[]
} {
  const sent: GatewayRequestGuildMembersData[] = []
  return {
    chunker: new MemberChunker(
      async (data) => {
        sent.push(data)
        await Promise.resolve()
      },
      SystemTimers,
      intents,
    ),
    sent,
  }
}

describe('member chunking', () => {
  it('reassembles chunks and completes on the last index', async () => {
    const { chunker: c, sent } = chunker()
    const pending = c.request({ guildId: '1', query: 'a', limit: 100 })
    await Promise.resolve()

    const nonce = sent[0]?.nonce
    assert.ok(nonce)

    c.handleChunk({
      guild_id: '1',
      members: [member('a')],
      chunk_index: 0,
      chunk_count: 3,
      nonce,
    })
    c.handleChunk({
      guild_id: '1',
      members: [member('b')],
      chunk_index: 1,
      chunk_count: 3,
      nonce,
    })
    // Completion is decided by the index, never by counting chunks received.
    c.handleChunk({
      guild_id: '1',
      members: [member('c')],
      chunk_index: 2,
      chunk_count: 3,
      nonce,
    })

    assert.equal((await pending).length, 3)
    assert.equal(c.pendingCount, 0)
  })

  it('keeps interleaved requests apart', async () => {
    // Chunks from concurrent requests arrive interleaved on one socket, which is exactly
    // what a running chunk count gets wrong.
    const { chunker: c, sent } = chunker()
    const first = c.request({ guildId: '1', userIds: ['a'] })
    await Promise.resolve()
    const second = c.request({ guildId: '2', userIds: ['b'] })
    await Promise.resolve()

    const nonceA = sent[0]?.nonce
    const nonceB = sent[1]?.nonce
    assert.ok(nonceA && nonceB && nonceA !== nonceB)

    c.handleChunk({
      guild_id: '2',
      members: [member('b1')],
      chunk_index: 0,
      chunk_count: 1,
      nonce: nonceB,
    })
    c.handleChunk({
      guild_id: '1',
      members: [member('a1')],
      chunk_index: 0,
      chunk_count: 2,
      nonce: nonceA,
    })
    c.handleChunk({
      guild_id: '1',
      members: [member('a2')],
      chunk_index: 1,
      chunk_count: 2,
      nonce: nonceA,
    })

    assert.equal((await second).length, 1)
    assert.equal((await first).length, 2)
  })

  it('generates a nonce inside the byte limit Discord enforces', async () => {
    // An over-long nonce is ignored rather than rejected, and the chunks then arrive with
    // no nonce at all — the request can never be correlated and the promise hangs.
    const { chunker: c, sent } = chunker()
    void c.request({ guildId: '1', userIds: ['a'] }).catch(() => undefined)
    await Promise.resolve()

    const nonce = sent[0]?.nonce
    assert.ok(nonce)
    assert.ok(Buffer.byteLength(nonce, 'utf8') <= 32)
    c.reset(new Error('done'))
  })

  it('refuses a request that mixes query and userIds', async () => {
    const { chunker: c } = chunker()
    await assert.rejects(c.request({ guildId: '1', query: 'a', userIds: ['b'] }), TypeError)
  })

  it('refuses more than 100 user ids', async () => {
    const { chunker: c } = chunker()
    const userIds = Array.from({ length: 101 }, (_v, i) => String(i))
    await assert.rejects(c.request({ guildId: '1', userIds }), RangeError)
  })

  it('gates a second all-members request for the same guild', async () => {
    // One request per guild per bot every 30 seconds. Gating locally turns a silent
    // RATE_LIMITED dispatch into an immediate, attributable error.
    const { chunker: c } = chunker()
    void c.request({ guildId: '1' }).catch(() => undefined)
    await Promise.resolve()

    await assert.rejects(c.request({ guildId: '1' }), /once per guild per 30 seconds/)
    // A different guild is unaffected.
    void c.request({ guildId: '2' }).catch(() => undefined)
    c.reset(new Error('done'))
  })

  it('treats retry_after as seconds, not milliseconds', async () => {
    // Reading it as milliseconds turns a 30 second backoff into 30ms and reproduces the
    // limit instantly.
    const { chunker: c, sent } = chunker()
    const pending = c.request({ guildId: '1', userIds: ['a'] })
    await Promise.resolve()

    const nonce = sent[0]?.nonce
    assert.ok(nonce)

    c.handleRateLimited({
      opcode: GatewayOpcodes.RequestGuildMembers,
      retry_after: 30,
      meta: { guild_id: '1', nonce },
    })

    await assert.rejects(pending, /retry in 30s/)
  })

  it('rejects everything outstanding on reset', async () => {
    // Chunks belong to a session; anything outstanding when one ends never arrives, and
    // leaving the promises pending leaks each callback and its closure.
    const { chunker: c } = chunker()
    const pending = c.request({ guildId: '1', userIds: ['a'] })
    await Promise.resolve()

    c.reset(new Error('the session ended'))

    await assert.rejects(pending, /the session ended/)
    assert.equal(c.pendingCount, 0)
  })

  it('rejects a request for every member without the GuildMembers intent', async () => {
    const { chunker: c, sent } = chunker(GatewayIntentBits.Guilds)

    await assert.rejects(
      async () => await c.request({ guildId: '1' }),
      /GuildMembers intent/,
      'an unanswerable request should fail immediately rather than time out',
    )
    assert.equal(sent.length, 0, 'nothing should reach the socket')
  })

  it('allows a query without the GuildMembers intent', async () => {
    const { chunker: c, sent } = chunker(GatewayIntentBits.Guilds)

    // Querying by username prefix is not gated on the intent; only the all-members form is.
    const pending = c.request({ guildId: '1', query: 'a', limit: 10 })
    await Promise.resolve()
    assert.equal(sent.length, 1)

    // Settle it, or the pending timeout outlives the test and rejects into the run.
    const nonce = sent[0]?.nonce
    assert.ok(nonce)
    c.handleChunk({
      guild_id: '1',
      members: [member('a')],
      chunk_index: 0,
      chunk_count: 1,
      nonce,
    })
    assert.equal((await pending).length, 1)
  })

  it('rejects presences without the GuildPresences intent', async () => {
    const { chunker: c, sent } = chunker(GatewayIntentBits.GuildMembers)

    await assert.rejects(
      async () => await c.request({ guildId: '1', presences: true }),
      /GuildPresences intent/,
    )
    assert.equal(sent.length, 0)
  })

  it('does not spend the per-guild allowance on a rejected request', async () => {
    const { chunker: c } = chunker(GatewayIntentBits.Guilds)

    await assert.rejects(async () => await c.request({ guildId: '1' }), /GuildMembers intent/)
    // The gate is 30s per guild. Had the rejected attempt consumed it, this second
    // rejection would name the interval rather than the intent.
    await assert.rejects(async () => await c.request({ guildId: '1' }), /GuildMembers intent/)
  })

  it('skips the intent checks when no intents were supplied', async () => {
    const { chunker: c, sent } = chunker()

    const pending = c.request({ guildId: '1' })
    await Promise.resolve()
    assert.equal(sent.length, 1, 'omitting intents should preserve the previous behaviour')

    const nonce = sent[0]?.nonce
    assert.ok(nonce)
    c.handleChunk({
      guild_id: '1',
      members: [member('a')],
      chunk_index: 0,
      chunk_count: 1,
      nonce,
    })
    assert.equal((await pending).length, 1)
  })
})
