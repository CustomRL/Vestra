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
  members: [
    { user: USER, roles: [], joined_at: '2021-03-14T12:00:00.000000+00:00', deaf: false, mute: false, flags: 0 },
  ],
  channels: [],
  threads: [],
  voice_states: [],
  presences: [],
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
