import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { APIGuildMember, APIRole } from '@vestra/types'
import { GuildMember, Role } from '@vestra/core'

const client = { name: 'test-client' }

function apiRole(overrides: Partial<APIRole> = {}): APIRole {
  return {
    id: '41771983423143936',
    name: 'Moderator',
    color: 0x5865f2,
    colors: { primary_color: 0x5865f2, secondary_color: null, tertiary_color: null },
    hoist: true,
    position: 5,
    permissions: '66321471',
    managed: false,
    mentionable: true,
    flags: 0,
    ...overrides,
  }
}

function apiMember(overrides: Partial<APIGuildMember> = {}): APIGuildMember {
  return {
    roles: ['41771983423143936'],
    joined_at: '2021-03-14T12:00:00.000000+00:00',
    deaf: false,
    mute: false,
    flags: 0,
    ...overrides,
  }
}

describe('Role structure', () => {
  it('R1: converts the nested colours rather than holding them by reference', () => {
    // One of the few nested payload objects a consumer reads directly. Held by reference it
    // would put `role.colors.primary_color` in user code, which is the thing the whole
    // conversion rule exists to prevent.
    const role = new Role(
      apiRole({ colors: { primary_color: 1, secondary_color: 2, tertiary_color: 3 } }),
      client,
    )

    assert.deepEqual(role.colors, { primaryColor: 1, secondaryColor: 2, tertiaryColor: 3 })
  })

  it('R2: identifies the @everyone role by its guild ID', () => {
    // Discord marks it by giving it the guild's own ID rather than a flag, so this is the
    // only way to tell.
    const guildId = '41771983423143937'
    assert.equal(new Role(apiRole({ id: guildId }), client).isEveryone(guildId), true)
    assert.equal(new Role(apiRole(), client).isEveryone(guildId), false)
  })

  it('R3: keeps a stable shape across construction and patch', () => {
    const sparse = new Role(apiRole(), client)
    const full = new Role(apiRole({ icon: 'hash', unicode_emoji: '🛡' }), client)
    assert.deepEqual(Object.keys(sparse), Object.keys(full))

    const before = Object.keys(sparse)
    sparse.patch(apiRole({ name: 'Admin' }))
    assert.deepEqual(Object.keys(sparse), before)
    assert.equal(sparse.name, 'Admin')
  })

  it('R4: renders a role mention', () => {
    assert.equal(String(new Role(apiRole(), client)), '<@&41771983423143936>')
  })
})

describe('GuildMember structure', () => {
  it('M1: keeps the raw ISO string and offers the Date beside it', () => {
    // The naming rule: `Timestamp` carries what Discord sent, the natural name allocates a
    // Date. `joined_at` converts mechanically to `joinedAt`, which would collide with the
    // getter — which is exactly the renaming bar §4.15 sets.
    const member = new GuildMember(apiMember(), client)

    assert.equal(member.joinedTimestamp, '2021-03-14T12:00:00.000000+00:00')
    assert.equal(member.joinedAt.getTime(), Date.parse('2021-03-14T12:00:00.000000+00:00'))
  })

  it('M2: does not parse dates eagerly', () => {
    // Most timestamps are never read, so parsing on construction pays for all of them to
    // serve the few. The stored value must still be the string.
    const member = new GuildMember(apiMember(), client)
    assert.equal(typeof member.joinedTimestamp, 'string')
    assert.equal(typeof member.premiumSinceTimestamp, 'undefined')
  })

  it('M3: reports null rather than an invalid Date for an absent timestamp', () => {
    const member = new GuildMember(apiMember(), client)
    assert.equal(member.premiumSince, null)
    assert.equal(member.communicationDisabledUntil, null)

    const boosting = new GuildMember(
      apiMember({ premium_since: '2022-01-01T00:00:00+00:00' }),
      client,
    )
    assert.equal(boosting.premiumSince?.getUTCFullYear(), 2022)
  })

  it('M4: treats an expired timeout as not timed out', () => {
    // Discord does not clear `communication_disabled_until` when a timeout expires, so the
    // field being set is not the same as the member being silenced. This is the check
    // consumers get wrong.
    const past = new GuildMember(
      apiMember({ communication_disabled_until: '2020-01-01T00:00:00+00:00' }),
      client,
    )
    const future = new GuildMember(
      apiMember({ communication_disabled_until: '2099-01-01T00:00:00+00:00' }),
      client,
    )

    assert.equal(past.isTimedOut(), false, 'a stale value must not read as timed out')
    assert.equal(future.isTimedOut(), true)
    assert.equal(new GuildMember(apiMember(), client).isTimedOut(), false)
  })

  it('M5: constructs the nested user eagerly, and only when present', () => {
    // Eager because any lazy conversion forces the structure to retain the raw payload,
    // which pins the whole parsed JSON graph for the structure's lifetime.
    const embedded = new GuildMember(apiMember(), client)
    assert.equal(embedded.user, undefined, 'an embedded member carries no user')
    assert.equal(embedded.id, undefined)

    const full = new GuildMember(
      apiMember({
        user: {
          id: '80351110224678912',
          username: 'nelly',
          discriminator: '0',
          global_name: null,
          avatar: null,
        },
      }),
      client,
    )
    assert.equal(full.user?.username, 'nelly')
    assert.equal(full.id, '80351110224678912')
  })

  it('M6: patches the nested user in place rather than replacing it', () => {
    // A consumer holding `member.user` must keep a live object across an update.
    const member = new GuildMember(
      apiMember({
        user: { id: '1', username: 'before', discriminator: '0', global_name: null, avatar: null },
      }),
      client,
    )
    const held = member.user

    member.patch(
      apiMember({
        user: { id: '1', username: 'after', discriminator: '0', global_name: null, avatar: null },
      }),
    )

    assert.equal(member.user, held, 'the user object must be the same reference')
    assert.equal(held?.username, 'after')
  })

  it('M7: prefers the nickname for the display name', () => {
    const user = {
      id: '1',
      username: 'nelly',
      discriminator: '0',
      global_name: 'Nelly',
      avatar: null,
    }

    assert.equal(new GuildMember(apiMember({ user, nick: 'Mod' }), client).displayName, 'Mod')
    assert.equal(new GuildMember(apiMember({ user }), client).displayName, 'Nelly')
    assert.equal(
      new GuildMember(apiMember({ user: { ...user, global_name: null } }), client).displayName,
      'nelly',
    )
  })

  it('M8: keeps a stable shape across construction and patch', () => {
    const sparse = new GuildMember(apiMember(), client)
    const full = new GuildMember(
      apiMember({ nick: 'Mod', pending: true, permissions: '8', premium_since: null }),
      client,
    )
    assert.deepEqual(Object.keys(sparse), Object.keys(full))

    const before = Object.keys(sparse)
    sparse.patch(apiMember({ nick: 'Renamed' }))
    assert.deepEqual(Object.keys(sparse), before)
    assert.equal(sparse.nick, 'Renamed')
  })
})
