import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REST } from '@vestra/rest'
import { GuildOnboardingMode, GuildOnboardingPromptType } from '@vestra/types'
import { json, startMockDiscord, type MockDiscord, type RecordedRequest } from './mock-discord.ts'

/**
 * Guild onboarding and the widget, the last two guild sub-resources with no routes.
 *
 * @remarks
 * Two things here are worth asserting rather than describing.
 *
 * **Onboarding is a `PUT`.** There is no partial edit and every field is required, so changing
 * one prompt means reading the whole configuration and writing it back. A client that offered
 * a `PATCH`-shaped method would let a caller wipe every prompt by renaming one.
 *
 * **The public widget route must not carry the bot token.** It is the one guild route that
 * needs no authentication, so sending one puts the bot's credential on a request that does not
 * want it — and hides that the route is readable by anybody with the guild ID.
 */

const GUILD = '613425648685547541'
const CHANNEL = '290926798999357250'
const ROLE = '41771983423143936'

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

describe('guild onboarding routes', () => {
  it('OW1: replaces the configuration with a PUT, never a PATCH', async () => {
    // There is no partial edit. A method shaped like a patch would let a caller wipe every
    // prompt by renaming one, so the verb is part of the contract rather than an accident.
    const mock = await recording({ guild_id: GUILD, prompts: [] })
    try {
      await clientFor(mock).guilds.setOnboarding(GUILD, {
        prompts: [
          {
            id: '1',
            type: GuildOnboardingPromptType.MultipleChoice,
            title: 'What are you here for?',
            single_select: false,
            required: false,
            in_onboarding: true,
            options: [
              {
                id: '2',
                title: 'Support',
                description: null,
                channel_ids: [CHANNEL],
                role_ids: [ROLE],
              },
            ],
          },
        ],
        default_channel_ids: [CHANNEL],
        enabled: true,
        mode: GuildOnboardingMode.Advanced,
      })
      const request = only(mock)

      assert.equal(request.method, 'PUT')
      assert.equal(request.url, `/v10/guilds/${GUILD}/onboarding`)

      const body = JSON.parse(request.body) as Record<string, unknown>
      assert.equal(body.enabled, true)
      assert.equal(body.mode, GuildOnboardingMode.Advanced)
      assert.deepEqual(body.default_channel_ids, [CHANNEL])
      // `in_onboarding` decides whether a prompt appears in the initial flow at all, so it has
      // to survive the round trip rather than being dropped as a read-only field.
      assert.equal((body.prompts as { in_onboarding: boolean }[])[0]?.in_onboarding, true)
    } finally {
      await mock.close()
    }
  })

  it('OW2: reads the configuration the write needs', async () => {
    const mock = await recording({ guild_id: GUILD, prompts: [] })
    try {
      await clientFor(mock).guilds.getOnboarding(GUILD)
      const request = only(mock)

      assert.equal(request.method, 'GET')
      assert.equal(request.url, `/v10/guilds/${GUILD}/onboarding`)
    } finally {
      await mock.close()
    }
  })
})

describe('guild widget routes', () => {
  it('OW3: sends no token on the public widget, and does on the settings', async () => {
    // The distinction the two routes exist for. `widget.json` is readable by anybody with the
    // guild ID; `widget` is the setting behind it and needs `ManageGuild`.
    const mock = await recording({ id: GUILD, name: 'a guild' })
    try {
      const rest = clientFor(mock)
      await rest.guilds.getWidget(GUILD)
      await rest.guilds.getWidgetSettings(GUILD)

      const [publicRequest, settingsRequest] = mock.requests
      assert.ok(publicRequest !== undefined && settingsRequest !== undefined)

      assert.equal(publicRequest.url, `/v10/guilds/${GUILD}/widget.json`)
      assert.equal(
        publicRequest.headers.authorization,
        undefined,
        'the public widget must not carry the bot token',
      )

      assert.equal(settingsRequest.url, `/v10/guilds/${GUILD}/widget`)
      assert.equal(settingsRequest.headers.authorization, 'Bot t0ken')
    } finally {
      await mock.close()
    }
  })

  it('OW4: edits the settings with PATCH on the settings path', async () => {
    const mock = await recording({ enabled: true, channel_id: CHANNEL })
    try {
      await clientFor(mock).guilds.editWidgetSettings(
        GUILD,
        { enabled: true, channel_id: CHANNEL },
        { reason: 'community launch' },
      )
      const request = only(mock)

      assert.equal(request.method, 'PATCH')
      assert.equal(request.url, `/v10/guilds/${GUILD}/widget`)
      assert.deepEqual(JSON.parse(request.body), { enabled: true, channel_id: CHANNEL })
      // Percent-encoded on the way out, which is what lets a reason carry a space or a
      // non-ASCII character without producing a header Discord rejects.
      assert.equal(request.headers['x-audit-log-reason'], 'community%20launch')
    } finally {
      await mock.close()
    }
  })
})
