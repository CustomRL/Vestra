import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REST } from '@vestra/rest'
import { json, startMockDiscord, type MockDiscord } from './mock-discord.ts'

/**
 * Invite and thread endpoints.
 *
 * @remarks
 * Two things here are worth a test rather than a review comment, and both are invisible in a
 * signature.
 *
 * An **invite code is not an ID.** Every other resource in the API is addressed by a snowflake
 * — digits, safe in a path, never needing encoding. A code is a user-visible string, and a
 * guild with the vanity feature chooses its own, so it is the one identifier that can contain
 * something a path cares about.
 *
 * A **thread is addressed as a channel**, and its membership sub-resource distinguishes `@me`
 * from a user ID. Those are two different permissions on paths that differ by one segment.
 */

const CHANNEL = '290926798999357250'
const MESSAGE = '334385199974967042'
const GUILD = '613425648685547541'
const THREAD = '1537289867115892738'
const USER = '80351110224678912'

/** Records every request and answers each with the given body. */
async function recording(body: unknown = {}): Promise<MockDiscord> {
  return await startMockDiscord((_request, response) => {
    json(response, 200, body)
  })
}

function clientFor(mock: MockDiscord): REST {
  return new REST({ api: mock.url, version: '10', timeout: 2_000 }).setToken('t0ken')
}

describe('invite routes', () => {
  it('IV1: encodes an invite code into the path', async () => {
    // A vanity code is chosen by the guild, so unlike every other identifier in the API it is
    // not guaranteed to be path-safe. A `/` in one would otherwise silently address a
    // different route.
    const mock = await recording({ code: 'a/b' })
    try {
      await clientFor(mock).invites.get('a/b')
      const request = mock.requests[0]
      assert.ok(request !== undefined)

      assert.equal(request.method, 'GET')
      assert.equal(request.url, '/v10/invites/a%2Fb')
    } finally {
      await mock.close()
    }
  })

  it('IV2: asks for counts through the query, since they are not returned by default', async () => {
    // Approximate counts cost Discord a scan it will not do unprompted, which is why they are
    // opt-in rather than always present.
    const mock = await recording({ code: 'abc' })
    try {
      await clientFor(mock).invites.get('abc', { with_counts: true, with_expiration: true })
      const request = mock.requests[0]
      assert.ok(request !== undefined)

      assert.match(request.url, /[?&]with_counts=true(&|$)/)
      assert.match(request.url, /[?&]with_expiration=true(&|$)/)
    } finally {
      await mock.close()
    }
  })

  it('IV3: creates and lists invites on the owner, not on the code namespace', async () => {
    // Addressing is the whole reason these are split: an invite is created against the channel
    // that owns it and fetched by a code that belongs to nothing.
    const mock = await recording({ code: 'abc' })
    try {
      const rest = clientFor(mock)
      await rest.channels.createInvite(CHANNEL, { max_age: 0, unique: true })
      await rest.channels.getInvites(CHANNEL)
      await rest.guilds.getInvites(GUILD)
      await rest.invites.delete('abc')

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `POST /v10/channels/${CHANNEL}/invites`,
          `GET /v10/channels/${CHANNEL}/invites`,
          `GET /v10/guilds/${GUILD}/invites`,
          'DELETE /v10/invites/abc',
        ],
      )
      assert.deepEqual(JSON.parse(mock.requests[0]?.body ?? ''), { max_age: 0, unique: true })
    } finally {
      await mock.close()
    }
  })
})

describe('thread routes', () => {
  it('TH1: starts a thread from a message on the message path, and standalone on the channel', async () => {
    // Two different routes with two different meanings: one anchors to a message and shares
    // its ID, the other does not exist in the message's context at all.
    const mock = await recording({ id: THREAD })
    try {
      const rest = clientFor(mock)
      await rest.channels.startThreadFromMessage(CHANNEL, MESSAGE, { name: 'discussion' })
      await rest.channels.startThread(CHANNEL, { name: 'private chat', type: 12 })

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `POST /v10/channels/${CHANNEL}/messages/${MESSAGE}/threads`,
          `POST /v10/channels/${CHANNEL}/threads`,
        ],
      )
    } finally {
      await mock.close()
    }
  })

  it('TH2: separates @me from a user ID on the membership routes', async () => {
    // Joining needs access to the thread; adding somebody else needs to be able to send in it.
    // The paths differ by one segment, which is exactly the shape a typo survives.
    const mock = await recording()
    try {
      const rest = clientFor(mock)
      await rest.channels.joinThread(THREAD)
      await rest.channels.leaveThread(THREAD)
      await rest.channels.addThreadMember(THREAD, USER)
      await rest.channels.removeThreadMember(THREAD, USER)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `PUT /v10/channels/${THREAD}/thread-members/@me`,
          `DELETE /v10/channels/${THREAD}/thread-members/@me`,
          `PUT /v10/channels/${THREAD}/thread-members/${USER}`,
          `DELETE /v10/channels/${THREAD}/thread-members/${USER}`,
        ],
      )
    } finally {
      await mock.close()
    }
  })

  it('TH3: lists thread members with the query, and guild threads from the guild', async () => {
    const mock = await recording([])
    try {
      const rest = clientFor(mock)
      await rest.channels.getThreadMembers(THREAD, { with_member: true, limit: 100 })
      await rest.guilds.getActiveThreads(GUILD)

      const members = mock.requests[0]
      assert.ok(members !== undefined)
      assert.match(members.url, new RegExp(`^/v10/channels/${THREAD}/thread-members\\?`))
      assert.match(members.url, /[?&]with_member=true(&|$)/)
      assert.match(members.url, /[?&]limit=100(&|$)/)

      assert.equal(mock.requests[1]?.url, `/v10/guilds/${GUILD}/threads/active`)
    } finally {
      await mock.close()
    }
  })
})
