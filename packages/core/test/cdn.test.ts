import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  defaultAvatarUrl,
  guildIconUrl,
  GuildMember,
  isAnimatedHash,
  User,
  userAvatarUrl,
} from '@vestra/core'

const GUILD_ID = '613425648685547541'
const USER_ID = '80351110224678912'

function apiUser(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: USER_ID,
    username: 'nelly',
    discriminator: '0',
    global_name: null,
    avatar: null,
    ...overrides,
  }
}

describe('CDN URLs', () => {
  it('CDN1: picks GIF for an animated hash and PNG otherwise', () => {
    // The `a_` prefix is the only thing that marks an animated asset — there is no flag in the
    // payload. Requesting `.png` for one returns a still frame rather than an error, so getting
    // this wrong produces avatars that quietly stop moving.
    assert.equal(isAnimatedHash('a_1234'), true)
    assert.equal(isAnimatedHash('1234'), false)

    assert.ok(userAvatarUrl(USER_ID, 'a_1234').endsWith('.gif'))
    assert.ok(userAvatarUrl(USER_ID, '1234').endsWith('.png'))
  })

  it('CDN2: honours an explicit format over the hash', () => {
    // Asking for PNG on an animated hash is legitimate and gives the first frame.
    assert.ok(userAvatarUrl(USER_ID, 'a_1234', { format: 'png' }).endsWith('.png'))
  })

  it('CDN3: rejects a size Discord does not accept', () => {
    // A `size: 100` that silently 400s in production is worse than one that fails where it was
    // written.
    assert.equal(
      userAvatarUrl(USER_ID, '1234', { size: 128 }),
      `https://cdn.discordapp.com/avatars/${USER_ID}/1234.png?size=128`,
    )
    assert.throws(() => userAvatarUrl(USER_ID, '1234', { size: 100 }), RangeError)
    assert.throws(() => userAvatarUrl(USER_ID, '1234', { size: 8192 }), RangeError)
  })

  it('CDN4: uses the right default-avatar rule for each account generation', () => {
    // Two different rules over two different values. Applying the legacy one to a migrated
    // account gives everybody index 0, because `0 % 5` is `0`.
    const legacy = defaultAvatarUrl(USER_ID, '1234')
    assert.equal(legacy, `https://cdn.discordapp.com/embed/avatars/${String(1234 % 5)}.png`)

    // (80351110224678912 >> 22) % 6, computed outside the library.
    const shifted = Number((80351110224678912n >> 22n) % 6n)
    assert.equal(
      defaultAvatarUrl(USER_ID, '0'),
      `https://cdn.discordapp.com/embed/avatars/${String(shifted)}.png`,
    )
  })

  it('CDN5: shifts the snowflake as a bigint', () => {
    // A snowflake exceeds Number.MAX_SAFE_INTEGER, so `>>` on a number truncates it to 32 bits
    // and produces the wrong index. This ID is large enough for the two to disagree.
    const big = '1537289866205859882'
    const correct = Number((BigInt(big) >> 22n) % 6n)

    assert.equal(
      defaultAvatarUrl(big, '0'),
      `https://cdn.discordapp.com/embed/avatars/${String(correct)}.png`,
    )
  })
})

describe('CDN accessors on structures', () => {
  it('CDN6: always gives a user an avatar', () => {
    // Discord assigns one to anybody who has not set their own, so an accessor returning
    // undefined would put a fallback in every consumer and half would get the rule wrong.
    const none = new User(apiUser() as never, undefined)
    const set = new User(apiUser({ avatar: 'a_hash' }) as never, undefined)

    assert.ok(none.avatarUrl().includes('/embed/avatars/'))
    assert.ok(set.avatarUrl().endsWith('.gif'))
  })

  it('CDN7: reports no banner rather than inventing one', () => {
    // Discord assigns no default banner; a user without one has a solid colour the CDN does not
    // serve.
    assert.equal(new User(apiUser() as never, undefined).bannerUrl(), undefined)
    assert.ok(
      new User(apiUser({ banner: 'hash' }) as never, undefined).bannerUrl()?.includes('/banners/'),
    )
  })

  it('CDN8: prefers a member guild avatar over their user one', () => {
    // What the Discord client shows, and what a bot rendering a member should match.
    const member = new GuildMember(
      {
        user: apiUser({ avatar: 'user-hash' }),
        avatar: 'guild-hash',
        roles: [],
        joined_at: '2021-03-14T12:00:00.000000+00:00',
        deaf: false,
        mute: false,
        flags: 0,
      } as never,
      GUILD_ID,
      USER_ID,
      undefined,
    )

    const url = member.displayAvatarUrl()
    assert.ok(url?.includes(`/guilds/${GUILD_ID}/users/${USER_ID}/avatars/guild-hash`))
  })

  it('CDN9: falls through to the user avatar, then to the default', () => {
    const withUser = new GuildMember(
      {
        user: apiUser({ avatar: 'user-hash' }),
        roles: [],
        joined_at: '2021-03-14T12:00:00.000000+00:00',
        deaf: false,
        mute: false,
        flags: 0,
      } as never,
      GUILD_ID,
      USER_ID,
      undefined,
    )
    const embedded = new GuildMember(
      { roles: [], deaf: false, mute: false, flags: 0 } as never,
      GUILD_ID,
      USER_ID,
      undefined,
    )

    assert.ok(withUser.displayAvatarUrl()?.includes('/avatars/'))
    // An embedded member carries no user, so there is nothing to fall through to.
    assert.equal(embedded.displayAvatarUrl(), undefined)
  })

  it('CDN10: builds a guild icon on the icons path', () => {
    assert.equal(
      guildIconUrl(GUILD_ID, 'hash', { size: 256 }),
      `https://cdn.discordapp.com/icons/${GUILD_ID}/hash.png?size=256`,
    )
  })
})
