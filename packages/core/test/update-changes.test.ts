import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GatewayIntentBits } from '@vestra/types'
import { scriptedClient, tick, type ScriptedTransport } from './scripted-client.ts'

/**
 * What the other update events report, and that the handlers pass it on.
 *
 * @remarks
 * Every case here drives a real shard, because the half most likely to be wrong is not the
 * `patch` — that is guarded structurally by `change-drift.test.ts` — but the handler that has
 * to take what `patch` returns and hand it to `emit`. A record computed and dropped on the
 * floor is precisely the defect that has bitten this repository before: `GuildReadyTracker`
 * ran, decided, and reported to a hook wired to `() => undefined`, and nothing noticed.
 *
 * The uncached branch is checked alongside each, because "there is no previous value" and
 * "nothing changed" are the same `null`, and a handler that forgot the argument entirely would
 * look identical to a correct one on the uncached path alone.
 */

const GUILD = '613425648685547541'
const USER = '80351110224678912'
const ROLE = '41771983423143936'

/** A guild payload complete enough for the handler to build a structure from. */
function guild(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: GUILD,
    name: 'before',
    owner_id: '1',
    roles: [],
    emojis: [],
    features: ['COMMUNITY'],
    channels: [],
    threads: [],
    members: [],
    voice_states: [],
    presences: [],
    stage_instances: [],
    guild_scheduled_events: [],
    unavailable: false,
    member_count: 1,
    joined_at: '2024-01-01T00:00:00.000000+00:00',
    large: false,
    verification_level: 0,
    default_message_notifications: 0,
    explicit_content_filter: 0,
    mfa_level: 0,
    premium_tier: 0,
    nsfw_level: 0,
    system_channel_flags: 0,
    afk_timeout: 300,
    ...overrides,
  }
}

/** A role payload, which `GUILD_ROLE_CREATE` and `GUILD_ROLE_UPDATE` both wrap. */
function role(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ROLE,
    name: 'moderator',
    color: 0,
    colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
    hoist: false,
    position: 1,
    permissions: '0',
    managed: false,
    mentionable: false,
    flags: 0,
    ...overrides,
  }
}

/** The user every member payload here belongs to. */
const MEMBER_USER = { id: USER, username: 'nelly', discriminator: '0', avatar: null }

/** A member payload as `GUILD_MEMBER_ADD` and `GUILD_MEMBER_UPDATE` send it. */
function member(roles: readonly string[]): Record<string, unknown> {
  return {
    guild_id: GUILD,
    user: MEMBER_USER,
    roles,
    joined_at: '2024-01-01T00:00:00.000000+00:00',
    deaf: false,
    mute: false,
  }
}

/** A presence payload. */
function presence(status: string, activities: readonly unknown[]): Record<string, unknown> {
  return {
    user: { id: USER },
    guild_id: GUILD,
    status,
    activities,
    client_status: { desktop: status },
  }
}

/** Builds a client with the given scopes turned on and returns its socket. */
async function clientWith(cache: Record<string, boolean> = {}): Promise<{
  client: Awaited<ReturnType<typeof scriptedClient>>['client']
  socket: ScriptedTransport
}> {
  const { client, transports } = await scriptedClient({
    intents: [GatewayIntentBits.Guilds],
    ...(Object.keys(cache).length > 0 ? { cache } : {}),
  })
  const socket = transports[0]
  assert.ok(socket !== undefined)
  return { client, socket }
}

describe('guild, role and member change records', () => {
  it('UC1: guildUpdate reports the previous name and the previous features', async () => {
    const { client, socket } = await clientWith()
    const seen: unknown[] = []
    client.on('guildUpdate', (_guild, changes) => {
      seen.push(changes)
    })

    try {
      socket.dispatch('GUILD_CREATE', guild(), 10)
      await tick()
      socket.dispatch('GUILD_UPDATE', guild({ name: 'after', features: ['COMMUNITY', 'NEWS'] }), 11)
      await tick()

      assert.deepEqual(seen, [{ name: 'before', features: ['COMMUNITY'] }])
    } finally {
      await client.destroy()
    }
  })

  it('UC2: guildUpdate reports nothing when the payload repeats itself', async () => {
    // `features` is the field that makes this worth asserting. It is required on the payload,
    // so it arrives freshly parsed on every dispatch and a reference comparison would report
    // it as changed every time — leaving the record non-null forever.
    const { client, socket } = await clientWith()
    const seen: unknown[] = []
    client.on('guildUpdate', (_guild, changes) => {
      seen.push(changes)
    })

    try {
      socket.dispatch('GUILD_CREATE', guild(), 10)
      await tick()
      socket.dispatch('GUILD_UPDATE', guild(), 11)
      await tick()

      assert.deepEqual(seen, [null])
    } finally {
      await client.destroy()
    }
  })

  it('UC3: roleUpdate reports the previous permissions, after the guild ID', async () => {
    // Roles are cached by default, so this is the populated path without any configuration.
    // The record is the third argument: the guild ID already sat second and moving it would
    // have broken every existing listener for the sake of tidiness.
    const { client, socket } = await clientWith()
    const seen: { guildId: string; changes: unknown }[] = []
    client.on('roleUpdate', (_role, guildId, changes) => {
      seen.push({ guildId, changes })
    })

    try {
      socket.dispatch('GUILD_ROLE_CREATE', { guild_id: GUILD, role: role() }, 10)
      await tick()
      socket.dispatch(
        'GUILD_ROLE_UPDATE',
        { guild_id: GUILD, role: role({ permissions: '8', name: 'admin' }) },
        11,
      )
      await tick()

      assert.deepEqual(seen, [{ guildId: GUILD, changes: { name: 'moderator', permissions: '0' } }])
    } finally {
      await client.destroy()
    }
  })

  it('UC4: roleUpdate reports nothing for an unchanged role, colours included', async () => {
    // `colors` is rebuilt into a fresh object by every patch, so a reference comparison would
    // report a colour change on every role update Discord sends.
    const { client, socket } = await clientWith()
    const seen: unknown[] = []
    client.on('roleUpdate', (_role, _guildId, changes) => {
      seen.push(changes)
    })

    try {
      socket.dispatch('GUILD_ROLE_CREATE', { guild_id: GUILD, role: role() }, 10)
      await tick()
      socket.dispatch('GUILD_ROLE_UPDATE', { guild_id: GUILD, role: role() }, 11)
      await tick()

      assert.deepEqual(seen, [null])
    } finally {
      await client.destroy()
    }
  })

  it('UC5: guildMemberUpdate reports the previous roles, which is the whole point', async () => {
    // Without this there is no way to tell which role was added: the member carries the new
    // list and the old one was overwritten in place.
    const { client, socket } = await clientWith({ members: true, users: true })
    const seen: unknown[] = []
    client.on('guildMemberUpdate', (_member, changes) => {
      seen.push(changes)
    })

    try {
      socket.dispatch('GUILD_MEMBER_ADD', member([ROLE]), 10)
      await tick()
      socket.dispatch('GUILD_MEMBER_UPDATE', { ...member([ROLE, '2']), nick: 'renamed' }, 11)
      await tick()

      assert.deepEqual(seen, [{ nick: undefined, roles: [ROLE] }])
    } finally {
      await client.destroy()
    }
  })

  it('UC6: guildMemberUpdate reports nothing when the role list is unchanged', async () => {
    const { client, socket } = await clientWith({ members: true, users: true })
    const seen: unknown[] = []
    client.on('guildMemberUpdate', (_member, changes) => {
      seen.push(changes)
    })

    try {
      socket.dispatch('GUILD_MEMBER_ADD', member([ROLE]), 10)
      await tick()
      socket.dispatch('GUILD_MEMBER_UPDATE', member([ROLE]), 11)
      await tick()

      assert.deepEqual(seen, [null])
    } finally {
      await client.destroy()
    }
  })
})

describe('presence and user change records', () => {
  it('UC7: presenceUpdate reports the previous status and ignores the activities', async () => {
    const { client, socket } = await clientWith({ presences: true })
    const seen: unknown[] = []
    client.on('presenceUpdate', (_presence, changes) => {
      seen.push(changes)
    })

    try {
      socket.dispatch('PRESENCE_UPDATE', presence('online', []), 10)
      await tick()
      // Only the activities move. The record stays `null`, which is what makes
      // `changes !== null` usable as a filter on the highest-volume event Discord sends.
      socket.dispatch(
        'PRESENCE_UPDATE',
        presence('online', [{ name: 'a game', type: 0, id: 'x', created_at: 0 }]),
        11,
      )
      await tick()
      socket.dispatch('PRESENCE_UPDATE', presence('idle', []), 12)
      await tick()

      assert.deepEqual(seen, [
        null,
        null,
        {
          status: 'online',
          clientStatus: { desktop: 'online', mobile: undefined, web: undefined, vr: undefined },
        },
      ])
    } finally {
      await client.destroy()
    }
  })

  it('UC8: userUpdate reports the previous username', async () => {
    // `client.user` is set at READY, so the patched branch is the one a running client takes.
    const { client, socket } = await clientWith()
    const seen: unknown[] = []
    client.on('userUpdate', (_user, changes) => {
      seen.push(changes)
    })

    try {
      socket.dispatch(
        'USER_UPDATE',
        { id: '1', username: 'renamed', discriminator: '0', avatar: null, bot: true },
        10,
      )
      await tick()

      assert.deepEqual(seen, [{ username: 'bot' }])
    } finally {
      await client.destroy()
    }
  })

  it('UC9: userUpdate reports nothing when the identity is replaced rather than patched', async () => {
    // A dispatch whose ID disagrees builds a new `ClientUser` instead of patching, and there
    // is no previous state of *that* user to report — the old object described someone else.
    const { client, socket } = await clientWith()
    const seen: unknown[] = []
    client.on('userUpdate', (_user, changes) => {
      seen.push(changes)
    })

    try {
      socket.dispatch(
        'USER_UPDATE',
        { id: '999', username: 'somebody else', discriminator: '0', avatar: null, bot: true },
        10,
      )
      await tick()

      assert.deepEqual(seen, [null])
    } finally {
      await client.destroy()
    }
  })
})

const CHANNEL = '290926798999357250'
const THREAD = '111111111111111111'

/** A guild text channel payload. */
function channel(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CHANNEL,
    type: 0,
    guild_id: GUILD,
    name: 'general',
    position: 0,
    permission_overwrites: [{ id: ROLE, type: 0, allow: '0', deny: '0' }],
    parent_id: null,
    nsfw: false,
    topic: 'before',
    last_message_id: null,
    rate_limit_per_user: 0,
    flags: 0,
    ...overrides,
  }
}

/** A public thread payload. */
function thread(metadata: Record<string, unknown>): Record<string, unknown> {
  return {
    id: THREAD,
    type: 11,
    guild_id: GUILD,
    parent_id: CHANNEL,
    name: 'a thread',
    owner_id: USER,
    thread_metadata: {
      auto_archive_duration: 1440,
      archive_timestamp: '2024-01-01T00:00:00.000000+00:00',
      locked: false,
      ...metadata,
    },
    message_count: 1,
    member_count: 1,
    total_message_sent: 1,
    rate_limit_per_user: 0,
    last_message_id: null,
    flags: 0,
  }
}

describe('channel and thread change records', () => {
  it('UC10: channelUpdate reports the previous name and topic', async () => {
    const { client, socket } = await clientWith()
    const seen: unknown[] = []
    client.on('channelUpdate', (_channel, changes) => {
      seen.push(changes)
    })

    try {
      socket.dispatch('CHANNEL_CREATE', channel(), 10)
      await tick()
      socket.dispatch('CHANNEL_UPDATE', channel({ name: 'renamed', topic: 'after' }), 11)
      await tick()

      assert.deepEqual(seen, [{ name: 'general', topic: 'before' }])
    } finally {
      await client.destroy()
    }
  })

  it('UC11: channelUpdate reports nothing for an unchanged channel, overwrites included', async () => {
    // `permission_overwrites` is converted into a fresh array of fresh objects by every patch,
    // so a reference comparison would report a permission change on every channel update.
    const { client, socket } = await clientWith()
    const seen: unknown[] = []
    client.on('channelUpdate', (_channel, changes) => {
      seen.push(changes)
    })

    try {
      socket.dispatch('CHANNEL_CREATE', channel(), 10)
      await tick()
      socket.dispatch('CHANNEL_UPDATE', channel(), 11)
      await tick()

      assert.deepEqual(seen, [null])
    } finally {
      await client.destroy()
    }
  })

  it('UC12: channelUpdate reports the previous overwrites when they actually move', async () => {
    const { client, socket } = await clientWith()
    const seen: unknown[] = []
    client.on('channelUpdate', (_channel, changes) => {
      seen.push(changes)
    })

    try {
      socket.dispatch('CHANNEL_CREATE', channel(), 10)
      await tick()
      socket.dispatch(
        'CHANNEL_UPDATE',
        channel({ permission_overwrites: [{ id: ROLE, type: 0, allow: '1024', deny: '0' }] }),
        11,
      )
      await tick()

      assert.deepEqual(seen, [
        { permissionOverwrites: [{ id: ROLE, type: 0, allow: '0', deny: '0' }] },
      ])
    } finally {
      await client.destroy()
    }
  })

  it('UC13: channelUpdate reports nothing when the channel type changed', async () => {
    // A type change rebuilds rather than patches, because the object is the wrong class now.
    // The old object described a channel of a different type, so its field values are not the
    // previous state of this one and reporting them would be a lie about what moved.
    const { client, socket } = await clientWith()
    const seen: unknown[] = []
    client.on('channelUpdate', (_channel, changes) => {
      seen.push(changes)
    })

    try {
      socket.dispatch('CHANNEL_CREATE', channel(), 10)
      await tick()
      socket.dispatch('CHANNEL_UPDATE', channel({ type: 5, name: 'announcements' }), 11)
      await tick()

      assert.deepEqual(seen, [null])
    } finally {
      await client.destroy()
    }
  })

  it('UC14: threadUpdate reports the previous archive state, read across #applyMetadata', async () => {
    // The six thread metadata fields have one assignment site, shared with the constructor, so
    // `patch` reads their previous values before calling it rather than threading a record
    // through. Archiving is the change a thread listener is there for.
    const { client, socket } = await clientWith({ threads: true })
    const seen: unknown[] = []
    client.on('threadUpdate', (_thread, changes) => {
      seen.push(changes)
    })

    try {
      socket.dispatch('THREAD_CREATE', thread({ archived: false }), 10)
      await tick()
      socket.dispatch('THREAD_UPDATE', thread({ archived: true, locked: true }), 11)
      await tick()

      assert.deepEqual(seen, [{ archived: false, locked: false }])
    } finally {
      await client.destroy()
    }
  })
})
