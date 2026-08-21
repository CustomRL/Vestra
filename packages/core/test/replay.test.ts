import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import { ChannelType, GatewayOpcodes, type GatewayDispatchPayload } from '@vestra/types'
import {
  CacheRegistry,
  EventRouter,
  handlers,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'

/**
 * Applying a dispatch twice leaves the cache where the first application left it.
 *
 * @remarks
 * **This is the property a resume depends on.** After a resume Discord replays every dispatch
 * missed since the last acknowledged sequence, and it does not track what the client already
 * processed — so a bot that reconnects sees some dispatches for the second time. If handlers
 * were not idempotent, a reconnect would corrupt the cache rather than repair it, and it would
 * do so only under network conditions nobody reproduces on purpose.
 *
 * The fixtures are keyed by event name and checked against the registry, so a handler added
 * without one fails here. That is deliberate: the easy way to keep this test passing is to stop
 * covering new handlers, and this makes that a failure instead.
 *
 * Emitting twice is **not** a violation. §4.7 puts duplicate emission on the router rather than
 * on handlers, and the client's `replayed` flag is what a consumer filters on. What must not
 * differ is the cache.
 */

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }
const GUILD_ID = '613425648685547541'
const CHANNEL_ID = '3'
const THREAD_ID = '4'
const USER_ID = '80351110224678912'
const USER = {
  id: USER_ID,
  username: 'nelly',
  discriminator: '0',
  global_name: null,
  avatar: null,
}
const MEMBER = {
  user: USER,
  roles: ['41771983423143936'],
  joined_at: '2021-03-14T12:00:00.000000+00:00',
  deaf: false,
  mute: false,
  flags: 0,
}
const ROLE = {
  id: '41771983423143936',
  name: 'Moderator',
  color: 0,
  colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
  hoist: false,
  position: 1,
  permissions: '0',
  managed: false,
  mentionable: false,
  flags: 0,
}
const TEXT_CHANNEL = {
  id: CHANNEL_ID,
  type: ChannelType.GuildText,
  guild_id: GUILD_ID,
  name: 'general',
  position: 0,
  permission_overwrites: [],
}
const THREAD = {
  id: THREAD_ID,
  type: ChannelType.PublicThread,
  guild_id: GUILD_ID,
  name: 'a thread',
  position: 0,
  parent_id: CHANNEL_ID,
}
const MESSAGE = {
  id: 'm1',
  channel_id: CHANNEL_ID,
  guild_id: GUILD_ID,
  author: USER,
  content: 'hello',
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
}
const STAGE_INSTANCE = {
  id: '840647391636226060',
  guild_id: GUILD_ID,
  channel_id: CHANNEL_ID,
  topic: 'Office hours',
  privacy_level: 2,
  discoverable_disabled: true,
  guild_scheduled_event_id: null,
}
const INVITE = {
  channel_id: CHANNEL_ID,
  code: 'vestra',
  created_at: '2024-03-01T12:00:00.000000+00:00',
  guild_id: GUILD_ID,
  inviter: USER,
  max_age: 86_400,
  max_uses: 25,
  temporary: false,
  uses: 0,
  expires_at: null,
}
const GUILD = {
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
  roles: [ROLE],
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
  joined_at: '2021-03-14T12:00:00.000000+00:00',
  large: false,
  member_count: 1,
  members: [MEMBER],
  channels: [TEXT_CHANNEL],
  threads: [THREAD],
  voice_states: [],
  presences: [],
  stage_instances: [],
  guild_scheduled_events: [],
  soundboard_sounds: [],
}

/**
 * One payload per handled event.
 *
 * @remarks
 * `GUILD_DELETE` and `CHANNEL_DELETE` are absent on purpose and asserted about separately: a
 * dispatch sequence containing them empties the cache, which would make the comparison below
 * pass by comparing nothing.
 */
const FIXTURES: Readonly<Record<string, unknown>> = {
  READY: {
    v: 10,
    user: { ...USER, bot: true },
    guilds: [],
    session_id: 's',
    resume_gateway_url: 'wss://example',
    application: { id: '1', flags: 0 },
  },
  GUILD_CREATE: GUILD,
  GUILD_UPDATE: { ...GUILD, name: 'Renamed' },
  GUILD_EMOJIS_UPDATE: { guild_id: GUILD_ID, emojis: GUILD.emojis },
  GUILD_STICKERS_UPDATE: { guild_id: GUILD_ID, stickers: GUILD.stickers },
  GUILD_ROLE_CREATE: { guild_id: GUILD_ID, role: ROLE },
  GUILD_ROLE_UPDATE: { guild_id: GUILD_ID, role: { ...ROLE, name: 'Mod' } },
  GUILD_MEMBER_ADD: { ...MEMBER, guild_id: GUILD_ID },
  GUILD_MEMBER_UPDATE: { guild_id: GUILD_ID, user: USER, roles: MEMBER.roles, nick: 'nel' },
  GUILD_BAN_ADD: { guild_id: GUILD_ID, user: { ...USER, id: '999' } },
  GUILD_BAN_REMOVE: { guild_id: GUILD_ID, user: { ...USER, id: '999' } },
  CHANNEL_CREATE: TEXT_CHANNEL,
  CHANNEL_UPDATE: { ...TEXT_CHANNEL, name: 'renamed' },
  CHANNEL_PINS_UPDATE: {
    guild_id: GUILD_ID,
    channel_id: CHANNEL_ID,
    last_pin_timestamp: '2024-01-01T00:00:00+00:00',
  },
  THREAD_CREATE: THREAD,
  THREAD_UPDATE: { ...THREAD, name: 'renamed thread' },
  THREAD_LIST_SYNC: { guild_id: GUILD_ID, threads: [THREAD], members: [] },
  MESSAGE_CREATE: MESSAGE,
  MESSAGE_UPDATE: { id: 'm1', channel_id: CHANNEL_ID, content: 'edited' },
  MESSAGE_REACTION_ADD: {
    user_id: USER_ID,
    channel_id: CHANNEL_ID,
    message_id: 'm1',
    guild_id: GUILD_ID,
    emoji: { id: null, name: '👍' },
    burst: false,
    type: 0,
  },
  MESSAGE_REACTION_REMOVE: {
    user_id: USER_ID,
    channel_id: CHANNEL_ID,
    message_id: 'm1',
    guild_id: GUILD_ID,
    emoji: { id: null, name: '👍' },
    burst: false,
    type: 0,
  },
  MESSAGE_REACTION_REMOVE_ALL: { channel_id: CHANNEL_ID, message_id: 'm1', guild_id: GUILD_ID },
  MESSAGE_REACTION_REMOVE_EMOJI: {
    channel_id: CHANNEL_ID,
    message_id: 'm1',
    guild_id: GUILD_ID,
    emoji: { id: null, name: '👍' },
  },
  PRESENCE_UPDATE: {
    user: { id: USER_ID },
    guild_id: GUILD_ID,
    status: 'online',
    activities: [],
    client_status: {},
  },
  VOICE_STATE_UPDATE: {
    guild_id: GUILD_ID,
    channel_id: CHANNEL_ID,
    user_id: USER_ID,
    session_id: 's',
    deaf: false,
    mute: false,
    self_deaf: false,
    self_mute: false,
    self_video: false,
    suppress: false,
    request_to_speak_timestamp: null,
  },
  TYPING_START: {
    channel_id: CHANNEL_ID,
    guild_id: GUILD_ID,
    user_id: USER_ID,
    timestamp: 1700000000,
    member: MEMBER,
  },
  USER_UPDATE: { ...USER, bot: true },

  // Neither of these two groups touches the cache, so their deletes belong in the replayed
  // stream rather than in DELETES: nothing they remove could make the comparison vacuous.
  INVITE_CREATE: INVITE,
  INVITE_DELETE: { channel_id: CHANNEL_ID, guild_id: GUILD_ID, code: INVITE.code },

  STAGE_INSTANCE_CREATE: STAGE_INSTANCE,
  STAGE_INSTANCE_UPDATE: { ...STAGE_INSTANCE, topic: 'Now: questions' },
  STAGE_INSTANCE_DELETE: STAGE_INSTANCE,

  // Deletes, applied only in the dedicated test below.
  GUILD_DELETE: { id: GUILD_ID },
  CHANNEL_DELETE: TEXT_CHANNEL,
  THREAD_DELETE: THREAD,
  MESSAGE_DELETE: { id: 'm1', channel_id: CHANNEL_ID, guild_id: GUILD_ID },
  MESSAGE_DELETE_BULK: { ids: ['m1'], channel_id: CHANNEL_ID, guild_id: GUILD_ID },
  GUILD_MEMBER_REMOVE: { guild_id: GUILD_ID, user: USER },
  GUILD_ROLE_DELETE: { guild_id: GUILD_ID, role_id: ROLE.id },
}

/** The events whose whole purpose is to remove something. */
const DELETES: ReadonlySet<string> = new Set([
  'GUILD_DELETE',
  'CHANNEL_DELETE',
  'THREAD_DELETE',
  'MESSAGE_DELETE',
  'MESSAGE_DELETE_BULK',
  'GUILD_MEMBER_REMOVE',
  'GUILD_ROLE_DELETE',
])

const EVERYTHING_ON = {
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
} as const

function harness(): { router: EventRouter; context: EventContext } {
  const context: EventContext = {
    cache: new CacheRegistry(EVERYTHING_ON),
    rest: undefined as never,
    user: undefined,
    emit: () => true,
    listenerCount: () => 0,
  } as EventContext

  return { router: new EventRouter(context, handlers), context }
}

function dispatch(t: string, d: unknown): GatewayDispatchPayload {
  return { op: GatewayOpcodes.Dispatch, t, s: 1, d } as GatewayDispatchPayload
}

/** Everything in the cache, in a form two runs can be compared by. */
function snapshot(context: EventContext): string {
  const state: Record<string, unknown> = {}
  for (const store of context.cache.stores) {
    const entries: [string, unknown][] = []
    for (const [key, value] of store.entries()) {
      entries.push([key, JSON.parse(JSON.stringify(value)) as unknown])
    }
    // Sorted, because adapter iteration order is not part of the contract and a cache that
    // reordered its entries under replay would otherwise read as a state change.
    entries.sort((left, right) => (left[0] < right[0] ? -1 : 1))
    state[store.scope] = entries
  }
  return JSON.stringify(state, null, 2)
}

describe('replay after a resume', () => {
  it('R1: covers every handled event', () => {
    // The easy way to keep the tests below passing is to stop covering new handlers, so this
    // makes that a failure rather than an omission.
    const uncovered = handlers
      .map((handler) => handler.event)
      .filter((event) => !(event in FIXTURES))

    assert.deepEqual(uncovered, [], `no replay fixture for: ${uncovered.join(', ')}`)
  })

  it('R2: leaves the cache identical when the whole stream is replayed', () => {
    const order = handlers.map((handler) => handler.event).filter((event) => !DELETES.has(event))
    const { router, context } = harness()

    for (const event of order) router.route(dispatch(event, FIXTURES[event]), shard, false)
    const first = snapshot(context)

    // Non-empty, or this compares nothing and passes for the wrong reason.
    assert.ok(context.cache.guilds.size > 0, 'the first pass cached nothing')
    assert.ok(context.cache.messages.size > 0, 'the first pass cached no messages')

    for (const event of order) router.route(dispatch(event, FIXTURES[event]), shard, true)
    const second = snapshot(context)

    assert.equal(second, first, 'replaying the stream changed the cache')
  })

  it('R2b: leaves the cache identical when only the tail is replayed', () => {
    // **The one that actually models a resume**, and the reason R2 alone is not enough. A
    // resume replays a contiguous *suffix* — everything since the last acknowledged sequence —
    // not the stream from the beginning. Replaying the whole thing hides non-idempotency,
    // because the creates at the front reset whatever the updates behind them corrupted.
    //
    // Verified by mutation: making `Message.patch` append rather than assign passes R2 and
    // fails here.
    const order = handlers.map((handler) => handler.event).filter((event) => !DELETES.has(event))
    const tail = order.filter((event) => !event.endsWith('_CREATE') && event !== 'READY')

    const { router, context } = harness()
    for (const event of order) router.route(dispatch(event, FIXTURES[event]), shard, false)
    const first = snapshot(context)

    assert.ok(tail.length > 0, 'the tail must contain something to replay')
    for (const event of tail) router.route(dispatch(event, FIXTURES[event]), shard, true)

    assert.equal(snapshot(context), first, 'replaying the tail changed the cache')
  })

  it('R3: leaves the cache identical when a delete is replayed', () => {
    // A replayed delete must not throw, and must not remove something a later dispatch put
    // back. Discord replays the delete, not the state after it.
    const { router, context } = harness()
    router.route(dispatch('GUILD_CREATE', FIXTURES.GUILD_CREATE), shard, false)
    router.route(dispatch('MESSAGE_CREATE', FIXTURES.MESSAGE_CREATE), shard, false)

    for (const event of DELETES) {
      if (event === 'GUILD_DELETE') continue
      router.route(dispatch(event, FIXTURES[event]), shard, false)
    }
    const first = snapshot(context)

    for (const event of DELETES) {
      if (event === 'GUILD_DELETE') continue
      router.route(dispatch(event, FIXTURES[event]), shard, true)
    }

    assert.equal(snapshot(context), first, 'replaying the deletes changed the cache')
  })

  it('R4: leaves the cache identical when a guild delete is replayed', () => {
    const { router, context } = harness()
    router.route(dispatch('GUILD_CREATE', FIXTURES.GUILD_CREATE), shard, false)

    router.route(dispatch('GUILD_DELETE', FIXTURES.GUILD_DELETE), shard, false)
    const first = snapshot(context)

    router.route(dispatch('GUILD_DELETE', FIXTURES.GUILD_DELETE), shard, true)

    assert.equal(snapshot(context), first)
  })

  it('R5: a create replayed after its delete puts the entity back', () => {
    // Discord replays what happened, in order. A create that lands after a delete during a
    // replay means the entity exists again, and a handler that treated the second create as a
    // no-op would leave the cache permanently missing it.
    const { router, context } = harness()
    router.route(dispatch('GUILD_CREATE', FIXTURES.GUILD_CREATE), shard, false)
    router.route(dispatch('GUILD_DELETE', FIXTURES.GUILD_DELETE), shard, false)
    assert.equal(context.cache.guilds.size, 0)

    router.route(dispatch('GUILD_CREATE', FIXTURES.GUILD_CREATE), shard, true)

    assert.equal(context.cache.guilds.get(GUILD_ID)?.name, 'Vestra')
    assert.equal(context.cache.roles.group(GUILD_ID).length, 1)
    assert.equal(context.cache.channels.group(GUILD_ID).length, 1)
  })
})
