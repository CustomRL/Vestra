import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import { ActivityType, GatewayOpcodes, type GatewayDispatchPayload } from '@vestra/types'
import {
  Activity,
  CacheRegistry,
  EventRouter,
  handlers,
  Presence,
  type CacheOptions,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }
const GUILD_ID = '613425648685547541'
const USER_ID = '80351110224678912'

function presence(extra: Record<string, unknown> = {}): unknown {
  return {
    user: { id: USER_ID },
    guild_id: GUILD_ID,
    status: 'online',
    activities: [],
    client_status: { desktop: 'online' },
    ...extra,
  }
}

function harness(options: CacheOptions = { presences: true, users: true }): {
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

describe('presence handler', () => {
  it('P1: caches a presence under its guild and user', () => {
    const { router, context, emitted } = harness()
    router.route(dispatch('PRESENCE_UPDATE', presence()), shard, false)

    assert.equal(context.cache.presence(GUILD_ID, USER_ID)?.status, 'online')
    assert.ok(emitted.at(-1)?.args[0] instanceof Presence)
  })

  it('P2: keeps one presence per membership, not per user', () => {
    // Discord sends this once per shared guild, so a user in two guilds produces two. Keying
    // by user alone would make the second overwrite the first and leave one status standing
    // for both guilds.
    const { router, context } = harness()
    router.route(dispatch('PRESENCE_UPDATE', presence()), shard, false)
    router.route(
      dispatch('PRESENCE_UPDATE', presence({ guild_id: '999', status: 'dnd' })),
      shard,
      false,
    )

    assert.equal(context.cache.presence(GUILD_ID, USER_ID)?.status, 'online')
    assert.equal(context.cache.presence('999', USER_ID)?.status, 'dnd')
    assert.equal(context.cache.presences.size, 2)
  })

  it('P3: does not overwrite a cached user with the partial one it carries', () => {
    // The single thing this event could do that would corrupt another scope. Discord
    // documents the user here as partial with only `id` guaranteed, so upserting would
    // replace a complete cached user with a near-empty one on every status change.
    const { router, context } = harness()
    router.route(
      dispatch('MESSAGE_CREATE', {
        id: '1',
        channel_id: '2',
        author: {
          id: USER_ID,
          username: 'nelly',
          discriminator: '0',
          global_name: null,
          avatar: null,
        },
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
      }),
      shard,
      false,
    )
    assert.equal(context.cache.users.get(USER_ID)?.username, 'nelly')

    router.route(dispatch('PRESENCE_UPDATE', presence()), shard, false)

    assert.equal(context.cache.users.get(USER_ID)?.username, 'nelly')
  })

  it('P4: patches in place so a held reference stays live', () => {
    const { router, context } = harness()
    router.route(dispatch('PRESENCE_UPDATE', presence()), shard, false)
    const held = context.cache.presence(GUILD_ID, USER_ID)

    router.route(dispatch('PRESENCE_UPDATE', presence({ status: 'idle' })), shard, false)

    assert.equal(held?.status, 'idle')
    assert.equal(context.cache.presence(GUILD_ID, USER_ID), held)
  })

  it('P5: caches an offline presence rather than deleting it', () => {
    // "We know they are offline" and "we have never seen them" are different answers, and a
    // bot checking whether somebody is around needs to tell them apart.
    const { router, context } = harness()
    router.route(dispatch('PRESENCE_UPDATE', presence()), shard, false)
    router.route(dispatch('PRESENCE_UPDATE', presence({ status: 'offline' })), shard, false)

    const cached = context.cache.presence(GUILD_ID, USER_ID)
    assert.equal(cached?.status, 'offline')
    assert.equal(cached.offline, true)
  })

  it('P6: seeds presences from GUILD_CREATE with the guild put back', () => {
    // They arrive there without a `guild_id`, and the structure keys on it.
    const { router, context } = harness()
    router.route(
      dispatch('GUILD_CREATE', {
        id: GUILD_ID,
        name: 'Vestra',
        icon: null,
        splash: null,
        discovery_splash: null,
        home_header: null,
        owner_id: '1',
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
        joined_at: '2021-03-14T12:00:00.000000+00:00',
        large: false,
        member_count: 1,
        members: [],
        channels: [],
        threads: [],
        voice_states: [],
        presences: [{ user: { id: USER_ID }, status: 'dnd', activities: [], client_status: {} }],
        stage_instances: [],
        guild_scheduled_events: [],
        soundboard_sounds: [],
      }),
      shard,
      false,
    )

    assert.equal(context.cache.presence(GUILD_ID, USER_ID)?.status, 'dnd')
    assert.equal(context.cache.presence(GUILD_ID, USER_ID)?.guildId, GUILD_ID)
  })
})

describe('Presence and Activity structures', () => {
  it('P7: finds the custom status where Discord actually puts it', () => {
    // Discord models a status message as an activity whose `name` is the literal string
    // `Custom Status` and whose `state` carries the message. Reading `activities[0].name` is
    // the natural mistake.
    const built = new Presence(
      presence({
        activities: [
          {
            name: 'Custom Status',
            type: ActivityType.Custom,
            state: 'building a Discord library',
            created_at: 1700000000000,
          },
        ],
      }) as never,
      undefined,
    )

    assert.equal(built.activities[0]?.name, 'Custom Status')
    assert.equal(built.customStatus, 'building a Discord library')
    assert.equal(built.activities[0].isCustomStatus(), true)
  })

  it('P8: reports no custom status when there is only a game', () => {
    const built = new Presence(
      presence({
        activities: [{ name: 'Vestra', type: ActivityType.Playing, created_at: 1 }],
      }) as never,
      undefined,
    )

    assert.equal(built.customStatus, undefined)
    assert.equal(built.activities[0]?.isCustomStatus(), false)
  })

  it('P9: converts the nested activity objects instead of aliasing them', () => {
    // Held by reference, `activity.assets.large_image` would put snake_case in consumer code
    // and a consumer mutating it would be editing the dispatch.
    const payload = {
      name: 'Vestra',
      type: ActivityType.Playing,
      created_at: 1700000000000,
      timestamps: { start: 5, end: 10 },
      party: { id: 'p', size: [2, 4] as [number, number] },
      assets: { large_image: 'key', large_text: 'hover' },
      buttons: ['Docs'],
    }
    const activity = new Activity(payload)

    assert.deepEqual(activity.timestamps, { start: 5, end: 10 })
    assert.deepEqual(activity.assets?.largeImage, 'key')
    assert.deepEqual(activity.assets.largeText, 'hover')
    assert.deepEqual(activity.party?.size, [2, 4])
    assert.notEqual(activity.party.size, payload.party.size)
    assert.notEqual(activity.buttons, payload.buttons)
    assert.equal(activity.createdAt.getTime(), 1700000000000)
  })

  it('P10: gives every platform a slot in the client status', () => {
    // Absent means "no session there". Omitting the field instead would give a presence with a
    // desktop session a different shape from one without.
    const desktopOnly = new Presence(presence() as never, undefined)
    const nothing = new Presence(presence({ client_status: {} }) as never, undefined)

    assert.deepEqual(Object.keys(desktopOnly.clientStatus), Object.keys(nothing.clientStatus))
    assert.equal(desktopOnly.clientStatus.desktop, 'online')
    assert.equal(desktopOnly.clientStatus.mobile, undefined)
  })
})
