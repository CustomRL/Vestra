import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REST } from '@vestra/rest'
import { json, startMockDiscord, type MockDiscord, type RecordedRequest } from './mock-discord.ts'

/**
 * The guild's own settings, which had no routes at all.
 *
 * @remarks
 * `PATCH /guilds/{id}` was the largest single absence in the REST surface: a library that
 * mirrors every field of a guild and emits `guildUpdate` could not change one of them.
 *
 * Three of these have a default or a shape that is wrong in a way nothing catches, and each
 * gets a case rather than a comment:
 *
 * - **Prune counts only members with no roles** unless `include_roles` says otherwise, so on a
 *   guild that auto-assigns a role on join the dry run answers zero and the prune removes
 *   nobody.
 * - **`compute_prune_count` defaults to `true`**, which times the request out on a large guild
 *   — after pruning.
 * - **Moving a channel between categories keeps its old overwrites** unless `lock_permissions`
 *   says otherwise, which is how a channel ends up in a private category and still readable.
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

describe('guild settings routes', () => {
  it('GS1: edits a guild with PATCH and sends only what it was given', async () => {
    // Every field here is a whole replacement, `features` most dangerously: it is the complete
    // list, so a client that filled in absent fields would strip features on a rename.
    const mock = await recording({ id: GUILD })
    try {
      await clientFor(mock).guilds.edit(GUILD, { name: 'renamed' }, { reason: 'rebrand' })
      const request = only(mock)

      assert.equal(request.method, 'PATCH')
      assert.equal(request.url, `/v10/guilds/${GUILD}`)
      assert.deepEqual(JSON.parse(request.body), { name: 'renamed' })
      assert.equal(request.headers['x-audit-log-reason'], 'rebrand')
    } finally {
      await mock.close()
    }
  })

  it('GS2: separates the prune dry run from the prune', async () => {
    // Different verbs on the same path, and only one of them removes anybody. A client that
    // routed both through POST would make "how many would this remove" destructive.
    const mock = await recording({ pruned: 3 })
    try {
      const rest = clientFor(mock)
      await rest.guilds.getPruneCount(GUILD, { days: 30, include_roles: ROLE })
      await rest.guilds.prune(GUILD, { days: 30, include_roles: [ROLE] })

      const dryRun = mock.requests[0]
      const real = mock.requests[1]
      assert.ok(dryRun !== undefined && real !== undefined)

      assert.equal(dryRun.method, 'GET')
      assert.match(dryRun.url, new RegExp(`^/v10/guilds/${GUILD}/prune\\?`))
      assert.match(dryRun.url, /[?&]days=30(&|$)/)
      // The dry run takes the roles as a comma-separated string in the query; the prune takes
      // an array in the body. Discord's own asymmetry, and swapping them is a silent no-op.
      assert.match(dryRun.url, new RegExp(`[?&]include_roles=${ROLE}(&|$)`))
      assert.equal(dryRun.body, '')

      assert.equal(real.method, 'POST')
      assert.equal(real.url, `/v10/guilds/${GUILD}/prune`)
      assert.deepEqual(JSON.parse(real.body), { days: 30, include_roles: [ROLE] })
    } finally {
      await mock.close()
    }
  })

  it('GS3: lets a caller turn the prune count off, since it times out on a big guild', async () => {
    // `compute_prune_count` defaults to true and makes the request wait for a count Discord
    // has to compute. On a large guild the route times out after the prune has happened, so
    // the caller sees an error for a request that worked.
    const mock = await recording({ pruned: null })
    try {
      const result = await clientFor(mock).guilds.prune(GUILD, { compute_prune_count: false })

      assert.deepEqual(JSON.parse(only(mock).body), { compute_prune_count: false })
      assert.equal(result.pruned, null)
    } finally {
      await mock.close()
    }
  })

  it('GS4: moves channels with one PATCH carrying the permission decision', async () => {
    // `lock_permissions` is the field that decides whether a moved channel adopts its new
    // category's overwrites. Omitting it keeps the old ones — a channel inside a private
    // category and still publicly readable, with nothing to indicate it.
    const mock = await recording()
    try {
      await clientFor(mock).guilds.setChannelPositions(GUILD, [
        { id: CHANNEL, position: 2, parent_id: '999', lock_permissions: true },
      ])
      const request = only(mock)

      assert.equal(request.method, 'PATCH')
      assert.equal(request.url, `/v10/guilds/${GUILD}/channels`)
      assert.deepEqual(JSON.parse(request.body), [
        { id: CHANNEL, position: 2, parent_id: '999', lock_permissions: true },
      ])
    } finally {
      await mock.close()
    }
  })

  it('GS5: reads the preview, vanity URL and regions on their own paths', async () => {
    const mock = await recording({})
    try {
      const rest = clientFor(mock)
      await rest.guilds.getPreview(GUILD)
      await rest.guilds.getVanityUrl(GUILD)
      await rest.guilds.getVoiceRegions(GUILD)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `GET /v10/guilds/${GUILD}/preview`,
          `GET /v10/guilds/${GUILD}/vanity-url`,
          `GET /v10/guilds/${GUILD}/regions`,
        ],
      )
    } finally {
      await mock.close()
    }
  })

  it('GS6: reads and edits the welcome screen', async () => {
    const mock = await recording({ description: null, welcome_channels: [] })
    try {
      const rest = clientFor(mock)
      await rest.guilds.getWelcomeScreen(GUILD)
      await rest.guilds.editWelcomeScreen(GUILD, { enabled: true })

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [`GET /v10/guilds/${GUILD}/welcome-screen`, `PATCH /v10/guilds/${GUILD}/welcome-screen`],
      )
      const edit = mock.requests[1]
      assert.ok(edit !== undefined)
      assert.deepEqual(JSON.parse(edit.body), { enabled: true })
    } finally {
      await mock.close()
    }
  })

  it('GS7: deletes a guild on its own path, which is not how a bot leaves one', async () => {
    const mock = await recording()
    try {
      await clientFor(mock).guilds.delete(GUILD)
      const request = only(mock)

      assert.equal(request.method, 'DELETE')
      assert.equal(request.url, `/v10/guilds/${GUILD}`)
    } finally {
      await mock.close()
    }
  })
})
