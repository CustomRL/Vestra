import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REST } from '@vestra/rest'
import { json, startMockDiscord, type MockDiscord, type RecordedRequest } from './mock-discord.ts'

/**
 * The bot's own place in a guild, and the integrations a guild carries.
 *
 * @remarks
 * **Leaving a guild had no route.** The only thing named `delete` on a guild destroys it, and
 * that is not what a bot removing itself wants — the two are one segment apart in Discord's
 * docs and very far apart in consequence, so `UI1` keeps them distinct.
 *
 * The rest is the asymmetry between "me" and "anybody": reading the bot's own membership needs
 * no privileged intent, and reading an arbitrary member does. Same object, different route,
 * different requirement.
 */

const GUILD = '613425648685547541'
const INTEGRATION = '109248442633666560'

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

describe('current user routes', () => {
  it('UI1: leaves a guild through @me, which is not deleting it', async () => {
    // `DELETE /users/@me/guilds/{id}` removes the bot; `DELETE /guilds/{id}` destroys the
    // guild and works only for its owner. Both are a DELETE with a guild ID in the path.
    const mock = await recording()
    try {
      const rest = clientFor(mock)
      await rest.users.leaveGuild(GUILD)
      await rest.guilds.delete(GUILD)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [`DELETE /v10/users/@me/guilds/${GUILD}`, `DELETE /v10/guilds/${GUILD}`],
      )
    } finally {
      await mock.close()
    }
  })

  it('UI2: pages the guild listing and asks for counts explicitly', async () => {
    // Without `with_counts` the approximate counts are simply absent, which reads as an empty
    // guild rather than as an unanswered question.
    const mock = await recording([])
    try {
      await clientFor(mock).users.getGuilds({ limit: 200, after: GUILD, with_counts: true })
      const request = only(mock)

      assert.match(request.url, /^\/v10\/users\/@me\/guilds\?/)
      assert.match(request.url, /[?&]limit=200(&|$)/)
      assert.match(request.url, /[?&]with_counts=true(&|$)/)
      assert.match(request.url, new RegExp(`[?&]after=${GUILD}(&|$)`))
    } finally {
      await mock.close()
    }
  })

  it('UI3: reads its own membership on a different path from anybody else', async () => {
    // `/users/@me/guilds/{id}/member` needs no privileged intent; `/guilds/{id}/members/{id}`
    // needs `GuildMembers`. Same object, different route, different requirement.
    const mock = await recording({})
    try {
      await clientFor(mock).users.getGuildMember(GUILD)
      const request = only(mock)

      assert.equal(request.method, 'GET')
      assert.equal(request.url, `/v10/users/@me/guilds/${GUILD}/member`)
    } finally {
      await mock.close()
    }
  })

  it('UI4: reads connections, which a bot has none of', async () => {
    const mock = await recording([])
    try {
      await clientFor(mock).users.getConnections()

      assert.equal(only(mock).url, '/v10/users/@me/connections')
    } finally {
      await mock.close()
    }
  })
})

describe('guild integration routes', () => {
  it('UI5: lists and deletes integrations on the guild path', async () => {
    const mock = await recording([])
    try {
      const rest = clientFor(mock)
      await rest.guilds.getIntegrations(GUILD)
      await rest.guilds.deleteIntegration(GUILD, INTEGRATION, { reason: 'unused' })

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `GET /v10/guilds/${GUILD}/integrations`,
          `DELETE /v10/guilds/${GUILD}/integrations/${INTEGRATION}`,
        ],
      )
      const remove = mock.requests[1]
      assert.ok(remove !== undefined)
      // Worth a reason: deleting an integration deletes the role and webhooks it created, and
      // members holding that role lose it.
      assert.equal(remove.headers['x-audit-log-reason'], 'unused')
    } finally {
      await mock.close()
    }
  })
})
