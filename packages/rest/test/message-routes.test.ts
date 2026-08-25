import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REST } from '@vestra/rest'
import { json, startMockDiscord, type MockDiscord, type RecordedRequest } from './mock-discord.ts'

/**
 * The message and typing routes, which shipped with no test at all.
 *
 * @remarks
 * These are the oldest methods in the package and were the least verified: `getMessages`
 * through `bulkDeleteMessages`, plus `addReaction` and `triggerTyping`, had nothing asserting
 * their verb or their path. A type cannot check either — a `POST` where Discord wants a `PUT`
 * compiles, returns the declared TypeScript type, and fails only against Discord.
 *
 * The gap was found by a reachability sweep over the published surface rather than by review,
 * which is the useful part: consumer-facing route classes are deliberately outside the
 * cross-package reachability guard, so nothing else would ever have said so.
 */

const CHANNEL = '290926798999357250'
const MESSAGE = '334385199974967042'

/** Records every request and answers each with the given body. */
async function recording(body: unknown = {}): Promise<MockDiscord> {
  return await startMockDiscord((_request, response) => {
    json(response, 200, body)
  })
}

function clientFor(mock: MockDiscord): REST {
  return new REST({ api: mock.url, version: '10', timeout: 2_000 }).setToken('t0ken')
}

/** The nth request the mock received. */
function at(mock: MockDiscord, index: number): RecordedRequest {
  const request = mock.requests[index]
  assert.ok(request !== undefined, `expected a request at index ${String(index)}`)
  return request
}

/** The one request the mock received. */
function only(mock: MockDiscord): RecordedRequest {
  assert.equal(mock.requests.length, 1, 'expected exactly one request')
  return at(mock, 0)
}

describe('message routes', () => {
  it('MR1: pages messages through the query, and fetches one by path', async () => {
    // `before`/`after`/`around` are mutually exclusive to Discord and all three are query
    // parameters. In a body they are silently ignored and the caller gets the newest fifty
    // messages while believing they asked for older ones.
    const mock = await recording([])
    try {
      const rest = clientFor(mock)
      await rest.channels.getMessages(CHANNEL, { limit: 50, before: MESSAGE })
      await rest.channels.getMessage(CHANNEL, MESSAGE)

      const listed = at(mock, 0)
      assert.equal(listed.method, 'GET')
      assert.match(listed.url, new RegExp(`^/v10/channels/${CHANNEL}/messages\\?`))
      assert.match(listed.url, /[?&]limit=50(&|$)/)
      assert.match(listed.url, /[?&]before=334385199974967042(&|$)/)
      assert.equal(listed.body, '', 'a GET must not carry a body')

      assert.equal(at(mock, 1).method, 'GET')
      assert.equal(at(mock, 1).url, `/v10/channels/${CHANNEL}/messages/${MESSAGE}`)
    } finally {
      await mock.close()
    }
  })

  it('MR2: edits with PATCH and sends only what it was given', async () => {
    // A partial update. Sending the absent fields would blank an embed on a content edit,
    // which is the failure `patch` semantics exist to prevent.
    const mock = await recording({ id: MESSAGE })
    try {
      await clientFor(mock).channels.editMessage(CHANNEL, MESSAGE, { content: 'edited' })
      const request = only(mock)

      assert.equal(request.method, 'PATCH')
      assert.equal(request.url, `/v10/channels/${CHANNEL}/messages/${MESSAGE}`)
      assert.deepEqual(JSON.parse(request.body), { content: 'edited' })
    } finally {
      await mock.close()
    }
  })

  it('MR3: deletes one message by path and many through bulk-delete', async () => {
    // **Two different routes, and the difference is not cosmetic.** The single delete has no
    // age limit; bulk-delete refuses anything older than fourteen days and needs between two
    // and a hundred IDs. Sending one ID to bulk-delete is a `50016`, so a client that routed
    // every delete through it would fail on the commonest case of all.
    const mock = await recording()
    try {
      const rest = clientFor(mock)
      await rest.channels.deleteMessage(CHANNEL, MESSAGE)
      await rest.channels.bulkDeleteMessages(CHANNEL, [MESSAGE, '2'])

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `DELETE /v10/channels/${CHANNEL}/messages/${MESSAGE}`,
          `POST /v10/channels/${CHANNEL}/messages/bulk-delete`,
        ],
      )
      // The IDs go in a `messages` array, not as a bare array and not in the query.
      assert.deepEqual(JSON.parse(at(mock, 1).body), { messages: [MESSAGE, '2'] })
    } finally {
      await mock.close()
    }
  })

  it('MR4: adds a reaction with PUT on the @me path', async () => {
    // The mirror of `removeOwnReaction`, and the pair is where a verb typo hides: the same
    // path answers PUT and DELETE with opposite meanings.
    const mock = await recording()
    try {
      await clientFor(mock).channels.addReaction(CHANNEL, MESSAGE, '👍')
      const request = only(mock)

      assert.equal(request.method, 'PUT')
      assert.match(request.url, new RegExp(`^/v10/channels/${CHANNEL}/messages/${MESSAGE}/`))
      assert.match(request.url, /\/@me$/)
    } finally {
      await mock.close()
    }
  })

  it('MR5: keeps a custom emoji whole when adding, as when removing', async () => {
    // `name:id` is one path segment. A colon is a legal path character that nothing
    // normalises, so this is where the route's own encoding is observable — the unicode case
    // above passes even with every `encodeURIComponent` deleted.
    const mock = await recording()
    try {
      await clientFor(mock).channels.addReaction(CHANNEL, MESSAGE, 'blob:12345')
      const request = only(mock)

      assert.equal(
        request.url,
        `/v10/channels/${CHANNEL}/messages/${MESSAGE}/reactions/blob%3A12345/@me`,
      )
    } finally {
      await mock.close()
    }
  })

  it('MR6: triggers typing with POST and no body', async () => {
    const mock = await recording()
    try {
      await clientFor(mock).channels.triggerTyping(CHANNEL)
      const request = only(mock)

      assert.equal(request.method, 'POST')
      assert.equal(request.url, `/v10/channels/${CHANNEL}/typing`)
      assert.equal(request.body, '', 'the typing route takes no body')
    } finally {
      await mock.close()
    }
  })
})

describe('channel permission overwrites', () => {
  it('MR7: writes an overwrite with PUT and always sends the type', async () => {
    // `type` is not optional and cannot be inferred: a role ID and a user ID are both
    // snowflakes. Omitting it is a 400; getting it wrong writes an overwrite for an entity
    // that does not exist in that sense, and nothing complains.
    const mock = await recording()
    try {
      await clientFor(mock).channels.setPermission(
        CHANNEL,
        '41771983423143936',
        { allow: '1024', deny: '0', type: 0 },
        { reason: 'lockdown' },
      )
      const request = only(mock)

      assert.equal(request.method, 'PUT')
      assert.equal(request.url, `/v10/channels/${CHANNEL}/permissions/41771983423143936`)
      assert.deepEqual(JSON.parse(request.body), { allow: '1024', deny: '0', type: 0 })
      assert.equal(request.headers['x-audit-log-reason'], 'lockdown')
    } finally {
      await mock.close()
    }
  })

  it('MR8: deletes an overwrite rather than emptying it', async () => {
    // Removing the row returns the role or member to what the guild and category say. An
    // empty overwrite keeps a row meaning "inherit" — identical in effect, different in the
    // client, and reached by a different request.
    const mock = await recording()
    try {
      await clientFor(mock).channels.deletePermission(CHANNEL, '41771983423143936')
      const request = only(mock)

      assert.equal(request.method, 'DELETE')
      assert.equal(request.url, `/v10/channels/${CHANNEL}/permissions/41771983423143936`)
      assert.equal(request.body, '')
    } finally {
      await mock.close()
    }
  })
})
