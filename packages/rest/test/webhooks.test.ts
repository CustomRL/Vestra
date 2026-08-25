import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REST } from '@vestra/rest'
import { json, startMockDiscord, type MockDiscord } from './mock-discord.ts'

/**
 * Webhook endpoints, and the credential each one proves.
 *
 * @remarks
 * The property worth asserting is not the paths — it is that the token routes send **no bot
 * token**. A webhook's ID and token together are a credential in their own right, so
 * `GET|PATCH|DELETE /webhooks/{id}/{token}` and `execute` are unauthenticated, exactly like
 * the interaction callbacks and for the same reason: a webhook-relay process should not need
 * the bot token, and putting `Authorization` on the request it makes most often means it does.
 *
 * That is invisible in a method signature and survives compilation, which is what makes it
 * worth a test rather than a review comment.
 */

const CHANNEL = '290926798999357250'
const GUILD = '613425648685547541'
const WEBHOOK = '223704706495545344'
const WEBHOOK_TOKEN =
  '3d89bb7572e0fb30d8128367b3b1b44fecd1726de135cbe28a41f8b2f777c372ba2939e72279b94526ff5d1bd4358d65cf11'

/** Records every request and answers each with the given body. */
async function recording(body: unknown = {}, status = 200): Promise<MockDiscord> {
  return await startMockDiscord((_request, response) => {
    json(response, status, body)
  })
}

function clientFor(mock: MockDiscord): REST {
  return new REST({ api: mock.url, version: '10', timeout: 2_000 }).setToken('t0ken')
}

describe('webhook credentials', () => {
  it('WH1: sends the bot token on the authorised routes', async () => {
    const mock = await recording({ id: WEBHOOK })
    try {
      const rest = clientFor(mock)
      await rest.webhooks.get(WEBHOOK)
      await rest.webhooks.edit(WEBHOOK, { name: 'renamed' })
      await rest.webhooks.delete(WEBHOOK)

      assert.equal(mock.requests.length, 3)
      for (const request of mock.requests) {
        assert.equal(request.headers.authorization, 'Bot t0ken', `${request.method} ${request.url}`)
      }
    } finally {
      await mock.close()
    }
  })

  it('WH2: sends no bot token on any token route', async () => {
    // **The whole reason these are separate methods.** A relay process holding a webhook URL
    // should never need the bot token, and it would if these carried one.
    const mock = await recording({ id: WEBHOOK })
    try {
      const rest = clientFor(mock)
      await rest.webhooks.getWithToken(WEBHOOK, WEBHOOK_TOKEN)
      await rest.webhooks.editWithToken(WEBHOOK, WEBHOOK_TOKEN, { name: 'renamed' })
      await rest.webhooks.deleteWithToken(WEBHOOK, WEBHOOK_TOKEN)
      await rest.webhooks.execute(WEBHOOK, WEBHOOK_TOKEN, { content: 'hi' })

      assert.equal(mock.requests.length, 4)
      for (const request of mock.requests) {
        assert.equal(
          request.headers.authorization,
          undefined,
          `${request.method} ${request.url} carried a bot token`,
        )
      }
    } finally {
      await mock.close()
    }
  })

  it('WH3: executes without a token being set at all', async () => {
    // The consequence of WH2, and the case that proves it is real rather than incidental: a
    // client that has never seen a bot token can still relay through a webhook. An authorised
    // route on the same client throws instead.
    const mock = await recording({ id: '1' })
    try {
      const rest = new REST({ api: mock.url, version: '10', timeout: 2_000 })
      await rest.webhooks.execute(WEBHOOK, WEBHOOK_TOKEN, { content: 'hi' })
      assert.equal(mock.requests.length, 1)

      // **Immediately, and the timing is the assertion.** A missing token is a configuration
      // mistake and no retry makes one succeed -- but the check used to live inside the send
      // closure, which is what the retry loop wraps, so it cost four attempts and about five
      // seconds of exponential backoff to arrive at the error the first attempt already had.
      const started = Date.now()
      await assert.rejects(rest.webhooks.get(WEBHOOK), /before setToken/)
      const elapsed = Date.now() - started
      assert.ok(elapsed < 500, `took ${String(elapsed)}ms; an unretryable error was retried`)
    } finally {
      await mock.close()
    }
  })
})

describe('webhook routes', () => {
  it('WH4: creates and lists on the channel, and lists on the guild', async () => {
    const mock = await recording({ id: WEBHOOK })
    try {
      const rest = clientFor(mock)
      await rest.webhooks.create(CHANNEL, { name: 'relay' })
      await rest.webhooks.getForChannel(CHANNEL)
      await rest.webhooks.getForGuild(GUILD)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `POST /v10/channels/${CHANNEL}/webhooks`,
          `GET /v10/channels/${CHANNEL}/webhooks`,
          `GET /v10/guilds/${GUILD}/webhooks`,
        ],
      )
      assert.deepEqual(JSON.parse(mock.requests[0]?.body ?? ''), { name: 'relay' })
    } finally {
      await mock.close()
    }
  })

  it('WH5: puts wait and thread_id in the query, not the body', async () => {
    // `wait` decides whether Discord returns the message at all, and it is a query parameter.
    // Sent in the body it is silently ignored and the caller gets `undefined` back with no
    // indication why.
    const mock = await recording({ id: '1', content: 'hi' })
    try {
      await clientFor(mock).webhooks.execute(
        WEBHOOK,
        WEBHOOK_TOKEN,
        { content: 'hi' },
        { wait: true, thread_id: '999' },
      )
      const request = mock.requests[0]
      assert.ok(request !== undefined)

      assert.match(request.url, /[?&]wait=true(&|$)/)
      assert.match(request.url, /[?&]thread_id=999(&|$)/)
      assert.deepEqual(JSON.parse(request.body), { content: 'hi' })
    } finally {
      await mock.close()
    }
  })
})
