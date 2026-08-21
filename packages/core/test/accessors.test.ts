import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ChannelType } from '@vestra/types'
import {
  CacheRegistry,
  createChannel,
  Emoji,
  Guild,
  GuildMember,
  Message,
  Presence,
  Role,
  Sticker,
  User,
  VoiceState,
  type CacheCapable,
} from '@vestra/core'

/**
 * No accessor on a shipped structure throws when the cache is empty.
 *
 * @remarks
 * §7 **CU2**, and the runtime half of ADR 4. Caching is opt-in per scope, so *every*
 * cache-backed accessor has a configuration in which it has nothing to return —
 * `guild.roles()` on a client with `roles: false` is not an edge case, it is the documented
 * default for most scopes. ADR 4's position is that such an accessor returns `undefined` or an
 * empty list and never lies by asserting; an accessor that threw would make cache
 * configuration a source of runtime exceptions in code that never mentions caching.
 *
 * **Enumerated reflectively rather than listed.** A hand-written list covers the accessors
 * somebody remembered, which is exactly the set that already works. Walking the prototype
 * covers the ones nobody thought about, including the next one added.
 *
 * Only zero-argument getters and methods are called, because those are the ones a consumer
 * reaches for without ceremony and the ones a bare `structure.thing` can trip.
 */

const GUILD_ID = '613425648685547541'
const USER_ID = '80351110224678912'
const CHANNEL_ID = '41771983423143936'

/** A client whose cache is on for every scope and holds nothing. */
const emptyClient: CacheCapable = {
  cache: new CacheRegistry({
    guilds: true,
    channels: true,
    threads: true,
    roles: true,
    members: true,
    users: true,
    messages: true,
    emojis: true,
    stickers: true,
    presences: true,
    voiceStates: true,
  }),
}

/** A client with caching switched off entirely, which is the harsher case. */
const offClient: CacheCapable = {
  cache: new CacheRegistry({
    guilds: false,
    channels: false,
    threads: false,
    roles: false,
    members: false,
    users: false,
    messages: false,
    emojis: false,
    stickers: false,
    presences: false,
    voiceStates: false,
  }),
}

function build(client: CacheCapable): { name: string; value: object }[] {
  const userPayload = {
    id: USER_ID,
    username: 'nelly',
    discriminator: '0',
    global_name: null,
    avatar: null,
  }
  const guildPayload = {
    id: GUILD_ID,
    name: 'Vestra',
    icon: null,
    splash: null,
    discovery_splash: null,
    home_header: null,
    owner_id: USER_ID,
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
  }

  const structures: { name: string; value: object }[] = [
    { name: 'User', value: new User(userPayload, client) },
    { name: 'Guild', value: new Guild(guildPayload as never, client) },
    {
      name: 'Role',
      value: new Role(
        {
          id: '1',
          name: 'r',
          color: 0,
          colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
          hoist: false,
          position: 0,
          permissions: '0',
          managed: false,
          mentionable: false,
          flags: 0,
        },
        GUILD_ID,
        client,
      ),
    },
    {
      name: 'GuildMember',
      value: new GuildMember(
        { roles: [], deaf: false, mute: false, flags: 0 } as never,
        GUILD_ID,
        USER_ID,
        client,
      ),
    },
    {
      name: 'Message',
      // A real snowflake: the snowflake-derived accessors parse it as a BigInt, and an
      // invalid ID would fail them for a reason that is the fixture's fault, not the code's.
      value: new Message({ id: '900000000000000000', channel_id: CHANNEL_ID }, client),
    },
    {
      name: 'VoiceState',
      value: new VoiceState(
        {
          user_id: USER_ID,
          channel_id: null,
          session_id: 's',
          deaf: false,
          mute: false,
          self_deaf: false,
          self_mute: false,
          self_video: false,
          suppress: false,
          request_to_speak_timestamp: null,
        },
        GUILD_ID,
        client,
      ),
    },
    {
      name: 'Presence',
      value: new Presence(
        {
          user: { id: USER_ID },
          guild_id: GUILD_ID,
          status: 'offline',
          activities: [],
          client_status: {},
        } as never,
        client,
      ),
    },
    {
      name: 'Emoji',
      value: new Emoji({ id: '1', name: 'e' }, GUILD_ID, client),
    },
    {
      name: 'Sticker',
      value: new Sticker(
        {
          id: '1',
          name: 's',
          description: null,
          tags: '',
          type: 2,
          format_type: 1,
        } as never,
        client,
      ),
    },
  ]

  for (const [label, type] of [
    ['TextChannel', ChannelType.GuildText],
    ['VoiceChannel', ChannelType.GuildVoice],
    ['CategoryChannel', ChannelType.GuildCategory],
    ['ForumChannel', ChannelType.GuildForum],
    ['ThreadChannel', ChannelType.PublicThread],
  ] as const) {
    const channel = createChannel(
      { id: CHANNEL_ID, type, name: 'c', position: 0, permission_overwrites: [] },
      client,
      GUILD_ID,
    )
    if (channel !== undefined) structures.push({ name: label, value: channel })
  }

  structures.push({
    name: 'DMChannel',
    value: createChannel({ id: CHANNEL_ID, type: ChannelType.DM }, client) as object,
  })

  return structures
}

/** Every zero-argument getter and method on the prototype chain, excluding Object's. */
function accessorsOf(value: object): string[] {
  const names = new Set<string>()

  let prototype: object | null = Object.getPrototypeOf(value) as object | null
  while (prototype !== null && prototype !== Object.prototype) {
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(prototype))) {
      if (key === 'constructor') continue
      if (typeof descriptor.get === 'function') {
        names.add(key)
        continue
      }

      // `length === 0` keeps this to the calls a consumer makes without ceremony. A method
      // that needs arguments needs a fixture, and a fixture is a decision this cannot make.
      const value: unknown = descriptor.value
      if (typeof value === 'function' && (value as { length: number }).length === 0) {
        names.add(key)
      }
    }
    prototype = Object.getPrototypeOf(prototype) as object | null
  }

  return [...names]
}

describe('cache-backed accessors', () => {
  it('CU1: finds a real surface to check', () => {
    // Guards the guard. A reflective test that enumerated nothing would pass silently, which
    // is the failure mode reflective tests have.
    const total = build(emptyClient).reduce(
      (count, entry) => count + accessorsOf(entry.value).length,
      0,
    )
    assert.ok(total > 60, `expected a real accessor surface; found ${String(total)}`)
  })

  it('CU2: none throws when every scope is empty', () => {
    const failures: string[] = []

    for (const { name, value } of build(emptyClient)) {
      for (const accessor of accessorsOf(value)) {
        try {
          void (value as unknown as Record<string, unknown>)[accessor]
          const property = (value as unknown as Record<string, unknown>)[accessor]
          if (typeof property === 'function') (property as () => unknown).call(value)
        } catch (error) {
          failures.push(`${name}.${accessor}: ${(error as Error).message}`)
        }
      }
    }

    assert.deepEqual(failures, [], `these threw on an empty cache:\n${failures.join('\n')}`)
  })

  it('CU3: none throws when caching is off entirely', () => {
    // Harsher than an empty cache: the stores are backed by a null adapter, so `get` never
    // returns anything at all and `size` is always zero.
    const failures: string[] = []

    for (const { name, value } of build(offClient)) {
      for (const accessor of accessorsOf(value)) {
        try {
          const property = (value as unknown as Record<string, unknown>)[accessor]
          if (typeof property === 'function') (property as () => unknown).call(value)
        } catch (error) {
          failures.push(`${name}.${accessor}: ${(error as Error).message}`)
        }
      }
    }

    assert.deepEqual(failures, [], `these threw with caching off:\n${failures.join('\n')}`)
  })
})
