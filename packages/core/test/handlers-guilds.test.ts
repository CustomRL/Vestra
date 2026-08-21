import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import {
  ChannelType,
  GatewayOpcodes,
  type APIGuild,
  type APIGuildMember,
  type APIRole,
  type GatewayDispatchPayload,
} from '@vestra/types'
import {
  CacheRegistry,
  EventRouter,
  Guild,
  handlers,
  type CacheOptions,
  type DispatchShard,
  type CacheScope,
  type EventContext,
} from '@vestra/core'

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }
const GUILD_ID = '613425648685547541'
const OTHER_GUILD_ID = '81384788765712384'
const JOINED_AT = '2021-03-14T12:00:00.000000+00:00'

/**
 * Every scope whose entries belong to one guild.
 *
 * @remarks
 * `users` is not here, and that is the point of listing them rather than checking every store:
 * a user in a departed guild may still be in others.
 */
const GUILD_SCOPED: readonly CacheScope[] = [
  'guilds',
  'channels',
  'threads',
  'roles',
  'members',
  'emojis',
  'stickers',
  'presences',
  'voiceStates',
  'messages',
]

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

function apiGuild(overrides: Partial<APIGuild> = {}): APIGuild {
  return {
    id: GUILD_ID,
    name: 'Vestra',
    icon: null,
    splash: null,
    discovery_splash: null,
    home_header: null,
    owner_id: '80351110224678912',
    afk_channel_id: null,
    afk_timeout: 300,
    verification_level: 1,
    default_message_notifications: 0,
    explicit_content_filter: 0,
    roles: [apiRole()],
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
    ...overrides,
  }
}

function apiMember(id: string, username: string): APIGuildMember {
  return {
    user: { id, username, discriminator: '0', global_name: null, avatar: null },
    roles: [],
    joined_at: JOINED_AT,
    deaf: false,
    mute: false,
    flags: 0,
  }
}

/**
 * A GUILD_CREATE payload, which is the resource plus the fields only that dispatch carries.
 *
 * @remarks
 * Separate from `apiGuild` because the difference is the point: GUILD_UPDATE sends the bare
 * resource, and a fixture that blurred the two would let a handler read `members` on a
 * payload that never has it and still pass.
 */
function guildCreatePayload(overrides: Partial<APIGuild> = {}): unknown {
  return {
    ...apiGuild(overrides),
    emojis: [{ id: '77', name: 'vestra', roles: [], require_colons: true, animated: false }],
    stickers: [
      {
        id: '88',
        name: 'wave',
        description: null,
        tags: 'wave',
        type: 2,
        format_type: 1,
        guild_id: GUILD_ID,
      },
    ],
    joined_at: JOINED_AT,
    large: false,
    member_count: 2,
    members: [apiMember('80351110224678912', 'nelly'), apiMember('82198898841029460', 'lilly')],
    channels: [
      {
        id: '3',
        type: ChannelType.GuildText,
        name: 'general',
        position: 0,
        permission_overwrites: [],
      },
    ],
    threads: [],
    voice_states: [],
    presences: [],
    stage_instances: [],
    guild_scheduled_events: [],
    soundboard_sounds: [],
  }
}

function harness(options: CacheOptions = {}): {
  router: EventRouter
  context: EventContext
  emitted: { event: string; args: unknown[] }[]
} {
  const emitted: { event: string; args: unknown[] }[] = []
  const context: EventContext = {
    cache: new CacheRegistry(options),
    rest: undefined as never,
    user: undefined,
    emit: (event: string, ...args: unknown[]) => {
      emitted.push({ event, args })
      return true
    },
    listenerCount: () => 0,
  } as EventContext

  return { router: new EventRouter(context, handlers), context, emitted }
}

function dispatch(t: string, d: unknown): GatewayDispatchPayload {
  return { op: GatewayOpcodes.Dispatch, t, s: 1, d } as GatewayDispatchPayload
}

describe('guild handlers', () => {
  it('G1: caches the guild and the roles riding along inside it', () => {
    // The reason this file exists. GUILD_CREATE is the only dispatch that carries a guild's
    // roles, so with no guild handler the roles cache stayed empty for the whole life of the
    // process despite defaulting on — which is what the live client reported.
    const { router, context, emitted } = harness()
    router.route(dispatch('GUILD_CREATE', guildCreatePayload()), shard, false)

    assert.equal(context.cache.guilds.get(GUILD_ID)?.name, 'Vestra')
    assert.equal(context.cache.roles.get('41771983423143936')?.name, 'Moderator')
    assert.deepEqual(
      emitted.map((entry) => entry.event),
      ['raw', 'guildCreate'],
    )
  })

  it('G2: groups cached roles under the guild they arrived with', () => {
    const { router, context } = harness()
    router.route(dispatch('GUILD_CREATE', guildCreatePayload()), shard, false)
    router.route(
      dispatch(
        'GUILD_CREATE',
        guildCreatePayload({ id: OTHER_GUILD_ID, roles: [apiRole({ id: '900000000000000000' })] }),
      ),
      shard,
      false,
    )

    assert.deepEqual(
      context.cache.roles.group(GUILD_ID).map((role) => role.id),
      ['41771983423143936'],
    )
    assert.deepEqual(
      context.cache.roles.group(OTHER_GUILD_ID).map((role) => role.id),
      ['900000000000000000'],
    )
  })

  it('G2b: reconciles on a second GUILD_CREATE, rather than only adding', () => {
    // Discord re-sends GUILD_CREATE for every guild after any fresh identify, and again when
    // an outage guild returns — and `guildDelete` deliberately keeps the cache on
    // `unavailable: true`, so the outage path is exactly the one where this matters. The
    // payload is the guild's complete set, so anything absent from it was deleted while the
    // bot was away and no dispatch will ever name it again.
    //
    // Same bug class as the emoji and thread-sync reconciliation, one level up.
    const { router, context } = harness({
      guilds: true,
      roles: true,
      channels: true,
      threads: true,
      emojis: true,
      stickers: true,
      voiceStates: true,
    })

    const full = guildCreatePayload() as Record<string, unknown>
    router.route(dispatch('GUILD_CREATE', full), shard, false)

    assert.equal(context.cache.roles.group(GUILD_ID).length, 1)
    assert.equal(context.cache.channels.group(GUILD_ID).length, 1)
    assert.equal(context.cache.emojis.group(GUILD_ID).length, 1)
    assert.equal(context.cache.stickers.group(GUILD_ID).length, 1)

    // The same guild comes back with everything deleted while we were away.
    router.route(
      dispatch('GUILD_CREATE', {
        ...full,
        roles: [],
        channels: [],
        threads: [],
        emojis: [],
        stickers: [],
        voice_states: [],
      }),
      shard,
      false,
    )

    const leaked: string[] = []
    if (context.cache.roles.group(GUILD_ID).length > 0) leaked.push('roles')
    if (context.cache.channels.group(GUILD_ID).length > 0) leaked.push('channels')
    if (context.cache.emojis.group(GUILD_ID).length > 0) leaked.push('emojis')
    if (context.cache.stickers.group(GUILD_ID).length > 0) leaked.push('stickers')
    if (context.cache.threads.size > 0) leaked.push('threads')
    if (context.cache.voiceStates.size > 0) leaked.push('voiceStates')

    assert.deepEqual(
      leaked,
      [],
      `these survived a GUILD_CREATE that omitted them: ${leaked.join(', ')}`,
    )
    // The guild itself stays, obviously.
    assert.equal(context.cache.guilds.get(GUILD_ID)?.name, 'Vestra')
  })

  it('G2c: does not evict members, whose list is not authoritative', () => {
    // Discord sends whoever it feels like in `members`, gated on an intent — so an absence
    // there means nothing, and reconciling on it would evict members who never left. Measured
    // earlier in this session: with GuildMembers but not GuildPresences, a three-member guild
    // sends exactly one member.
    const { router, context } = harness({ members: true, users: true })
    router.route(dispatch('GUILD_CREATE', guildCreatePayload()), shard, false)
    assert.equal(context.cache.members.size, 2)

    router.route(
      dispatch('GUILD_CREATE', { ...(guildCreatePayload() as object), members: [] }),
      shard,
      false,
    )

    assert.equal(context.cache.members.size, 2, 'members were evicted by an unauthoritative list')
  })

  it('G3: skips an unavailable stub rather than caching a guild of nothing', () => {
    // The stub carries an ID and `unavailable` and nothing else. Constructed from it, every
    // other field would be undefined while its presence in the cache claimed the guild was
    // known — a worse answer than not having it.
    const { router, context, emitted } = harness()
    router.route(dispatch('GUILD_CREATE', { id: GUILD_ID, unavailable: true }), shard, false)

    assert.equal(context.cache.guilds.get(GUILD_ID), undefined)
    assert.deepEqual(
      emitted.map((entry) => entry.event),
      ['raw'],
    )
  })

  it('G4: patches a cached guild in place so held references see the update', () => {
    const { router, context, emitted } = harness()
    router.route(dispatch('GUILD_CREATE', guildCreatePayload()), shard, false)
    const held = context.cache.guilds.get(GUILD_ID)

    router.route(dispatch('GUILD_UPDATE', apiGuild({ name: 'Vestra Dev' })), shard, false)

    assert.equal(held?.name, 'Vestra Dev')
    assert.equal(context.cache.guilds.get(GUILD_ID), held)
    assert.equal(emitted.at(-1)?.event, 'guildUpdate')
  })

  it('G5: keeps the GUILD_CREATE-only fields across an update that omits them', () => {
    // joined_at, large and member_count are sent once, on the create. A patch that assigned
    // them unconditionally would blank all three on every guild edit, so a bot reading
    // `guild.memberCount` gets a number until somebody renames the server.
    const { router, context } = harness()
    router.route(
      dispatch('GUILD_CREATE', {
        ...(guildCreatePayload() as object),
        large: true,
        member_count: 4200,
      }),
      shard,
      false,
    )

    router.route(dispatch('GUILD_UPDATE', apiGuild({ name: 'Renamed' })), shard, false)

    const guild = context.cache.guilds.get(GUILD_ID)
    assert.equal(guild?.name, 'Renamed')
    assert.equal(guild.memberCount, 4200)
    assert.equal(guild.large, true)
    assert.equal(guild.joinedTimestamp, JOINED_AT)
  })

  it('G6: constructs a guild from an update it never saw created', () => {
    const { router, context, emitted } = harness()
    router.route(dispatch('GUILD_UPDATE', apiGuild()), shard, false)

    assert.equal(context.cache.guilds.get(GUILD_ID)?.name, 'Vestra')
    assert.equal(emitted.at(-1)?.event, 'guildUpdate')
  })

  it('G7: keeps a guild that went unavailable during an outage', () => {
    // An outage is not a departure. Dropping the guild here would empty the cache during
    // every Discord incident and refill it minutes later, which is the opposite of what a
    // cache is for.
    const { router, context, emitted } = harness()
    router.route(dispatch('GUILD_CREATE', guildCreatePayload()), shard, false)
    router.route(dispatch('GUILD_DELETE', { id: GUILD_ID, unavailable: true }), shard, false)

    assert.equal(context.cache.guilds.get(GUILD_ID)?.name, 'Vestra')
    assert.equal(context.cache.roles.get('41771983423143936')?.name, 'Moderator')
    assert.deepEqual(emitted.at(-1), { event: 'guildUnavailable', args: [GUILD_ID] })
  })

  it('G8: drops a departed guild and only that guild', () => {
    // Roles are keyed by role ID in a flat store, so dropping a guild has to go through the
    // group index. Dropping the wrong set would evict a live guild's roles, and dropping none
    // would leak every role of every guild the bot is ever removed from.
    const { router, context, emitted } = harness()
    router.route(dispatch('GUILD_CREATE', guildCreatePayload()), shard, false)
    router.route(
      dispatch(
        'GUILD_CREATE',
        guildCreatePayload({ id: OTHER_GUILD_ID, roles: [apiRole({ id: '900000000000000000' })] }),
      ),
      shard,
      false,
    )

    router.route(dispatch('GUILD_DELETE', { id: GUILD_ID }), shard, false)

    assert.equal(context.cache.guilds.get(GUILD_ID), undefined)
    assert.equal(context.cache.roles.get('41771983423143936'), undefined)
    assert.equal(context.cache.guilds.get(OTHER_GUILD_ID)?.name, 'Vestra')
    assert.equal(context.cache.roles.get('900000000000000000')?.name, 'Moderator')
    assert.deepEqual(emitted.at(-1), { event: 'guildDelete', args: [GUILD_ID] })
  })

  it('G8b: drops everything cached for a departed guild, not just its roles', () => {
    // Issue #15. This began as "guilds and roles", which was complete when roles was the only
    // other guild-scoped scope, and stayed that way while seven more were added. Everything
    // else leaked for the life of the process — unreachable, because no dispatch would ever
    // name those IDs again.
    //
    // The assertion is written over `cache.stores` rather than scope by scope on purpose: a
    // guild-scoped scope added without a line in `evictGuild` fails here, which is the only
    // thing that stops this recurring a third time.
    const options: CacheOptions = {
      guilds: true,
      channels: true,
      threads: true,
      roles: true,
      members: true,
      emojis: true,
      stickers: true,
      presences: true,
      voiceStates: true,
      messages: true,
      users: true,
    }
    const { router, context } = harness(options)

    router.route(dispatch('GUILD_CREATE', guildCreatePayload()), shard, false)
    router.route(
      dispatch('THREAD_CREATE', {
        id: '4242',
        type: ChannelType.PublicThread,
        guild_id: GUILD_ID,
        name: 'a thread',
        position: 0,
        parent_id: '3',
      }),
      shard,
      false,
    )
    router.route(
      dispatch('MESSAGE_CREATE', {
        id: '5151',
        channel_id: '3',
        guild_id: GUILD_ID,
        author: { id: '1', username: 'n', discriminator: '0', global_name: null, avatar: null },
        content: 'hi',
        timestamp: '2023-01-01T00:00:00+00:00',
        edited_timestamp: null,
        tts: false,
        mention_everyone: false,
        mentions: [],
        mention_roles: [],
        attachments: [],
        embeds: [],
        pinned: false,
        type: 0,
      }),
      shard,
      false,
    )
    router.route(
      dispatch('VOICE_STATE_UPDATE', {
        guild_id: GUILD_ID,
        channel_id: '3',
        user_id: '80351110224678912',
        session_id: 's',
        deaf: false,
        mute: false,
        self_deaf: false,
        self_mute: false,
        self_video: false,
        suppress: false,
        request_to_speak_timestamp: null,
      }),
      shard,
      false,
    )
    router.route(
      dispatch('PRESENCE_UPDATE', {
        user: { id: '80351110224678912' },
        guild_id: GUILD_ID,
        status: 'online',
        activities: [],
        client_status: {},
      }),
      shard,
      false,
    )

    // Everything guild-scoped must actually have something in it, or the eviction below would
    // pass by having nothing to do — which is how a vacuous version of this test looks.
    const filled = context.cache.stores.filter((store) => store.size > 0).map((s) => s.scope)
    for (const scope of GUILD_SCOPED) {
      assert.ok(filled.includes(scope), `${scope} was never filled, so the check below is empty`)
    }

    router.route(dispatch('GUILD_DELETE', { id: GUILD_ID }), shard, false)

    const leaked = context.cache.stores
      .filter((store) => GUILD_SCOPED.includes(store.scope) && store.size > 0)
      .map((store) => store.scope)
    assert.deepEqual(leaked, [], `these scopes leaked a departed guild: ${leaked.join(', ')}`)

    // Users are deliberately kept: somebody in a departed guild may still be in others.
    assert.ok(context.cache.users.size > 0, 'users must survive a guild departure')
  })

  it('G9: seeds the members riding inside the payload, silently', () => {
    // The member handlers only fire on a join or an edit, so without this a bot that has been
    // running for a week still has an empty member cache for everyone who has not spoken.
    // Seeded and not announced: this list is who was already there, and emitting
    // `guildMemberAdd` per entry would fire a join handler thousands of times at startup.
    const { router, context, emitted } = harness({ members: true, users: true })
    router.route(dispatch('GUILD_CREATE', guildCreatePayload()), shard, false)

    assert.equal(context.cache.members.size, 2)
    assert.equal(context.cache.member(GUILD_ID, '80351110224678912')?.userId, '80351110224678912')
    assert.equal(context.cache.users.get('82198898841029460')?.username, 'lilly')
    assert.deepEqual(
      emitted.map((entry) => entry.event),
      ['raw', 'guildCreate'],
    )
  })

  it('G10: seeds nothing when the scopes are off, and still emits', () => {
    const { router, context, emitted } = harness({ members: false, users: false })
    router.route(dispatch('GUILD_CREATE', guildCreatePayload()), shard, false)

    assert.equal(context.cache.members.size, 0)
    assert.equal(context.cache.users.size, 0)
    assert.equal(emitted.at(-1)?.event, 'guildCreate')
  })

  it('G11: still emits with the guilds scope switched off', () => {
    // The cache is opt-out per ADR 4, and an event that only fires when caching is on would
    // make `cache: { guilds: false }` silently disable the bot's join handling.
    const { router, context, emitted } = harness({ guilds: false })
    router.route(dispatch('GUILD_CREATE', guildCreatePayload()), shard, false)

    assert.equal(context.cache.guilds.get(GUILD_ID), undefined)
    assert.equal(emitted.at(-1)?.event, 'guildCreate')
    assert.ok(emitted.at(-1)?.args[0] instanceof Guild)
  })
})

describe('Guild structure', () => {
  it('GS1: keeps a stable shape whatever the payload omits', () => {
    const sparse = new Guild(apiGuild(), undefined)
    const full = new Guild(
      { ...apiGuild(), joined_at: JOINED_AT, large: true, member_count: 2 },
      undefined,
    )

    assert.deepEqual(Object.keys(sparse), Object.keys(full))
  })

  it('GS2: derives creation time from the snowflake and join time from the payload', () => {
    const guild = new Guild({ ...apiGuild(), joined_at: JOINED_AT }, undefined)

    // (613425648685547541 >> 22) + 1420070400000, computed outside the library.
    assert.equal(guild.createdTimestamp, 1566322471544)
    assert.equal(guild.joinedAt?.getTime(), Date.parse(JOINED_AT))
    assert.equal(new Guild(apiGuild(), undefined).joinedAt, null)
  })
})
