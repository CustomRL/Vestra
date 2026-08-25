import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REST } from '@vestra/rest'
import { json, startMockDiscord, type MockDiscord, type RecordedRequest } from './mock-discord.ts'

/**
 * The reaction, pin, role and channel routes.
 *
 * @remarks
 * These assert the **method and the path**, because that is the whole of what a route method
 * is and it is the half a type cannot check. A `PUT` where Discord wants a `DELETE` compiles,
 * type-checks, returns the right TypeScript type, and fails at runtime against Discord and
 * nowhere else.
 *
 * The encoding case is narrower than it looks, and RT2 is the only one that proves anything.
 * A multi-byte emoji is percent-encoded by `fetch` on the way out whether or not the library
 * did it, so a unicode reaction path arrives identical either way — deleting every
 * `encodeURIComponent` from these routes leaves RT1 passing. A colon is a legal path character
 * that nothing normalises, so `name:id` is where the library's own encoding is observable.
 */

const CHANNEL = '290926798999357250'
const MESSAGE = '334385199974967042'
const GUILD = '613425648685547541'
const ROLE = '41771983423143936'
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

/** The one request the mock received. */
function only(mock: MockDiscord): RecordedRequest {
  assert.equal(mock.requests.length, 1, 'expected exactly one request')
  const request = mock.requests[0]
  assert.ok(request !== undefined)
  return request
}

describe('reaction routes', () => {
  it('RT1: removes the bot’s own reaction, from the @me path', async () => {
    // Deliberately not an encoding assertion: `fetch` percent-encodes a multi-byte character
    // on the way out regardless, so this passes with every `encodeURIComponent` deleted.
    // Verified by doing exactly that. What it does pin is the verb and the `@me` target, which
    // is what separates this from removing somebody else's reaction.
    const mock = await recording()
    try {
      await clientFor(mock).channels.removeOwnReaction(CHANNEL, MESSAGE, '👍')
      const request = only(mock)

      assert.equal(request.method, 'DELETE')
      assert.match(
        request.url,
        new RegExp(`^/v10/channels/${CHANNEL}/messages/${MESSAGE}/reactions/`),
      )
      assert.match(request.url, /\/@me$/)
    } finally {
      await mock.close()
    }
  })

  it('RT2: keeps a custom emoji whole, colon and all', async () => {
    // **The encoding guard, and the only one that works.** `name:id` is one path segment, and
    // a colon is a legal path character that nothing normalises on the way out — so unlike the
    // unicode case above, this fails the moment the route stops encoding. Removing
    // `encodeURIComponent` from these five routes fails here and nowhere else.
    const mock = await recording()
    try {
      await clientFor(mock).channels.removeUserReaction(CHANNEL, MESSAGE, 'blob:12345', USER)
      const request = only(mock)

      assert.equal(request.method, 'DELETE')
      assert.equal(
        request.url,
        `/v10/channels/${CHANNEL}/messages/${MESSAGE}/reactions/blob%3A12345/${USER}`,
      )
    } finally {
      await mock.close()
    }
  })

  it('RT3: separates clearing one emoji from clearing all of them', async () => {
    // Two different routes and two different blast radii: the emoji form removes one
    // reaction, the bare form removes every reaction on the message.
    const mock = await recording()
    try {
      const rest = clientFor(mock)
      await rest.channels.removeEmojiReactions(CHANNEL, MESSAGE, '👍')
      await rest.channels.removeAllReactions(CHANNEL, MESSAGE)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `DELETE /v10/channels/${CHANNEL}/messages/${MESSAGE}/reactions/${encodeURIComponent('👍')}`,
          `DELETE /v10/channels/${CHANNEL}/messages/${MESSAGE}/reactions`,
        ],
      )
    } finally {
      await mock.close()
    }
  })

  it('RT4: passes reaction pagination as a query rather than a body', async () => {
    const mock = await recording([])
    try {
      await clientFor(mock).channels.getReactions(CHANNEL, MESSAGE, '👍', {
        after: USER,
        limit: 50,
      })
      const request = only(mock)

      assert.equal(request.method, 'GET')
      assert.match(request.url, new RegExp(`^/v10/channels/${CHANNEL}/messages/${MESSAGE}/`))
      assert.match(request.url, /[?&]after=80351110224678912(&|$)/)
      assert.match(request.url, /[?&]limit=50(&|$)/)
      assert.equal(request.body, '', 'a GET must not carry a body')
    } finally {
      await mock.close()
    }
  })
})

describe('pin routes', () => {
  it('RT5: pins with PUT and unpins with DELETE on the same path', async () => {
    // The pair is the point: the same path with two verbs, which is exactly the shape a typo
    // survives compilation.
    const mock = await recording()
    try {
      const rest = clientFor(mock)
      await rest.channels.pinMessage(CHANNEL, MESSAGE)
      await rest.channels.unpinMessage(CHANNEL, MESSAGE)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `PUT /v10/channels/${CHANNEL}/pins/${MESSAGE}`,
          `DELETE /v10/channels/${CHANNEL}/pins/${MESSAGE}`,
        ],
      )
    } finally {
      await mock.close()
    }
  })

  it('RT6: reads pins from the channel, not from a message', async () => {
    const mock = await recording([])
    try {
      await clientFor(mock).channels.getPinnedMessages(CHANNEL)
      const request = only(mock)

      assert.equal(request.method, 'GET')
      assert.equal(request.url, `/v10/channels/${CHANNEL}/pins`)
    } finally {
      await mock.close()
    }
  })
})

describe('role and channel routes', () => {
  it('RT7: edits a role with PATCH and sends only what it was given', async () => {
    // A partial update. Sending the absent fields as `null` would blank the role's colour and
    // permissions on a rename, which is the failure `patch` semantics exist to avoid.
    const mock = await recording({ id: ROLE })
    try {
      await clientFor(mock).guilds.editRole(GUILD, ROLE, { name: 'renamed' })
      const request = only(mock)

      assert.equal(request.method, 'PATCH')
      assert.equal(request.url, `/v10/guilds/${GUILD}/roles/${ROLE}`)
      assert.deepEqual(JSON.parse(request.body), { name: 'renamed' })
    } finally {
      await mock.close()
    }
  })

  it('RT8: deletes a role without a body', async () => {
    const mock = await recording()
    try {
      await clientFor(mock).guilds.deleteRole(GUILD, ROLE, { reason: 'tidying up' })
      const request = only(mock)

      assert.equal(request.method, 'DELETE')
      assert.equal(request.url, `/v10/guilds/${GUILD}/roles/${ROLE}`)
      // The reason rides in a header, never in the body of a DELETE.
      assert.equal(request.headers['x-audit-log-reason'], 'tidying%20up')
    } finally {
      await mock.close()
    }
  })

  it('RT9: creates a channel with POST and lists them with GET', async () => {
    const mock = await recording({ id: '1' })
    try {
      const rest = clientFor(mock)
      await rest.guilds.createChannel(GUILD, { name: 'general', type: 0 })
      await rest.guilds.getChannels(GUILD)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [`POST /v10/guilds/${GUILD}/channels`, `GET /v10/guilds/${GUILD}/channels`],
      )
      assert.deepEqual(JSON.parse(mock.requests[0]?.body ?? ''), { name: 'general', type: 0 })
    } finally {
      await mock.close()
    }
  })
})
