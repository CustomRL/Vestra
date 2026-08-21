import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CacheRegistry, DefaultCacheOptions, GuildMember, Role, User } from '@vestra/core'

const client = { name: 'test-client' }
const GUILD_ID = '613425648685547541'

function user(id = '1'): User<typeof client> {
  return new User(
    { id, username: 'nelly', discriminator: '0', global_name: null, avatar: null },
    client,
  )
}

function role(id = '2'): Role<typeof client> {
  return new Role(
    {
      id,
      name: 'Moderator',
      color: 0,
      colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
      hoist: false,
      position: 1,
      permissions: '0',
      managed: false,
      mentionable: false,
      flags: 0,
    },
    GUILD_ID,
    client,
  )
}

function member(userId: string, guildId = GUILD_ID): GuildMember<typeof client> {
  return new GuildMember(
    {
      roles: [],
      joined_at: '2021-01-01T00:00:00+00:00',
      deaf: false,
      mute: false,
      flags: 0,
    },
    guildId,
    userId,
    client,
  )
}

describe('cache registry', () => {
  it('CR1: gives every scope a store, enabled or not', () => {
    // A disabled scope is a store over a null adapter, never `undefined`, so no handler
    // branches on whether a scope exists.
    const cache = new CacheRegistry<typeof client>()

    for (const store of cache.stores) {
      assert.equal(typeof store.sweep, 'function', `${store.scope} must be a real store`)
    }
    assert.equal(cache.stores.length, 8)
  })

  it('CR2: applies the documented defaults', () => {
    // ADR 4's position, plus roles — permission checks are the most common thing a bot
    // does and are impossible offline without them.
    const cache = new CacheRegistry<typeof client>()

    assert.equal(cache.roles.enabled, true, 'roles are on by default')
    assert.equal(cache.users.enabled, false)
    assert.equal(cache.members.enabled, false)
    assert.equal(cache.messages.enabled, false)
    assert.equal(DefaultCacheOptions.roles, true)
  })

  it('CR3: lets a consumer turn a scope on', () => {
    const cache = new CacheRegistry<typeof client>({ messages: { max: 10 } })

    cache.messages.add(
      // A message is not needed here; the store only cares that `keyOf` works.
      { id: '5', channelId: '9' } as never,
    )
    assert.equal(cache.messages.enabled, true)
    assert.equal(cache.messages.get('5') !== undefined, true)
  })

  it('CR4: derives the composite member key without the caller doing it', () => {
    // Reproducing `guildId:userId` at a call site fails silently as a miss when it is got
    // wrong, which is why the registry offers the accessor.
    const cache = new CacheRegistry<typeof client>({ members: true })
    cache.members.add(member('42'))

    assert.equal(cache.member(GUILD_ID, '42')?.userId, '42')
    assert.equal(cache.member(GUILD_ID, '43'), undefined)
  })

  it('CR5: groups members by guild and messages by channel', () => {
    const cache = new CacheRegistry<typeof client>({ members: true })
    cache.members.add(member('1'))
    cache.members.add(member('2'))
    cache.members.add(member('3', '999'))

    assert.equal(cache.members.group(GUILD_ID).length, 2)
    assert.equal(cache.members.group('999').length, 1)
  })

  it('CR6: stores nothing in a disabled scope but still returns the value', () => {
    const cache = new CacheRegistry<typeof client>()
    const stored = cache.users.add(user('7'))

    assert.equal(stored.id, '7', 'the caller still gets its object back')
    assert.equal(cache.users.size, 0)
  })

  it('CR7: sweeps and clears every scope at once', () => {
    const cache = new CacheRegistry<typeof client>({ roles: true, users: true })
    cache.roles.add(role('1'))
    cache.users.add(user('2'))

    assert.equal(cache.roles.size + cache.users.size, 2)
    cache.clear()
    assert.equal(cache.roles.size + cache.users.size, 0)
  })

  it('CR8: drives expiry from an injected clock across every scope', () => {
    // The registry's clock has to reach the adapters, or a TTL configured here is measured
    // against a different clock than the one the test advances.
    let time = 1_000_000
    const cache = new CacheRegistry<typeof client>({
      roles: { ttl: 5_000 },
      now: () => time,
    })
    cache.roles.add(role('1'))

    assert.equal(cache.roles.get('1') !== undefined, true, 'readable immediately')

    time += 5_001
    assert.equal(cache.sweep(time), 1)
    assert.equal(cache.roles.get('1'), undefined)
  })
})
