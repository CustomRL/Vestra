import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REST } from '@vestra/rest'
import { json, startMockDiscord, type MockDiscord } from './mock-discord.ts'

/**
 * Application command registration.
 *
 * @remarks
 * The global and guild forms differ by one path segment and by an hour of propagation, which
 * is the whole reason they are separate methods. A test that only checked the bodies would
 * pass with the two swapped, and the symptom of that mistake is a command that appears to
 * register and then does not show up for an hour — or one registered globally that was meant
 * for a single test guild and now cannot be removed quickly.
 *
 * The verbs matter as much. `POST` updates an existing name rather than failing, so it can
 * never remove a command dropped from the source; `PUT` replaces the whole set and is the only
 * form that can. Sending one where the other was meant leaves commands registered forever, and
 * both compile.
 */

const APPLICATION = '848285689866879046'
const GUILD = '613425648685547541'
const COMMAND = '1537289867115892738'

/** Records every request and answers each with the given body. */
async function recording(body: unknown = {}): Promise<MockDiscord> {
  return await startMockDiscord((_request, response) => {
    json(response, 200, body)
  })
}

function clientFor(mock: MockDiscord): REST {
  return new REST({ api: mock.url, version: '10', timeout: 2_000 }).setToken('t0ken')
}

describe('global commands', () => {
  it('AC1: addresses global commands without a guild segment', async () => {
    const mock = await recording([])
    try {
      const rest = clientFor(mock)
      await rest.commands.getGlobal(APPLICATION)
      await rest.commands.createGlobal(APPLICATION, { name: 'ping', description: 'pong' })
      await rest.commands.editGlobal(APPLICATION, COMMAND, { description: 'changed' })
      await rest.commands.deleteGlobal(APPLICATION, COMMAND)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url.split('?')[0] ?? ''}`),
        [
          `GET /v10/applications/${APPLICATION}/commands`,
          `POST /v10/applications/${APPLICATION}/commands`,
          `PATCH /v10/applications/${APPLICATION}/commands/${COMMAND}`,
          `DELETE /v10/applications/${APPLICATION}/commands/${COMMAND}`,
        ],
      )
      for (const request of mock.requests) {
        assert.doesNotMatch(request.url, /guilds/, 'a global route carried a guild segment')
      }
    } finally {
      await mock.close()
    }
  })

  it('AC2: replaces the whole set with PUT, not POST', async () => {
    // **The distinction that decides whether a deleted command stays registered.** `POST`
    // updates an existing name and can never remove one; `PUT` replaces the set, so a command
    // dropped from the source disappears. Both compile, both take a body, and both come back
    // with commands — the verb is the only thing that says which happened.
    const mock = await recording([])
    try {
      const rest = clientFor(mock)
      const set = [{ name: 'ping', description: 'pong' }]
      await rest.commands.setGlobal(APPLICATION, set)
      await rest.commands.setForGuild(APPLICATION, GUILD, set)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `PUT /v10/applications/${APPLICATION}/commands`,
          `PUT /v10/applications/${APPLICATION}/guilds/${GUILD}/commands`,
        ],
      )
      // The body is the whole set, sent as an array. An object here would register one
      // command and silently delete the rest.
      for (const request of mock.requests) {
        assert.deepEqual(JSON.parse(request.body), set)
      }
    } finally {
      await mock.close()
    }
  })
})

describe('guild commands', () => {
  it('AC3: addresses guild commands through the guild segment', async () => {
    const mock = await recording([])
    try {
      const rest = clientFor(mock)
      await rest.commands.getForGuild(APPLICATION, GUILD)
      await rest.commands.createForGuild(APPLICATION, GUILD, { name: 'ping', description: 'pong' })
      await rest.commands.editForGuild(APPLICATION, GUILD, COMMAND, { description: 'changed' })
      await rest.commands.deleteForGuild(APPLICATION, GUILD, COMMAND)
      await rest.commands.getPermissions(APPLICATION, GUILD)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url.split('?')[0] ?? ''}`),
        [
          `GET /v10/applications/${APPLICATION}/guilds/${GUILD}/commands`,
          `POST /v10/applications/${APPLICATION}/guilds/${GUILD}/commands`,
          `PATCH /v10/applications/${APPLICATION}/guilds/${GUILD}/commands/${COMMAND}`,
          `DELETE /v10/applications/${APPLICATION}/guilds/${GUILD}/commands/${COMMAND}`,
          `GET /v10/applications/${APPLICATION}/guilds/${GUILD}/commands/permissions`,
        ],
      )
    } finally {
      await mock.close()
    }
  })

  it('AC4: sends with_localizations as a query rather than a body', async () => {
    // The batch reads omit the dictionaries by default and send a single localised name
    // instead, so asking for them is opt-in and belongs in the query.
    const mock = await recording([])
    try {
      const rest = clientFor(mock)
      await rest.commands.getGlobal(APPLICATION, { with_localizations: true })
      await rest.commands.getForGuild(APPLICATION, GUILD, { with_localizations: true })

      for (const request of mock.requests) {
        assert.match(request.url, /[?&]with_localizations=true(&|$)/)
        assert.equal(request.body, '', 'a GET must not carry a body')
      }
    } finally {
      await mock.close()
    }
  })
})
