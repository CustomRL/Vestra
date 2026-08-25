import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REST } from '@vestra/rest'
import { ApplicationFlags, ApplicationIntegrationType } from '@vestra/types'
import { json, startMockDiscord, type MockDiscord, type RecordedRequest } from './mock-discord.ts'

/**
 * The application's own routes, the last REST family with none.
 *
 * @remarks
 * `client.application` is not a substitute for these. The gateway's READY carries
 * `{ id, flags }` and nothing else, so the description, install parameters, team, endpoints and
 * guild count have never been on a dispatch — which is easy to miss precisely because the
 * field exists and looks populated.
 *
 * The case worth having here is `AP3`. **The privileged intent flags come in pairs**: Discord
 * sets the plain flag when an application is verified and approved, and the `Limited` flag when
 * it is under a hundred guilds and has simply toggled the intent on in the portal. Both grant
 * the intent, and a check reading only the plain one reports a missing intent that is currently
 * in use — while the application is still small enough for that to be the common case.
 */

const APPLICATION = '292180391104217088'

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

describe('application routes', () => {
  it('AP1: separates the current application from one addressed by ID', async () => {
    // `@me` returns the owner view — team, endpoints, counts — and a snowflake returns the
    // public one. Same shape, different populated fields, and only one of them answers "how is
    // my bot configured".
    const mock = await recording({ id: APPLICATION, name: 'a bot' })
    try {
      const rest = clientFor(mock)
      await rest.applications.getCurrent()
      await rest.applications.get(APPLICATION)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        ['GET /v10/applications/@me', `GET /v10/applications/${APPLICATION}`],
      )
    } finally {
      await mock.close()
    }
  })

  it('AP2: edits with PATCH and sends only what it was given', async () => {
    // `integration_types_config` replaces the whole map, so a client that filled in absent
    // fields would make a context uninstallable on an unrelated description change.
    const mock = await recording({ id: APPLICATION })
    try {
      await clientFor(mock).applications.editCurrent({
        description: 'a better description',
        integration_types_config: {
          [ApplicationIntegrationType.GuildInstall]: {
            oauth2_install_params: { scopes: ['bot'], permissions: '0' },
          },
        },
      })
      const request = only(mock)

      assert.equal(request.method, 'PATCH')
      assert.equal(request.url, '/v10/applications/@me')
      assert.deepEqual(JSON.parse(request.body), {
        description: 'a better description',
        integration_types_config: {
          '0': { oauth2_install_params: { scopes: ['bot'], permissions: '0' } },
        },
      })
    } finally {
      await mock.close()
    }
  })

  it('AP3: reports an intent granted through the limited flag as granted', async () => {
    // The pair that catches people out. An application under a hundred guilds with
    // `MessageContent` toggled on in the portal carries `GatewayMessageContentLimited` and not
    // `GatewayMessageContent` — so a check for the plain flag alone says the intent is missing
    // while the bot is actively receiving message content.
    const limitedOnly = ApplicationFlags.GatewayMessageContentLimited
    const mock = await recording({ id: APPLICATION, name: 'a bot', flags: limitedOnly })
    try {
      const application = await clientFor(mock).applications.getCurrent()
      const flags = application.flags ?? 0

      assert.equal(
        (flags & ApplicationFlags.GatewayMessageContent) !== 0,
        false,
        'the plain flag is not set on an unverified application, which is the trap',
      )
      assert.equal(
        (flags &
          (ApplicationFlags.GatewayMessageContent |
            ApplicationFlags.GatewayMessageContentLimited)) !==
          0,
        true,
        'testing both flags is what actually answers whether the intent is granted',
      )
    } finally {
      await mock.close()
    }
  })

  it('AP4: reads the guild count without paging the guild list', async () => {
    // Cheaper than `users.getGuilds`, which pages at 200, and available before the gateway has
    // finished streaming them.
    const mock = await recording({ id: APPLICATION, name: 'a bot', approximate_guild_count: 4213 })
    try {
      const application = await clientFor(mock).applications.getCurrent()

      assert.equal(application.approximate_guild_count, 4213)
      assert.equal(only(mock).url, '/v10/applications/@me')
    } finally {
      await mock.close()
    }
  })
})
