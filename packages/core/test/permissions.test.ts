import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PermissionFlagsBits } from '@vestra/types'
import {
  ALL_PERMISSIONS,
  CacheRegistry,
  Guild,
  GuildMember,
  Role,
  type CacheCapable,
  applyTimeout,
  computeBasePermissions,
  computeOverwrites,
  isTimedOut,
  PermissionsBitField,
  type PermissionGuild,
  type PermissionMember,
  type PermissionOverwrite,
  type PermissionRole,
} from '@vestra/core'

const GUILD_ID = '613425648685547541'
const OWNER_ID = '80351110224678912'
const USER_ID = '82198898841029460'
const ROLE_A = '111'
const ROLE_B = '222'

const guild: PermissionGuild = { id: GUILD_ID, ownerId: OWNER_ID }

function member(overrides: Partial<PermissionMember> = {}): PermissionMember {
  return { userId: USER_ID, roles: [], ...overrides }
}

function role(id: string, permissions: bigint): PermissionRole {
  return { id, permissions: permissions.toString() }
}

function overwrite(id: string, type: 0 | 1, allow: bigint, deny: bigint): PermissionOverwrite {
  return { id, type, allow: allow.toString(), deny: deny.toString() }
}

describe('PermissionsBitField', () => {
  it('PB1: resolves names, decimal strings, bigints and arrays alike', () => {
    assert.equal(PermissionsBitField.resolve('SendMessages'), PermissionFlagsBits.SendMessages)
    assert.equal(PermissionsBitField.resolve('2048'), 2048n)
    assert.equal(PermissionsBitField.resolve(2048n), 2048n)
    assert.equal(
      PermissionsBitField.resolve(['SendMessages', 'ViewChannel']),
      PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel,
    )
  })

  it('PB2: throws on a string that is neither a name nor a decimal', () => {
    // Resolving a typo to "no permissions" produces a check that always fails, silently.
    assert.throws(() => PermissionsBitField.resolve('SendMesages'), TypeError)
    assert.throws(() => PermissionsBitField.resolve('0x800'), TypeError)
    assert.throws(() => PermissionsBitField.resolve(' 2048'), TypeError)
  })

  it('PB3: treats an administrator as having everything, but hasExact does not', () => {
    const admin = new PermissionsBitField(PermissionFlagsBits.Administrator)

    assert.equal(admin.has('BanMembers'), true)
    assert.equal(admin.hasExact('BanMembers'), false)
    assert.equal(admin.hasExact('Administrator'), true)
  })

  it('PB4: is immutable', () => {
    // A set that could be mutated in place would let a check change the thing it was checking.
    const original = new PermissionsBitField('SendMessages')
    const widened = original.add('BanMembers')

    assert.equal(original.hasExact('BanMembers'), false)
    assert.equal(widened.hasExact('BanMembers'), true)
    assert.notEqual(widened, original)
  })

  it('PB5: serialises as the decimal string Discord expects', () => {
    // `JSON.stringify` throws outright on a bigint, so a field holding the raw value would make
    // the whole payload unserialisable.
    const permissions = new PermissionsBitField(['SendMessages', 'ViewChannel'])
    const expected = (PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel).toString()

    assert.equal(permissions.toString(), expected)
    assert.equal(JSON.stringify({ permissions }), `{"permissions":"${expected}"}`)
  })

  it('PB6: covers every flag the types package defines', () => {
    // Computed rather than a literal, so a permission added upstream is not silently denied to
    // administrators and owners.
    const all = new PermissionsBitField(ALL_PERMISSIONS)
    assert.equal(all.toArray().length, Object.keys(PermissionFlagsBits).length)
  })
})

describe('base permissions', () => {
  it('PC1: gives the guild owner everything, whatever their roles say', () => {
    const owner = computeBasePermissions(guild, member({ userId: OWNER_ID }), [])
    assert.equal(owner.bits, ALL_PERMISSIONS)
  })

  it('PC2: gives an administrator everything', () => {
    const permissions = computeBasePermissions(guild, member({ roles: [ROLE_A] }), [
      role(GUILD_ID, 0n),
      role(ROLE_A, PermissionFlagsBits.Administrator),
    ])

    assert.equal(permissions.bits, ALL_PERMISSIONS)
  })

  it('PC3: includes @everyone, which is never in the member roles array', () => {
    // Discord marks @everyone by giving it the guild's own ID rather than a flag, and a
    // member's roles never list it. Miss that and every permission granted to the whole guild
    // disappears.
    const permissions = computeBasePermissions(guild, member(), [
      role(GUILD_ID, PermissionFlagsBits.ViewChannel),
    ])

    assert.equal(permissions.hasExact('ViewChannel'), true)
  })

  it('PC4: unions every role the member holds', () => {
    const permissions = computeBasePermissions(guild, member({ roles: [ROLE_A, ROLE_B] }), [
      role(GUILD_ID, 0n),
      role(ROLE_A, PermissionFlagsBits.SendMessages),
      role(ROLE_B, PermissionFlagsBits.BanMembers),
    ])

    assert.equal(permissions.hasExact(['SendMessages', 'BanMembers']), true)
  })

  it('PC5: understates rather than overstates when a role is not cached', () => {
    // A role the cache has not seen contributes nothing, which is the safe direction for a
    // check that gates an action.
    const permissions = computeBasePermissions(guild, member({ roles: [ROLE_A, 'uncached'] }), [
      role(GUILD_ID, 0n),
      role(ROLE_A, PermissionFlagsBits.SendMessages),
    ])

    assert.deepEqual(permissions.toArray(), ['SendMessages'])
  })
})

describe('channel overwrites', () => {
  const base = new PermissionsBitField(
    PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages,
  )

  it('PC6: applies the @everyone overwrite before anything else', () => {
    const permissions = computeOverwrites(base, guild, member(), [
      overwrite(GUILD_ID, 0, 0n, PermissionFlagsBits.SendMessages),
    ])

    assert.equal(permissions.hasExact('SendMessages'), false)
    assert.equal(permissions.hasExact('ViewChannel'), true)
  })

  it('PC7: accumulates role overwrites, so any allow beats any deny', () => {
    // The rule most easily got wrong. Applying each role overwrite in turn makes the answer
    // depend on the order Discord happened to send them in; accumulating makes an allow on one
    // role beat a deny on another, which is what Discord actually does.
    const denyThenAllow = computeOverwrites(base, guild, member({ roles: [ROLE_A, ROLE_B] }), [
      overwrite(ROLE_A, 0, 0n, PermissionFlagsBits.SendMessages),
      overwrite(ROLE_B, 0, PermissionFlagsBits.SendMessages, 0n),
    ])
    const allowThenDeny = computeOverwrites(base, guild, member({ roles: [ROLE_A, ROLE_B] }), [
      overwrite(ROLE_B, 0, PermissionFlagsBits.SendMessages, 0n),
      overwrite(ROLE_A, 0, 0n, PermissionFlagsBits.SendMessages),
    ])

    assert.equal(denyThenAllow.hasExact('SendMessages'), true)
    assert.equal(allowThenDeny.hasExact('SendMessages'), true)
    assert.equal(denyThenAllow.bits, allowThenDeny.bits)
  })

  it('PC8: lets a member overwrite beat the role overwrites', () => {
    const permissions = computeOverwrites(base, guild, member({ roles: [ROLE_A] }), [
      overwrite(ROLE_A, 0, PermissionFlagsBits.SendMessages, 0n),
      overwrite(USER_ID, 1, 0n, PermissionFlagsBits.SendMessages),
    ])

    assert.equal(permissions.hasExact('SendMessages'), false)
  })

  it('PC9: ignores overwrites for roles the member does not hold', () => {
    const permissions = computeOverwrites(base, guild, member(), [
      overwrite(ROLE_A, 0, 0n, PermissionFlagsBits.SendMessages),
    ])

    assert.equal(permissions.hasExact('SendMessages'), true)
  })

  it('PC10: ignores a member overwrite for somebody else', () => {
    const permissions = computeOverwrites(base, guild, member(), [
      overwrite('999', 1, 0n, PermissionFlagsBits.SendMessages),
    ])

    assert.equal(permissions.hasExact('SendMessages'), true)
  })

  it('PC11: skips overwrites entirely for an administrator', () => {
    const admin = new PermissionsBitField(PermissionFlagsBits.Administrator)
    const permissions = computeOverwrites(admin, guild, member(), [
      overwrite(GUILD_ID, 0, 0n, ALL_PERMISSIONS),
    ])

    assert.equal(permissions.bits, ALL_PERMISSIONS)
  })
})

describe('timeouts', () => {
  const NOW = 1_700_000_000_000

  it('PC12: reads the field as an expiry, not as a boolean', () => {
    // Discord leaves `communication_disabled_until` populated after the timeout passes rather
    // than clearing it, so "is this field set" reports everybody who has ever been timed out.
    const expired = member({
      communicationDisabledUntilTimestamp: new Date(NOW - 1000).toISOString(),
    })
    const active = member({
      communicationDisabledUntilTimestamp: new Date(NOW + 1000).toISOString(),
    })

    assert.equal(isTimedOut(expired, NOW), false)
    assert.equal(isTimedOut(active, NOW), true)
    assert.equal(isTimedOut(member(), NOW), false)
  })

  it('PC13: leaves a timed-out member only able to look', () => {
    const permissions = applyTimeout(
      new PermissionsBitField(ALL_PERMISSIONS),
      member({ communicationDisabledUntilTimestamp: new Date(NOW + 1000).toISOString() }),
      NOW,
    )

    assert.deepEqual(permissions.toArray().sort(), ['ReadMessageHistory', 'ViewChannel'])
  })

  it('PC14: times out an administrator too', () => {
    // The one place Administrator is not an escape from the calculation.
    const permissions = applyTimeout(
      new PermissionsBitField(PermissionFlagsBits.Administrator),
      member({ communicationDisabledUntilTimestamp: new Date(NOW + 1000).toISOString() }),
      NOW,
    )

    assert.equal(permissions.hasExact('Administrator'), false)
    assert.equal(permissions.has('SendMessages'), false)
  })

  it('PC15: leaves a member who is not timed out alone', () => {
    const original = new PermissionsBitField(ALL_PERMISSIONS)
    assert.equal(applyTimeout(original, member(), NOW), original)
  })
})

describe('the composed member accessor', () => {
  const NOW = 1_700_000_000_000
  const TIMED_OUT = new Date(NOW + 60_000).toISOString()

  function client(roles: PermissionRole[], ownerId = OWNER_ID): CacheCapable {
    const cache = new CacheRegistry({ guilds: true, roles: true })
    const context: CacheCapable = { cache }
    cache.guilds.add(
      new Guild(
        {
          id: GUILD_ID,
          name: 'g',
          icon: null,
          splash: null,
          discovery_splash: null,
          home_header: null,
          owner_id: ownerId,
          afk_channel_id: null,
          afk_timeout: 300,
          verification_level: 1,
          default_message_notifications: 0,
          explicit_content_filter: 0,
          roles: [],
          emojis: [],
          features: [],
          mfa_level: 0,
          application_id: null,
          system_channel_id: null,
          system_channel_flags: 0,
          rules_channel_id: null,
          vanity_url_code: null,
          description: null,
          banner: null,
          premium_tier: 0,
          preferred_locale: 'en-US',
          public_updates_channel_id: null,
          nsfw: false,
          nsfw_level: 0,
          premium_progress_bar_enabled: false,
          safety_alerts_channel_id: null,
          incidents_data: null,
        } as never,
        context,
      ),
    )
    for (const role of roles) {
      cache.roles.add(
        new Role(
          {
            id: role.id,
            name: 'r',
            color: 0,
            colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
            hoist: false,
            position: 0,
            permissions: role.permissions,
            managed: false,
            mentionable: false,
            flags: 0,
          },
          GUILD_ID,
          context,
        ),
      )
    }
    return context
  }

  function memberOf(
    context: CacheCapable,
    extra: Record<string, unknown> = {},
  ): GuildMember<CacheCapable> {
    return new GuildMember(
      { roles: [], deaf: false, mute: false, flags: 0, ...extra } as never,
      GUILD_ID,
      USER_ID,
      context,
    )
  }

  it('PC16: a channel overwrite does not hand back what a timeout took away', () => {
    // The bug this accessor exists to make impossible. Applying the timeout before overwrites
    // — which is what "compute guild-wide, then pass it to computeOverwrites" does — lets
    // `bits |= allow` re-grant SendMessages to a member who is silenced.
    const context = client([
      role(GUILD_ID, PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages),
    ])
    const member = memberOf(context, { communication_disabled_until: TIMED_OUT })
    const channel = {
      permissionOverwrites: [overwrite(GUILD_ID, 0, PermissionFlagsBits.SendMessages, 0n)],
    }

    const inChannel = member.permissionsIn(channel, NOW)

    assert.equal(inChannel.hasExact('SendMessages'), false, 'a timeout was undone by an overwrite')
    // The timeout masks down to ViewChannel and ReadMessageHistory, and keeps only what was
    // already granted — this member never had ReadMessageHistory to begin with.
    assert.deepEqual(inChannel.toArray(), ['ViewChannel'])
  })

  it('PC17: applies channel overwrites when a channel is given', () => {
    const context = client([role(GUILD_ID, PermissionFlagsBits.ViewChannel)])
    const member = memberOf(context)
    const channel = {
      permissionOverwrites: [overwrite(GUILD_ID, 0, PermissionFlagsBits.SendMessages, 0n)],
    }

    assert.equal(member.permissionsIn(undefined, NOW).hasExact('SendMessages'), false)
    assert.equal(member.permissionsIn(channel, NOW).hasExact('SendMessages'), true)
  })

  it('PC18: gives the guild owner everything, and a timed-out owner almost nothing', () => {
    const context = client([], USER_ID)
    assert.equal(memberOf(context).permissionsIn(undefined, NOW).bits, ALL_PERMISSIONS)

    const silenced = memberOf(context, { communication_disabled_until: TIMED_OUT })
    assert.equal(silenced.permissionsIn(undefined, NOW).hasExact('SendMessages'), false)
  })

  it('PC19: understates rather than overstates with the roles scope off', () => {
    const cache = new CacheRegistry({ guilds: false, roles: false })
    const context: CacheCapable = { cache }
    const member = new GuildMember<CacheCapable>(
      { roles: ['1'], deaf: false, mute: false, flags: 0 } as never,
      GUILD_ID,
      USER_ID,
      context,
    )

    assert.deepEqual(member.permissionsIn(undefined, NOW).toArray(), [])
  })
})
