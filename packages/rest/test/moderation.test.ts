import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REST } from '@vestra/rest'
import { AuditLogEvent, AutoModerationRuleEventType } from '@vestra/types'
import { json, startMockDiscord, type MockDiscord, type RecordedRequest } from './mock-discord.ts'

/**
 * Audit log and auto-moderation endpoints.
 *
 * @remarks
 * Both had a payload, a structure and gateway events, and no way to ask a question or make a
 * change. A bot could watch auto-moderation act and not configure it, and could react to an
 * audit log entry live while being unable to read the 45 days behind it.
 *
 * What is worth asserting here is not the paths. It is that the audit log's filters go in the
 * query — a filter in a body is ignored, and the caller gets the newest fifty entries of every
 * kind while believing it asked for bans — and that a rule's fields reach Discord as sent,
 * since a rule created without `enabled` exists, appears in the client and does nothing.
 */

const GUILD = '613425648685547541'
const RULE = '969707018069872670'
const USER = '80351110224678912'
const CHANNEL = '290926798999357250'

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

describe('audit log route', () => {
  it('AL1: puts every filter in the query and sends no body', async () => {
    // A filter in a body is silently ignored: the request succeeds, and the caller gets the
    // newest fifty entries of every kind while believing it asked for one user's bans.
    const mock = await recording({ audit_log_entries: [] })
    try {
      await clientFor(mock).auditLogs.get(GUILD, {
        user_id: USER,
        action_type: AuditLogEvent.MemberBanAdd,
        before: '123',
        limit: 100,
      })
      const request = only(mock)

      assert.equal(request.method, 'GET')
      assert.match(request.url, new RegExp(`^/v10/guilds/${GUILD}/audit-logs\\?`))
      assert.match(request.url, new RegExp(`[?&]user_id=${USER}(&|$)`))
      assert.match(request.url, /[?&]action_type=22(&|$)/)
      assert.match(request.url, /[?&]before=123(&|$)/)
      assert.match(request.url, /[?&]limit=100(&|$)/)
      assert.equal(request.body, '', 'a GET must not carry a body')
    } finally {
      await mock.close()
    }
  })

  it('AL2: sends no query at all when asked for nothing', async () => {
    // The default path. An empty query object must not produce a bare `?`, which some proxies
    // and every rate-limit bucket key treat as a different route.
    const mock = await recording({ audit_log_entries: [] })
    try {
      await clientFor(mock).auditLogs.get(GUILD)

      assert.equal(only(mock).url, `/v10/guilds/${GUILD}/audit-logs`)
    } finally {
      await mock.close()
    }
  })

  it('AL3: returns the side lists, which are the reason the route is usable', async () => {
    // An entry names its executor and target by ID and nothing else. Discord ships the
    // referenced entities alongside so a caller does not make a request per row, and a client
    // that returned only `audit_log_entries` would throw that away.
    const mock = await recording({
      audit_log_entries: [{ id: '1', action_type: 22, target_id: USER, user_id: USER }],
      users: [{ id: USER, username: 'nelly' }],
      webhooks: [],
      integrations: [],
      threads: [],
      application_commands: [],
      auto_moderation_rules: [],
      guild_scheduled_events: [],
    })
    try {
      const log = await clientFor(mock).auditLogs.get(GUILD)

      assert.equal(log.audit_log_entries.length, 1)
      assert.equal(log.users[0]?.username, 'nelly')
    } finally {
      await mock.close()
    }
  })
})

describe('auto-moderation routes', () => {
  it('AM1: lists, fetches and deletes on the rules path', async () => {
    const mock = await recording([])
    try {
      const rest = clientFor(mock)
      await rest.autoModeration.getRules(GUILD)
      await rest.autoModeration.getRule(GUILD, RULE)
      await rest.autoModeration.delete(GUILD, RULE, { reason: 'obsolete' })

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `GET /v10/guilds/${GUILD}/auto-moderation/rules`,
          `GET /v10/guilds/${GUILD}/auto-moderation/rules/${RULE}`,
          `DELETE /v10/guilds/${GUILD}/auto-moderation/rules/${RULE}`,
        ],
      )
      assert.equal(at(mock, 2).headers['x-audit-log-reason'], 'obsolete')
    } finally {
      await mock.close()
    }
  })

  it('AM2: sends the rule exactly as given, `enabled` included', async () => {
    // A rule created without `enabled` defaults to off: it exists, shows up in the client, and
    // does nothing. A client that dropped the field — or helpfully defaulted it — would make
    // that behaviour unreachable in one direction or unavoidable in the other.
    const mock = await recording({ id: RULE })
    try {
      await clientFor(mock).autoModeration.create(GUILD, {
        name: 'no invites',
        event_type: AutoModerationRuleEventType.MessageSend,
        trigger_type: 1,
        trigger_metadata: { keyword_filter: ['discord.gg'] },
        actions: [{ type: 1, metadata: { custom_message: 'no' } }],
        enabled: true,
        exempt_channels: [CHANNEL],
      })
      const request = only(mock)

      assert.equal(request.method, 'POST')
      assert.equal(request.url, `/v10/guilds/${GUILD}/auto-moderation/rules`)
      assert.deepEqual(JSON.parse(request.body), {
        name: 'no invites',
        event_type: 1,
        trigger_type: 1,
        trigger_metadata: { keyword_filter: ['discord.gg'] },
        actions: [{ type: 1, metadata: { custom_message: 'no' } }],
        enabled: true,
        exempt_channels: [CHANNEL],
      })
    } finally {
      await mock.close()
    }
  })

  it('AM3: edits with PATCH and sends only what it was given', async () => {
    // `exempt_roles` and `exempt_channels` replace their lists, so a client that filled in
    // absent fields would un-exempt everything on an edit that only renamed the rule.
    const mock = await recording({ id: RULE })
    try {
      await clientFor(mock).autoModeration.edit(GUILD, RULE, { enabled: false })
      const request = only(mock)

      assert.equal(request.method, 'PATCH')
      assert.equal(request.url, `/v10/guilds/${GUILD}/auto-moderation/rules/${RULE}`)
      assert.deepEqual(JSON.parse(request.body), { enabled: false })
    } finally {
      await mock.close()
    }
  })
})
