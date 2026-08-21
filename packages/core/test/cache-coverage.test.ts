import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import { GatewayOpcodes, type GatewayDispatchPayload } from '@vestra/types'
import {
  CacheRegistry,
  EventRouter,
  handlers,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'

/**
 * Every cache scope must have a handler that writes to it.
 *
 * @remarks
 * The guard against issue #13, and against the bug that produced it twice. `roles` shipped
 * enabled by default and stayed empty for the life of the process because roles only ever
 * arrive nested inside `GUILD_CREATE` and no handler read them out; `users` was worse, with
 * no writer anywhere at all. Both are invisible from the store's own tests, which pass
 * against a store nothing ever calls.
 *
 * This drives a representative dispatch set with every scope switched on and asserts each
 * store ends up non-empty. Adding a scope without a handler that fills it fails here, naming
 * the scope. It is deliberately an integration test — that is the only level the defect
 * exists at.
 */

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }
const GUILD_ID = '613425648685547541'
const USER = {
  id: '80351110224678912',
  username: 'nelly',
  discriminator: '0',
  global_name: null,
  avatar: null,
}

function dispatch(t: string, d: unknown): GatewayDispatchPayload {
  return { op: GatewayOpcodes.Dispatch, t, s: 1, d } as GatewayDispatchPayload
}

/** A GUILD_CREATE carrying one of everything it can carry. */
const GUILD_CREATE = dispatch('GUILD_CREATE', {
  id: GUILD_ID,
  name: 'Vestra',
  icon: null,
  splash: null,
  discovery_splash: null,
  home_header: null,
  owner_id: USER.id,
  afk_channel_id: null,
  afk_timeout: 300,
  verification_level: 1,
  default_message_notifications: 0,
  explicit_content_filter: 0,
  roles: [
    {
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
    },
  ],
  emojis: [
    {
      id: '77',
      name: 'vestra',
      roles: [],
      require_colons: true,
      managed: false,
      animated: false,
      available: true,
    },
  ],
  stickers: [
    {
      id: '88',
      name: 'wave',
      description: null,
      tags: 'wave, hello',
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
  members: [
    {
      user: USER,
      roles: [],
      joined_at: '2021-03-14T12:00:00.000000+00:00',
      deaf: false,
      mute: false,
      flags: 0,
    },
  ],
  channels: [
    {
      id: '3',
      type: 0,
      name: 'general',
      position: 0,
      permission_overwrites: [],
      parent_id: null,
      nsfw: false,
    },
  ],
  threads: [
    {
      id: '4',
      type: 11,
      name: 'a thread',
      position: 0,
      parent_id: '3',
      thread_metadata: {
        archived: false,
        auto_archive_duration: 1440,
        archive_timestamp: '2023-01-01T00:00:00+00:00',
        locked: false,
      },
    },
  ],
  voice_states: [
    {
      channel_id: '5',
      user_id: USER.id,
      session_id: 'abc',
      deaf: false,
      mute: false,
      self_deaf: false,
      self_mute: false,
      self_video: false,
      suppress: false,
      request_to_speak_timestamp: null,
    },
  ],
  presences: [
    {
      user: { id: USER.id },
      status: 'online',
      activities: [{ name: 'Vestra', type: 0, created_at: 1700000000000 }],
      client_status: { desktop: 'online' },
    },
  ],
  stage_instances: [],
  guild_scheduled_events: [],
  soundboard_sounds: [],
})

const MESSAGE_CREATE = dispatch('MESSAGE_CREATE', {
  id: '1',
  channel_id: '2',
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
})

describe('cache scope coverage', () => {
  it('CC1: fills every scope from a representative dispatch set', () => {
    const cache = new CacheRegistry({
      guilds: true,
      emojis: true,
      stickers: true,
      presences: true,
      voiceStates: true,
      channels: true,
      threads: true,
      users: true,
      roles: true,
      members: true,
      messages: true,
    })
    const context: EventContext = {
      cache,
      rest: undefined as never,
      user: undefined,
      emit: () => true,
      listenerCount: () => 0,
    } as EventContext
    const router = new EventRouter(context, handlers)

    router.route(GUILD_CREATE, shard, false)
    router.route(MESSAGE_CREATE, shard, false)

    const empty = cache.stores.filter((store) => store.size === 0).map((store) => store.scope)
    assert.deepEqual(
      empty,
      [],
      `these scopes are configurable but nothing writes to them: ${empty.join(', ')}`,
    )
  })

  it('CC2: writes to no scope that was switched off', () => {
    // The other half of the same claim, and the reason CC1 cannot pass for the wrong reason
    // by having handlers write everywhere unconditionally.
    //
    // What this actually catches, verified by mutation, is `false` failing to survive the
    // trip from the option to the store: making `resolveCachePolicy` return `enabled: true`
    // for `false` fails this naming all five scopes. It does **not** catch removing the
    // `enabled` check inside `CacheStore.set` — a disabled store is built over a
    // `NullCacheAdapter`, so that check is belt-and-braces and its removal is invisible
    // here. That is a property of the design, not a gap in the test.
    const cache = new CacheRegistry({
      guilds: false,
      emojis: false,
      stickers: false,
      presences: false,
      voiceStates: false,
      channels: false,
      threads: false,
      users: false,
      roles: false,
      members: false,
      messages: false,
    })
    const context: EventContext = {
      cache,
      rest: undefined as never,
      user: undefined,
      emit: () => true,
      listenerCount: () => 0,
    } as EventContext
    const router = new EventRouter(context, handlers)

    router.route(GUILD_CREATE, shard, false)
    router.route(MESSAGE_CREATE, shard, false)

    const filled = cache.stores.filter((store) => store.size > 0).map((store) => store.scope)
    assert.deepEqual(filled, [], `these scopes ignored being switched off: ${filled.join(', ')}`)
  })
})

describe('policy on update', () => {
  /**
   * An update is a write, and every scope's policy must see it.
   *
   * @remarks
   * Handlers patch a cached entry in place so a held reference stays live. Doing only that
   * skips `CacheStore.set`, and with it the scope's `filter`, the `ttl` deadline and the
   * write-recency `max` evicts by. `CacheStore.set`'s own remarks name the consequence as the
   * rule "most easily got wrong":
   *
   * > `presences: { filter: (p) => p.status !== 'offline' }` must remove a user who goes
   * > offline, not leave a cached presence insisting they are online forever.
   *
   * That is exactly what happened. This is the guard.
   */
  it('CC3: runs the filter on an update, not only on the first write', () => {
    const seen: string[] = []
    const cache = new CacheRegistry({
      presences: {
        filter: (presence) => {
          seen.push(presence.status)
          return presence.status !== 'offline'
        },
      },
    })
    const context: EventContext = {
      cache,
      rest: undefined as never,
      user: undefined,
      emit: () => true,
      listenerCount: () => 0,
    } as EventContext
    const router = new EventRouter(context, handlers)

    const presence = (status: string): unknown => ({
      user: { id: USER.id },
      guild_id: GUILD_ID,
      status,
      activities: [],
      client_status: {},
    })

    router.route(dispatch('PRESENCE_UPDATE', presence('online')), shard, false)
    assert.equal(cache.presences.size, 1)

    router.route(dispatch('PRESENCE_UPDATE', presence('offline')), shard, false)

    assert.deepEqual(seen, ['online', 'offline'], 'the filter never saw the update')
    assert.equal(cache.presences.size, 0, 'the filter said evict and the entry survived')
  })

  it('CC4: measures a ttl from the latest write', () => {
    // `CachePolicy.ttl` says "milliseconds an entry survives its last write". An edit is a
    // write, so a message edited at t=900 with a 1000ms ttl must still be there at t=1001.
    let now = 0
    const cache = new CacheRegistry({ messages: { ttl: 1000 }, now: () => now })
    const context: EventContext = {
      cache,
      rest: undefined as never,
      user: undefined,
      emit: () => true,
      listenerCount: () => 0,
    } as EventContext
    const router = new EventRouter(context, handlers)

    router.route(dispatch('MESSAGE_CREATE', MESSAGE_CREATE.d), shard, false)

    now = 900
    router.route(
      dispatch('MESSAGE_UPDATE', { id: '1', channel_id: '2', content: 'edited' }),
      shard,
      false,
    )

    now = 1001
    assert.equal(
      cache.messages.get('1')?.content,
      'edited',
      'the edit did not move the expiry deadline',
    )
  })
})
