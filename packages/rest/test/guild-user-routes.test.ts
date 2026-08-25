import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REST } from '@vestra/rest'
import { json, startMockDiscord, type MockDiscord, type RecordedRequest } from './mock-discord.ts'

/**
 * The member, ban, role, user and gateway routes, none of which had a test.
 *
 * @remarks
 * Same gap as the message routes and found the same way: these are consumer-facing, so the
 * cross-package reachability guard deliberately does not cover them, and nothing else was
 * asserting a verb or a path.
 *
 * Two of these are where a mistake is expensive rather than merely wrong. Banning is a `PUT`
 * whose body decides how much of the user's history is deleted, and a member edit is a
 * `PATCH` whose absent fields must stay absent — sending them as `null` clears a nickname and
 * every role the member has.
 */

const GUILD = '613425648685547541'
const USER = '80351110224678912'
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

describe('member routes', () => {
  it('GU1: fetches one member by path and pages the rest through the query', async () => {
    // `limit` and `after` are query parameters, and `after` is what makes the listing
    // paginate at all — Discord caps a page at 1000 and gives no cursor beyond the last ID.
    const mock = await recording({})
    try {
      const rest = clientFor(mock)
      await rest.members.get(GUILD, USER)
      await rest.members.getAll(GUILD, { limit: 1000, after: USER })

      assert.equal(at(mock, 0).method, 'GET')
      assert.equal(at(mock, 0).url, `/v10/guilds/${GUILD}/members/${USER}`)

      const listed = at(mock, 1)
      assert.match(listed.url, new RegExp(`^/v10/guilds/${GUILD}/members\\?`))
      assert.match(listed.url, /[?&]limit=1000(&|$)/)
      assert.match(listed.url, /[?&]after=80351110224678912(&|$)/)
    } finally {
      await mock.close()
    }
  })

  it('GU2: edits a member with PATCH and sends only what it was given', async () => {
    // **The expensive case.** `roles` on this route is a full replacement, so a client that
    // helpfully filled in absent fields would strip every role the member has. Timeouts ride
    // the same route as `communication_disabled_until`.
    const mock = await recording({})
    try {
      await clientFor(mock).members.edit(GUILD, USER, { nick: 'renamed' })
      const request = only(mock)

      assert.equal(request.method, 'PATCH')
      assert.equal(request.url, `/v10/guilds/${GUILD}/members/${USER}`)
      assert.deepEqual(JSON.parse(request.body), { nick: 'renamed' })
    } finally {
      await mock.close()
    }
  })

  it('GU3: adds and removes a member role with PUT and DELETE on one path', async () => {
    const mock = await recording()
    try {
      const rest = clientFor(mock)
      await rest.members.addRole(GUILD, USER, ROLE)
      await rest.members.removeRole(GUILD, USER, ROLE)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `PUT /v10/guilds/${GUILD}/members/${USER}/roles/${ROLE}`,
          `DELETE /v10/guilds/${GUILD}/members/${USER}/roles/${ROLE}`,
        ],
      )
    } finally {
      await mock.close()
    }
  })
})

describe('ban routes', () => {
  it('GU4: bans with PUT and carries the history window in the body', async () => {
    // **The other expensive case.** `delete_message_seconds` decides how much of the user's
    // history is destroyed, and it is a body field on a `PUT`. In the query it is ignored and
    // nothing is deleted; misread as days it deletes far more than intended.
    const mock = await recording()
    try {
      await clientFor(mock).bans.create(
        GUILD,
        USER,
        { delete_message_seconds: 604_800 },
        { reason: 'spam' },
      )
      const request = only(mock)

      assert.equal(request.method, 'PUT')
      assert.equal(request.url, `/v10/guilds/${GUILD}/bans/${USER}`)
      assert.deepEqual(JSON.parse(request.body), { delete_message_seconds: 604_800 })
      // The reason is a header on every route that takes one, never a body field.
      assert.equal(request.headers['x-audit-log-reason'], 'spam')
    } finally {
      await mock.close()
    }
  })

  it('GU5: reads and lifts a ban on the same path with GET and DELETE', async () => {
    const mock = await recording({})
    try {
      const rest = clientFor(mock)
      await rest.bans.get(GUILD, USER)
      await rest.bans.remove(GUILD, USER)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [`GET /v10/guilds/${GUILD}/bans/${USER}`, `DELETE /v10/guilds/${GUILD}/bans/${USER}`],
      )
    } finally {
      await mock.close()
    }
  })
})

describe('role and user routes', () => {
  it('GU6: lists and creates roles on the guild path', async () => {
    const mock = await recording([])
    try {
      const rest = clientFor(mock)
      await rest.roles.getAll(GUILD)
      await rest.roles.create(GUILD, { name: 'moderator' })

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [`GET /v10/guilds/${GUILD}/roles`, `POST /v10/guilds/${GUILD}/roles`],
      )
      assert.deepEqual(JSON.parse(at(mock, 1).body), { name: 'moderator' })
    } finally {
      await mock.close()
    }
  })

  it('GU7: distinguishes the current user from a user by ID', async () => {
    // `@me` and a snowflake are different paths with different permissions, and the only
    // thing separating them is one segment.
    const mock = await recording({})
    try {
      const rest = clientFor(mock)
      await rest.users.getCurrent()
      await rest.users.get(USER)
      await rest.users.editCurrent({ username: 'renamed' })

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        ['GET /v10/users/@me', `GET /v10/users/${USER}`, 'PATCH /v10/users/@me'],
      )
      assert.deepEqual(JSON.parse(at(mock, 2).body), { username: 'renamed' })
    } finally {
      await mock.close()
    }
  })

  it('GU8: opens a direct message by posting the recipient, not by path', async () => {
    // The recipient is a body field on `/users/@me/channels` rather than a path segment,
    // which is the one route where a user ID does not appear in the URL at all.
    const mock = await recording({ id: '1' })
    try {
      await clientFor(mock).users.createDM(USER)
      const request = only(mock)

      assert.equal(request.method, 'POST')
      assert.equal(request.url, '/v10/users/@me/channels')
      assert.deepEqual(JSON.parse(request.body), { recipient_id: USER })
    } finally {
      await mock.close()
    }
  })

  it('GU9: fetches gateway information with and without the bot budget', async () => {
    // `/gateway` is unauthenticated and returns only a URL; `/gateway/bot` carries the shard
    // recommendation and the session-start budget, and needs the token. Confusing them means
    // a fleet that cannot tell how many shards to spawn.
    const mock = await recording({ url: 'wss://gateway.discord.gg' })
    try {
      const rest = clientFor(mock)
      await rest.gateway.get()
      await rest.gateway.getBot()

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        ['GET /v10/gateway', 'GET /v10/gateway/bot'],
      )
    } finally {
      await mock.close()
    }
  })
})

describe('the routes the split made room for', () => {
  it('GU10: searches members by prefix through the query, needing no intent', async () => {
    // The practical way to turn a name into a member: unlike the full listing this needs no
    // privileged intent. It is a prefix match, so the query has to reach Discord intact —
    // in a body it is ignored and the route answers with one arbitrary member.
    const mock = await recording([])
    try {
      await clientFor(mock).members.search(GUILD, { query: 'nel', limit: 10 })
      const request = only(mock)

      assert.equal(request.method, 'GET')
      assert.match(request.url, new RegExp(`^/v10/guilds/${GUILD}/members/search\\?`))
      assert.match(request.url, /[?&]query=nel(&|$)/)
      assert.match(request.url, /[?&]limit=10(&|$)/)
      assert.equal(request.body, '')
    } finally {
      await mock.close()
    }
  })

  it('GU11: renames the bot through @me, which is a different permission', async () => {
    // `ChangeNickname` rather than `ManageNicknames`. One segment apart, and a bot that had to
    // hold the moderator permission to rename itself would be over-privileged everywhere.
    const mock = await recording({})
    try {
      await clientFor(mock).members.editCurrent(GUILD, { nick: 'the bot' })
      const request = only(mock)

      assert.equal(request.method, 'PATCH')
      assert.equal(request.url, `/v10/guilds/${GUILD}/members/@me`)
      assert.deepEqual(JSON.parse(request.body), { nick: 'the bot' })
    } finally {
      await mock.close()
    }
  })

  it('GU12: pages the ban list, which is unbounded', async () => {
    const mock = await recording([])
    try {
      await clientFor(mock).bans.getAll(GUILD, { limit: 1000, after: USER })
      const request = only(mock)

      assert.match(request.url, new RegExp(`^/v10/guilds/${GUILD}/bans\\?`))
      assert.match(request.url, /[?&]limit=1000(&|$)/)
      assert.match(request.url, new RegExp(`[?&]after=${USER}(&|$)`))
    } finally {
      await mock.close()
    }
  })

  it('GU13: returns both halves of a bulk ban, because partial success is normal', async () => {
    // An already-banned user, or one above the bot in the hierarchy, lands in `failed_users`
    // while the rest go through — and only a request where every ban fails throws. A caller
    // checking for an exception and nothing else would report success for a request that
    // banned nobody.
    const mock = await recording({ banned_users: [USER], failed_users: ['2'] })
    try {
      const result = await clientFor(mock).bans.createBulk(GUILD, {
        user_ids: [USER, '2'],
        delete_message_seconds: 3600,
      })
      const request = only(mock)

      assert.equal(request.method, 'POST')
      assert.equal(request.url, `/v10/guilds/${GUILD}/bulk-ban`)
      assert.deepEqual(result.banned_users, [USER])
      assert.deepEqual(result.failed_users, ['2'])
    } finally {
      await mock.close()
    }
  })

  it('GU14: moves roles with one PATCH on the collection', async () => {
    // Not one request per role. Positions are contiguous, so moving one renumbers others, and
    // a sequence of single edits passes through orderings nobody asked for.
    const mock = await recording([])
    try {
      await clientFor(mock).roles.setPositions(GUILD, [
        { id: ROLE, position: 3 },
        { id: '2', position: 2 },
      ])
      const request = only(mock)

      assert.equal(request.method, 'PATCH')
      assert.equal(request.url, `/v10/guilds/${GUILD}/roles`)
      assert.deepEqual(JSON.parse(request.body), [
        { id: ROLE, position: 3 },
        { id: '2', position: 2 },
      ])
    } finally {
      await mock.close()
    }
  })

  it('GU15: fetches one role by path, beside the listing', async () => {
    const mock = await recording({})
    try {
      const rest = clientFor(mock)
      await rest.roles.get(GUILD, ROLE)
      await rest.roles.getAll(GUILD)

      assert.deepEqual(
        mock.requests.map((request) => request.url),
        [`/v10/guilds/${GUILD}/roles/${ROLE}`, `/v10/guilds/${GUILD}/roles`],
      )
    } finally {
      await mock.close()
    }
  })
})
