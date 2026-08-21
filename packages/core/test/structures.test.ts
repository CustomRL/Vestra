import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DiscordEpoch, type APIUser } from '@vestra/types'
import { Base, User, snowflakeDate, snowflakeTimestamp } from '@vestra/core'

/** A stand-in client. Structures only ever hand it back, so its shape is irrelevant here. */
const client = { name: 'test-client' }

/** A snowflake whose timestamp is a known offset past the Discord epoch. */
function snowflakeFor(msSinceEpoch: number): string {
  return String(BigInt(msSinceEpoch) << 22n)
}

function apiUser(overrides: Partial<APIUser> = {}): APIUser {
  return {
    id: '80351110224678912',
    username: 'nelly',
    discriminator: '0',
    global_name: 'Nelly',
    avatar: null,
    ...overrides,
  }
}

describe('snowflake reading', () => {
  it('S1: recovers the creation time from an ID', () => {
    const id = snowflakeFor(1_000)
    assert.equal(snowflakeTimestamp(id), DiscordEpoch + 1_000)
  })

  it('S2: survives IDs past the safe integer range', () => {
    // The reason snowflakes are strings at all. IDs passed 2^53 in 2015, so anything
    // routing one through `Number` corrupts the low bits — silently, and only for recent
    // IDs, which is the worst possible failure schedule.
    const recent = '1310000000000000000'
    assert.ok(Number(recent) > Number.MAX_SAFE_INTEGER, 'the fixture must exceed the safe range')

    const timestamp = snowflakeTimestamp(recent)
    assert.ok(Number.isSafeInteger(timestamp), 'the result must land back in the safe range')
    // Sanity: this ID is from late 2024, so the timestamp must be after 2024-01-01.
    assert.ok(timestamp > Date.parse('2024-01-01T00:00:00Z'))
  })

  it('S3: agrees between the number and Date forms', () => {
    const id = snowflakeFor(123_456)
    assert.equal(snowflakeDate(id).getTime(), snowflakeTimestamp(id))
  })
})

describe('User structure', () => {
  it('S4: mirrors the payload in camelCase', () => {
    const user = new User(apiUser({ global_name: 'Nelly', accent_color: 0x5865f2 }), client)

    assert.equal(user.id, '80351110224678912')
    assert.equal(user.username, 'nelly')
    assert.equal(user.globalName, 'Nelly')
    assert.equal(user.accentColor, 0x5865f2)
  })

  it('S5: hands back the client it was built with', () => {
    const user = new User(apiUser(), client)
    assert.equal(user.client, client)
    assert.ok(user instanceof Base)
  })

  it('S6: renders a tag for both account generations', () => {
    // Discord kept `discriminator` and changed its meaning to `'0'` rather than removing
    // it, so presence is not the test — the value is.
    assert.equal(new User(apiUser({ discriminator: '0' }), client).tag, 'nelly')
    assert.equal(new User(apiUser({ discriminator: '0001' }), client).tag, 'nelly#0001')
  })

  it('S7: gives every declared field a slot, whatever the payload omits', () => {
    // The hidden-class invariant, but not for the reason the design document gives.
    //
    // Under `useDefineForClassFields` — the default at target ES2023 — a bare field
    // declaration emits `bot;` into the class body, which defines the property as
    // `undefined` before the constructor runs. So the shape is fixed by the DECLARATION
    // list, and a constructor that skipped an absent field would not change it. Verified by
    // injecting `if (data.bot !== undefined)` around an assignment: this test still passed.
    //
    // A missing declaration cannot compile while the constructor still assigns it, so the
    // mistake this actually catches is the one that DOES compile: switching a field to
    // `declare` — which emits nothing — and then assigning it conditionally. Confirmed by
    // doing exactly that and watching this fail with a clean build. §4.16's `declare` form
    // is therefore the shape that needs this guard most.
    const sparse = new User(apiUser(), client)
    const full = new User(
      apiUser({ bot: true, system: false, banner: 'hash', accent_color: 1, public_flags: 64 }),
      client,
    )

    assert.deepEqual(
      Object.keys(sparse),
      Object.keys(full),
      'both payload shapes must produce the same own-property list',
    )
    assert.ok(Object.keys(sparse).includes('bot'), 'an absent field is still assigned')
    assert.equal(sparse.bot, undefined)
  })

  it('S8: keeps the shape stable across a patch', () => {
    // A patch that assigned in a different order, or skipped fields, would create a second
    // hidden class for exactly the objects that get updated most.
    const user = new User(apiUser(), client)
    const before = Object.keys(user)

    user.patch(apiUser({ username: 'renamed', bot: true }))

    assert.deepEqual(Object.keys(user), before)
    assert.equal(user.username, 'renamed')
    assert.equal(user.bot, true)
  })

  it('S9: mutates in place so held references see the update', () => {
    // The reason `patch` exists rather than constructing a replacement: a consumer holding
    // the old object must not be looking at a stale copy.
    const user = new User(apiUser(), client)
    const held = user

    user.patch(apiUser({ username: 'renamed' }))
    assert.equal(held.username, 'renamed')
  })

  it('S10: serialises to its own fields, without the client', () => {
    // The client lives in a private field behind a prototype getter, so this falls out
    // rather than needing a toJSON(). The consequence worth knowing: the result is
    // camelCase and is NOT an API payload — it cannot be posted back to Discord.
    const json = JSON.parse(JSON.stringify(new User(apiUser(), client))) as {
      username?: string
      globalName?: string
    }

    assert.equal(json.username, 'nelly')
    assert.equal('client' in json, false, 'the client must not be serialised')
    assert.equal('global_name' in json, false, 'the output is camelCase, not the wire format')
    assert.equal(json.globalName, 'Nelly')
  })

  it('S11: renders a mention', () => {
    assert.equal(String(new User(apiUser(), client)), '<@80351110224678912>')
  })
})
