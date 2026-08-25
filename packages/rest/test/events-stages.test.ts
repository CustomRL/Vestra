import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REST } from '@vestra/rest'
import {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
} from '@vestra/types'
import { json, startMockDiscord, type MockDiscord, type RecordedRequest } from './mock-discord.ts'

/**
 * Scheduled event and stage instance endpoints.
 *
 * @remarks
 * Both were modelled, both emitted their dispatches, and neither could be created. A bot could
 * announce an event it had no way to schedule and report a stage going live without being able
 * to start one.
 *
 * The two facts worth a test rather than a comment:
 *
 * - **A stage instance is addressed by its channel**, not by its own ID, on every route after
 *   creation. Passing `instance.id` gets a 404 for a stage that is plainly live, and nothing
 *   in a signature of two snowflakes can tell them apart.
 * - **Starting or cancelling an event is a `PATCH` with a `status`**, not a route of its own.
 *   An event is always created `Scheduled`.
 */

const GUILD = '613425648685547541'
const EVENT = '890202871068893186'
const CHANNEL = '290926798999357250'
const INSTANCE = '840647391636226060'

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

describe('scheduled event routes', () => {
  it('SE1: puts the subscriber-count flag in the query, not the body', async () => {
    // `with_user_count` is what makes `user_count` appear at all — it is never on a gateway
    // payload. In a body it is ignored and the field is silently absent, which reads as "no
    // subscribers" rather than as "you did not ask".
    const mock = await recording([])
    try {
      const rest = clientFor(mock)
      await rest.scheduledEvents.getForGuild(GUILD, { with_user_count: true })
      await rest.scheduledEvents.get(GUILD, EVENT, { with_user_count: true })

      assert.match(at(mock, 0).url, new RegExp(`^/v10/guilds/${GUILD}/scheduled-events\\?`))
      assert.match(at(mock, 0).url, /[?&]with_user_count=true(&|$)/)
      assert.match(at(mock, 1).url, /[?&]with_user_count=true(&|$)/)
      assert.equal(at(mock, 0).body, '', 'a GET must not carry a body')
    } finally {
      await mock.close()
    }
  })

  it('SE2: creates an external event with its metadata and end time', async () => {
    // The shape Discord enforces and the type cannot: an external event carries
    // `entity_metadata.location` and `scheduled_end_time` and no `channel_id`.
    const mock = await recording({ id: EVENT })
    try {
      await clientFor(mock).scheduledEvents.create(GUILD, {
        name: 'a meetup',
        privacy_level: GuildScheduledEventPrivacyLevel.GuildOnly,
        scheduled_start_time: '2026-01-01T18:00:00.000Z',
        scheduled_end_time: '2026-01-01T20:00:00.000Z',
        entity_type: GuildScheduledEventEntityType.External,
        entity_metadata: { location: 'a pub' },
      })
      const request = only(mock)

      assert.equal(request.method, 'POST')
      assert.equal(request.url, `/v10/guilds/${GUILD}/scheduled-events`)
      const body = JSON.parse(request.body) as Record<string, unknown>
      assert.equal(body.entity_type, GuildScheduledEventEntityType.External)
      assert.deepEqual(body.entity_metadata, { location: 'a pub' })
      assert.ok(!('channel_id' in body), 'an external event must not carry a channel')
    } finally {
      await mock.close()
    }
  })

  it('SE3: starts an event with a PATCH rather than a route of its own', async () => {
    const mock = await recording({ id: EVENT })
    try {
      await clientFor(mock).scheduledEvents.edit(GUILD, EVENT, {
        status: GuildScheduledEventStatus.Active,
      })
      const request = only(mock)

      assert.equal(request.method, 'PATCH')
      assert.equal(request.url, `/v10/guilds/${GUILD}/scheduled-events/${EVENT}`)
      assert.deepEqual(JSON.parse(request.body), {
        status: GuildScheduledEventStatus.Active,
      })
    } finally {
      await mock.close()
    }
  })

  it('SE4: pages subscribers through the query and can ask for their memberships', async () => {
    const mock = await recording([])
    try {
      await clientFor(mock).scheduledEvents.getSubscribers(GUILD, EVENT, {
        limit: 100,
        with_member: true,
        after: '1',
      })
      const request = only(mock)

      assert.match(
        request.url,
        new RegExp(`^/v10/guilds/${GUILD}/scheduled-events/${EVENT}/users\\?`),
      )
      assert.match(request.url, /[?&]with_member=true(&|$)/)
      assert.match(request.url, /[?&]after=1(&|$)/)
    } finally {
      await mock.close()
    }
  })

  it('SE5: deletes an event on its own path', async () => {
    const mock = await recording()
    try {
      await clientFor(mock).scheduledEvents.delete(GUILD, EVENT)
      const request = only(mock)

      assert.equal(request.method, 'DELETE')
      assert.equal(request.url, `/v10/guilds/${GUILD}/scheduled-events/${EVENT}`)
    } finally {
      await mock.close()
    }
  })
})

describe('stage instance routes', () => {
  it('ST1: addresses every route after create by the channel, not the instance', async () => {
    // The whole reason this file exists. The instance has an ID of its own, returns it, and it
    // is not what any of these paths take. Two snowflakes, no way for a signature to tell them
    // apart, and a 404 for a stage that is plainly live if the wrong one is passed.
    const mock = await recording({ id: INSTANCE, channel_id: CHANNEL })
    try {
      const rest = clientFor(mock)
      await rest.stageInstances.get(CHANNEL)
      await rest.stageInstances.edit(CHANNEL, { topic: 'a new topic' })
      await rest.stageInstances.delete(CHANNEL)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `GET /v10/stage-instances/${CHANNEL}`,
          `PATCH /v10/stage-instances/${CHANNEL}`,
          `DELETE /v10/stage-instances/${CHANNEL}`,
        ],
      )
      // Nothing anywhere carries the instance's own ID.
      for (const request of mock.requests) {
        assert.doesNotMatch(request.url, new RegExp(INSTANCE))
      }
    } finally {
      await mock.close()
    }
  })

  it('ST2: creates on the collection with the channel in the body', async () => {
    // Not a POST to the channel. The collection is the route, and the channel is a field —
    // which is the asymmetry that makes the addressing above easy to get wrong.
    const mock = await recording({ id: INSTANCE })
    try {
      await clientFor(mock).stageInstances.create({
        channel_id: CHANNEL,
        topic: 'a stage',
        send_start_notification: true,
      })
      const request = only(mock)

      assert.equal(request.method, 'POST')
      assert.equal(request.url, '/v10/stage-instances')
      assert.deepEqual(JSON.parse(request.body), {
        channel_id: CHANNEL,
        topic: 'a stage',
        send_start_notification: true,
      })
    } finally {
      await mock.close()
    }
  })

  it('ST3: edits without a channel, since the channel is the address', async () => {
    const mock = await recording({ id: INSTANCE })
    try {
      await clientFor(mock).stageInstances.edit(CHANNEL, { topic: 'renamed' }, { reason: 'typo' })
      const request = only(mock)

      assert.deepEqual(JSON.parse(request.body), { topic: 'renamed' })
      assert.equal(request.headers['x-audit-log-reason'], 'typo')
    } finally {
      await mock.close()
    }
  })
})
