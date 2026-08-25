import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REST } from '@vestra/rest'
import { json, startMockDiscord, type MockDiscord, type RecordedRequest } from './mock-discord.ts'

/**
 * Poll routes, and the webhook message routes that were missing beside `execute`.
 *
 * @remarks
 * A webhook could send a message and never read, edit or delete it. That is the gap a relay
 * process feels first, and it is the one place in this API where **not** sending the bot token
 * is the correct behaviour: a webhook's ID and token are a credential in their own right, and
 * a process that only relays should not need the bot's.
 *
 * Two shapes here are wrong in ways that compile:
 *
 * - **`thread_id` is a query parameter with nothing in the path to hint at it.** A webhook
 *   message in a thread answers 404 without it, for a message that plainly exists.
 * - **The poll voter listing is wrapped**, like the application emoji one, so a caller reading
 *   `.length` off the raw body gets `undefined`.
 */

const CHANNEL = '290926798999357250'
const MESSAGE = '334385199974967042'
const THREAD = '1537289867115892738'
const WEBHOOK = '223704706495545344'
const WEBHOOK_TOKEN = '3d89bb7572e0fb30d8128367b3b1b44fecd1726de135cbe28a41f8b2f777c372ba2939'

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

describe('poll routes', () => {
  it('PO1: unwraps the voter listing and pages it forwards only', async () => {
    // Wrapped in `{ users: [...] }`, so a caller reading `.length` off the raw body gets
    // `undefined` and a loop that never runs. There is no `before` — the listing walks
    // forwards from a user ID and that is all.
    const mock = await recording({ users: [{ id: '1', username: 'nelly' }] })
    try {
      const voters = await clientFor(mock).polls.getAnswerVoters(CHANNEL, MESSAGE, 2, {
        after: '1',
        limit: 100,
      })
      const request = only(mock)

      assert.equal(request.method, 'GET')
      assert.match(
        request.url,
        new RegExp(`^/v10/channels/${CHANNEL}/polls/${MESSAGE}/answers/2\\?`),
      )
      assert.match(request.url, /[?&]after=1(&|$)/)
      assert.ok(Array.isArray(voters))
      assert.equal(voters[0]?.username, 'nelly')
    } finally {
      await mock.close()
    }
  })

  it('PO2: ends a poll with POST to expire, which is not a delete', async () => {
    // The message survives and the results freeze. A client that routed this to DELETE would
    // remove the message and the poll with it.
    const mock = await recording({ id: MESSAGE })
    try {
      await clientFor(mock).polls.end(CHANNEL, MESSAGE)
      const request = only(mock)

      assert.equal(request.method, 'POST')
      assert.equal(request.url, `/v10/channels/${CHANNEL}/polls/${MESSAGE}/expire`)
      assert.equal(request.body, '')
    } finally {
      await mock.close()
    }
  })
})

describe('webhook message routes', () => {
  it('PO3: sends no bot token, because the webhook token is the credential', async () => {
    // The property the whole token family exists for. A relay process holding only a webhook
    // URL must be able to edit and delete what it sent.
    const mock = await recording({ id: MESSAGE })
    try {
      const rest = clientFor(mock)
      await rest.webhooks.getMessage(WEBHOOK, WEBHOOK_TOKEN, MESSAGE)
      await rest.webhooks.editMessage(WEBHOOK, WEBHOOK_TOKEN, MESSAGE, { content: 'edited' })
      await rest.webhooks.deleteMessage(WEBHOOK, WEBHOOK_TOKEN, MESSAGE)

      assert.equal(mock.requests.length, 3)
      for (const request of mock.requests) {
        assert.equal(
          request.headers.authorization,
          undefined,
          `${request.method} ${request.url} sent a bot token`,
        )
      }
    } finally {
      await mock.close()
    }
  })

  it('PO4: puts the thread in the query, where nothing in the path hints at it', async () => {
    // A webhook message inside a thread answers 404 without this, for a message that plainly
    // exists. The path is identical either way, which is what makes it a trap.
    const mock = await recording({ id: MESSAGE })
    try {
      await clientFor(mock).webhooks.getMessage(WEBHOOK, WEBHOOK_TOKEN, MESSAGE, {
        thread_id: THREAD,
      })
      const request = only(mock)

      assert.match(
        request.url,
        new RegExp(`^/v10/webhooks/${WEBHOOK}/${WEBHOOK_TOKEN}/messages/${MESSAGE}\\?`),
      )
      assert.match(request.url, new RegExp(`[?&]thread_id=${THREAD}(&|$)`))
    } finally {
      await mock.close()
    }
  })

  it('PO5: accepts @original as a message ID', async () => {
    // Discord's own alias for the message the last execute returned, which is how a caller
    // that did not keep the ID edits what it just sent.
    const mock = await recording({ id: MESSAGE })
    try {
      await clientFor(mock).webhooks.editMessage(WEBHOOK, WEBHOOK_TOKEN, '@original', {
        content: 'edited',
      })
      const request = only(mock)

      assert.equal(request.method, 'PATCH')
      assert.equal(request.url, `/v10/webhooks/${WEBHOOK}/${WEBHOOK_TOKEN}/messages/@original`)
      assert.deepEqual(JSON.parse(request.body), { content: 'edited' })
    } finally {
      await mock.close()
    }
  })
})
