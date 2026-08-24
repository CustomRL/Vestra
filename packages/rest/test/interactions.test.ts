import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { InteractionResponseType, MessageFlags } from '@vestra/types'
import { REST } from '@vestra/rest'
import { json, startMockDiscord, type MockDiscord } from './mock-discord.ts'

/**
 * Interaction response endpoints.
 *
 * @remarks
 * Two properties separate these from every other route family, and both are asserted here
 * because both are invisible in the method signatures: they carry **no bot token**, and they
 * are **not queued** by the rate limiter.
 */

const APPLICATION_ID = '848285689866879046'
const INTERACTION_ID = '1234567890'
const TOKEN = 'aW50ZXJhY3Rpb24tdG9rZW4'

function clientFor(mock: MockDiscord): REST {
  return new REST({ api: mock.url, timeout: 2_000 }).setToken('t0ken')
}

describe('interaction responses', () => {
  it('IX1: replies on the callback route without the bot token', async () => {
    // **The reason `auth: false` is on every method here.** An interaction token is valid for
    // fifteen minutes and is the only credential Discord checks on these routes, so attaching
    // `Authorization` would put the bot token on the request path a bot makes most often, to
    // no purpose.
    const mock = await startMockDiscord((_request, response) => {
      response.writeHead(204).end()
    })
    try {
      await clientFor(mock).interactions.reply(INTERACTION_ID, TOKEN, {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: 'pong', flags: MessageFlags.Ephemeral },
      })

      const sent = mock.requests[0]
      assert.ok(sent)
      assert.equal(sent.method, 'POST')
      assert.equal(sent.url, `/v10/interactions/${INTERACTION_ID}/${TOKEN}/callback`)
      assert.equal(sent.headers.authorization, undefined, 'the bot token was sent')
      assert.deepEqual(JSON.parse(sent.body), {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: 'pong', flags: MessageFlags.Ephemeral },
      })
    } finally {
      await mock.close()
    }
  })

  it('IX2: reaches the original response through the webhook path, not the interaction one', async () => {
    // Discord splits these across two hosts' worth of route shape: the callback is under
    // `/interactions/{id}/{token}`, and everything afterwards is under
    // `/webhooks/{application_id}/{token}` — the application ID, not the interaction ID. Using
    // the interaction ID there is a 404 that reads like an expired token.
    const mock = await startMockDiscord((_request, response) => {
      json(response, 200, { id: 'm1', content: 'pong' })
    })
    try {
      const rest = clientFor(mock)
      await rest.interactions.getReply(APPLICATION_ID, TOKEN)
      await rest.interactions.editReply(APPLICATION_ID, TOKEN, { content: 'edited' })
      await rest.interactions.deleteReply(APPLICATION_ID, TOKEN)

      const paths = mock.requests.map((request) => `${request.method} ${request.url}`)
      assert.deepEqual(paths, [
        `GET /v10/webhooks/${APPLICATION_ID}/${TOKEN}/messages/@original`,
        `PATCH /v10/webhooks/${APPLICATION_ID}/${TOKEN}/messages/@original`,
        `DELETE /v10/webhooks/${APPLICATION_ID}/${TOKEN}/messages/@original`,
      ])
      for (const request of mock.requests) {
        assert.equal(request.headers.authorization, undefined)
      }
    } finally {
      await mock.close()
    }
  })

  it('IX3: sends followups to the webhook root and edits them by message ID', async () => {
    const mock = await startMockDiscord((_request, response) => {
      json(response, 200, { id: 'f1' })
    })
    try {
      const rest = clientFor(mock)
      await rest.interactions.followUp(APPLICATION_ID, TOKEN, { content: 'more' })
      await rest.interactions.editFollowUp(APPLICATION_ID, TOKEN, 'f1', { content: 'less' })
      await rest.interactions.deleteFollowUp(APPLICATION_ID, TOKEN, 'f1')

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `POST /v10/webhooks/${APPLICATION_ID}/${TOKEN}`,
          `PATCH /v10/webhooks/${APPLICATION_ID}/${TOKEN}/messages/f1`,
          `DELETE /v10/webhooks/${APPLICATION_ID}/${TOKEN}/messages/f1`,
        ],
      )
    } finally {
      await mock.close()
    }
  })

  it('IX4: does not queue interaction callbacks behind each other', async () => {
    // **The three-second deadline is why.** Every other route family is serialised per bucket,
    // and a queue would spend that budget waiting. `BucketRegistry` marks anything under
    // `/interactions/` as not serialised and exempt from the global limit, so a bot under load
    // can still answer interactions while its other traffic is throttled.
    //
    // Asserted by holding every response open until all of them have arrived: if the limiter
    // queued these, the second request would never be sent and this would time out.
    const arrived: (() => void)[] = []
    const allArrived = new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 2_000
      const poll = (): void => {
        if (arrived.length === 3) resolve()
        else if (Date.now() > deadline)
          reject(new Error('only ' + String(arrived.length) + ' of 3 arrived'))
        else setTimeout(poll, 5)
      }
      poll()
    })

    const mock = await startMockDiscord((_request, response) => {
      arrived.push(() => {
        response.writeHead(204).end()
      })
    })
    try {
      const rest = clientFor(mock)
      const sends = [
        // The **same** interaction ID for all three, deliberately. The bucket key includes the
        // major parameter, so three different IDs land in three different buckets and would run
        // concurrently even under a limiter that serialises everything — which is what an
        // earlier version of this test did, and it passed with serialisation forced on.
        rest.interactions.reply(INTERACTION_ID, TOKEN, { type: InteractionResponseType.Pong }),
        rest.interactions.reply(INTERACTION_ID, TOKEN, { type: InteractionResponseType.Pong }),
        rest.interactions.reply(INTERACTION_ID, TOKEN, { type: InteractionResponseType.Pong }),
      ]

      await allArrived
      assert.equal(arrived.length, 3, 'the callbacks were queued behind one another')

      for (const respond of arrived) respond()
      await Promise.all(sends)
    } finally {
      await mock.close()
    }
  })

  it('IX5: still queues an ordinary route, so IX4 is measuring something', async () => {
    // The control. Without this, IX4 would pass on a limiter that queued nothing at all.
    const arrived: (() => void)[] = []
    const mock = await startMockDiscord((_request, response) => {
      arrived.push(() => {
        json(response, 200, { ok: true })
      })
    })
    try {
      const rest = clientFor(mock)
      const sends = [
        rest.get('/channels/1/messages'),
        rest.get('/channels/1/messages'),
        rest.get('/channels/1/messages'),
      ]

      // Give the limiter every chance to send all three.
      await new Promise((resolve) => setTimeout(resolve, 150))
      assert.equal(arrived.length, 1, 'ordinary routes are supposed to be serialised')

      // Drain, so the promises settle and the server can close. Each response releases the
      // queue, which sends the next request, which arrives and is pushed here.
      for (let drained = 0; drained < 3; drained += 1) {
        const respond = arrived.shift()
        respond?.()
        await new Promise((resolve) => setTimeout(resolve, 30))
      }
      await Promise.all(sends)
    } finally {
      await mock.close()
    }
  })
})
