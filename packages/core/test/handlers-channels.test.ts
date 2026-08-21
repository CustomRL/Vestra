import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import { ChannelType, GatewayOpcodes, type GatewayDispatchPayload } from '@vestra/types'
import {
  AnnouncementChannel,
  CacheRegistry,
  EventRouter,
  handlers,
  TextChannel,
  ThreadChannel,
  VoiceChannel,
  type CacheOptions,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }
const GUILD_ID = '613425648685547541'
const CHANNEL_ID = '41771983423143936'
const THREAD_ID = '900000000000000000'

function channelPayload(type: ChannelType, extra: Record<string, unknown> = {}): unknown {
  return {
    id: CHANNEL_ID,
    type,
    guild_id: GUILD_ID,
    name: 'general',
    position: 3,
    permission_overwrites: [],
    parent_id: null,
    nsfw: false,
    ...extra,
  }
}

function threadPayload(extra: Record<string, unknown> = {}): unknown {
  return {
    id: THREAD_ID,
    type: ChannelType.PublicThread,
    guild_id: GUILD_ID,
    name: 'a thread',
    position: 0,
    parent_id: CHANNEL_ID,
    thread_metadata: {
      archived: false,
      auto_archive_duration: 1440,
      archive_timestamp: '2023-01-01T00:00:00+00:00',
      locked: false,
    },
    ...extra,
  }
}

function harness(options: CacheOptions = { channels: true, threads: true }): {
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

describe('channel handlers', () => {
  it('CD1: caches a channel under its guild', () => {
    const { router, context, emitted } = harness()
    router.route(dispatch('CHANNEL_CREATE', channelPayload(ChannelType.GuildText)), shard, false)

    assert.ok(context.cache.channels.get(CHANNEL_ID) instanceof TextChannel)
    assert.deepEqual(
      context.cache.channels.group(GUILD_ID).map((channel) => channel.id),
      [CHANNEL_ID],
    )
    assert.equal(emitted.at(-1)?.event, 'channelCreate')
  })

  it('CD2: files a thread in the threads scope, not the channels scope', () => {
    // The split that makes the two scopes worth having. A thread arriving as a CHANNEL_CREATE
    // is a real payload, so the routing has to come from the channel type rather than from
    // which dispatch it was — otherwise `threads: false` would not actually bound anything.
    const { router, context } = harness()
    router.route(dispatch('CHANNEL_CREATE', threadPayload()), shard, false)

    assert.equal(context.cache.channels.get(THREAD_ID), undefined)
    assert.ok(context.cache.threads.get(THREAD_ID) instanceof ThreadChannel)
  })

  it('CD3: groups threads by the channel they hang off', () => {
    const { router, context } = harness()
    router.route(dispatch('THREAD_CREATE', threadPayload()), shard, false)

    assert.deepEqual(
      context.cache.threads.group(CHANNEL_ID).map((thread) => thread.id),
      [THREAD_ID],
    )
  })

  it('CD4: patches through the subclass so held references stay live', () => {
    // The handler only knows the cached object as a `Channel`. If `patch` did not dispatch to
    // the concrete class, a voice channel update would apply the base fields and silently drop
    // the bitrate.
    const { router, context } = harness()
    router.route(
      dispatch('CHANNEL_CREATE', channelPayload(ChannelType.GuildVoice, { bitrate: 64000 })),
      shard,
      false,
    )
    const held = context.cache.channels.get(CHANNEL_ID)

    router.route(
      dispatch(
        'CHANNEL_UPDATE',
        channelPayload(ChannelType.GuildVoice, { bitrate: 96000, name: 'Renamed' }),
      ),
      shard,
      false,
    )

    assert.ok(held instanceof VoiceChannel)
    assert.equal(held.bitrate, 96000)
    assert.equal(held.name, 'Renamed')
    assert.equal(context.cache.channels.get(CHANNEL_ID), held)
  })

  it('CD4b: rebuilds a channel that changed type, rather than keeping the old class', () => {
    // Converting a text channel to an announcement channel is a supported Discord operation.
    // Patching cannot express it — `type` is readonly and the object is the wrong class — so
    // the stale version kept answering `isTextBased()` and friends from the old type forever.
    const { router, context, emitted } = harness()
    router.route(dispatch('CHANNEL_CREATE', channelPayload(ChannelType.GuildText)), shard, false)
    assert.ok(context.cache.channels.get(CHANNEL_ID) instanceof TextChannel)

    router.route(
      dispatch('CHANNEL_UPDATE', channelPayload(ChannelType.GuildAnnouncement)),
      shard,
      false,
    )

    const rebuilt = context.cache.channels.get(CHANNEL_ID)
    assert.equal(rebuilt?.type, ChannelType.GuildAnnouncement)
    assert.ok(rebuilt instanceof AnnouncementChannel, `still a ${rebuilt.constructor.name}`)
    assert.equal(emitted.at(-1)?.event, 'channelUpdate')
    assert.equal(emitted.at(-1)?.args[0], rebuilt)
  })

  it('CD4c: patches in place when the type is unchanged, so references stay live', () => {
    // The other half: a rebuild on every update would break every held reference, which is the
    // thing patching in place exists to avoid.
    const { router, context } = harness()
    router.route(dispatch('CHANNEL_CREATE', channelPayload(ChannelType.GuildText)), shard, false)
    const held = context.cache.channels.get(CHANNEL_ID)

    router.route(
      dispatch('CHANNEL_UPDATE', channelPayload(ChannelType.GuildText, { name: 'renamed' })),
      shard,
      false,
    )

    assert.equal(context.cache.channels.get(CHANNEL_ID), held, 'the reference was replaced')
    assert.ok(held?.isGuildBased())
    assert.equal(held.name, 'renamed')
  })

  it('CD5: hands the deleted channel to the listener, not just its ID', () => {
    // No REST route returns a deleted channel, so an ID here would be permanently opaque.
    const { router, context, emitted } = harness()
    router.route(dispatch('CHANNEL_CREATE', channelPayload(ChannelType.GuildText)), shard, false)
    router.route(dispatch('CHANNEL_DELETE', channelPayload(ChannelType.GuildText)), shard, false)

    assert.equal(context.cache.channels.get(CHANNEL_ID), undefined)
    const last = emitted.at(-1)
    assert.equal(last?.event, 'channelDelete')
    assert.ok(last.args[0] instanceof TextChannel)
  })

  it('CD6: deletes a thread that arrived as a channel delete', () => {
    // The dispatch does not say which scope held it, so both are cleared. Clearing only the
    // channels scope would leave the thread cached forever.
    const { router, context } = harness()
    router.route(dispatch('THREAD_CREATE', threadPayload()), shard, false)
    router.route(dispatch('CHANNEL_DELETE', threadPayload()), shard, false)

    assert.equal(context.cache.threads.get(THREAD_ID), undefined)
  })

  it('CD6b: takes a deleted channel messages and threads with it', () => {
    // The same leak as issue #15 one level down. A deleted channel's messages and the threads
    // hanging off it are unreachable the moment it goes: every dispatch that could name them is
    // about a channel that no longer exists.
    const { router, context } = harness({ channels: true, threads: true, messages: true })
    router.route(dispatch('CHANNEL_CREATE', channelPayload(ChannelType.GuildText)), shard, false)
    router.route(dispatch('THREAD_CREATE', threadPayload()), shard, false)
    router.route(
      dispatch('MESSAGE_CREATE', {
        id: 'm1',
        channel_id: CHANNEL_ID,
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
    // A message in the thread, which is grouped under the thread's own ID rather than the
    // parent's — the case a non-recursive eviction misses.
    router.route(
      dispatch('MESSAGE_CREATE', {
        id: 'm2',
        channel_id: THREAD_ID,
        guild_id: GUILD_ID,
        author: { id: '1', username: 'n', discriminator: '0', global_name: null, avatar: null },
        content: 'in the thread',
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

    assert.equal(context.cache.messages.size, 2)
    assert.equal(context.cache.threads.size, 1)

    router.route(dispatch('CHANNEL_DELETE', channelPayload(ChannelType.GuildText)), shard, false)

    assert.equal(context.cache.channels.size, 0)
    assert.equal(context.cache.threads.size, 0, 'the threads under it leaked')
    assert.equal(context.cache.messages.size, 0, 'its messages leaked')
  })

  it('CD6c: takes a deleted thread messages with it', () => {
    const { router, context } = harness({ threads: true, messages: true })
    router.route(dispatch('THREAD_CREATE', threadPayload()), shard, false)
    router.route(
      dispatch('MESSAGE_CREATE', {
        id: 'm1',
        channel_id: THREAD_ID,
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

    router.route(dispatch('THREAD_DELETE', threadPayload()), shard, false)

    assert.equal(context.cache.threads.size, 0)
    assert.equal(context.cache.messages.size, 0, 'the thread messages leaked')
  })

  it('CD7: emits nothing for a delete it never had cached', () => {
    const { router, emitted } = harness()
    router.route(dispatch('CHANNEL_DELETE', channelPayload(ChannelType.GuildText)), shard, false)

    assert.deepEqual(
      emitted.map((entry) => entry.event),
      ['raw'],
    )
  })

  it('CD8: seeds the channels and threads riding inside GUILD_CREATE', () => {
    // Those payloads carry no `guild_id` of their own, so the guild's ID has to be threaded
    // through: without it every channel learnt at startup is unkeyable, and that is nearly all
    // of them. Verified live — 36 sent, 36 cached.
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
        // Deliberately without `guild_id`, which is how Discord sends them here.
        channels: [
          {
            id: CHANNEL_ID,
            type: ChannelType.GuildText,
            name: 'general',
            position: 0,
            permission_overwrites: [],
          },
        ],
        threads: [
          {
            id: THREAD_ID,
            type: ChannelType.PublicThread,
            name: 'a thread',
            position: 0,
            parent_id: CHANNEL_ID,
          },
        ],
        voice_states: [],
        presences: [],
        stage_instances: [],
        guild_scheduled_events: [],
        soundboard_sounds: [],
      }),
      shard,
      false,
    )

    const channel = context.cache.channels.get(CHANNEL_ID)
    assert.ok(channel?.isGuildBased())
    assert.equal(channel.guildId, GUILD_ID)
    assert.equal(context.cache.threads.get(THREAD_ID)?.parentId, CHANNEL_ID)
  })

  it('CD9: still emits with both scopes switched off', () => {
    const { router, context, emitted } = harness({ channels: false, threads: false })
    router.route(dispatch('CHANNEL_CREATE', channelPayload(ChannelType.GuildText)), shard, false)

    assert.equal(context.cache.channels.size, 0)
    assert.equal(emitted.at(-1)?.event, 'channelCreate')
    assert.ok(emitted.at(-1)?.args[0] instanceof TextChannel)
  })
})
