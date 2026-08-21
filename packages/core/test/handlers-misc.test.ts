import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import { ChannelType, GatewayOpcodes, type GatewayDispatchPayload } from '@vestra/types'
import {
  CacheRegistry,
  EventRouter,
  GuildTextBasedChannel,
  handlers,
  type CacheOptions,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }
const GUILD_ID = '613425648685547541'
const CHANNEL_ID = '41771983423143936'
const USER = {
  id: '80351110224678912',
  username: 'nelly',
  discriminator: '0',
  global_name: null,
  avatar: null,
}

function harness(options: CacheOptions = { channels: true, messages: true, members: true }): {
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

function message(id: string): unknown {
  return {
    id,
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
}

function textChannel(extra: Record<string, unknown> = {}): unknown {
  return {
    id: CHANNEL_ID,
    type: ChannelType.GuildText,
    guild_id: GUILD_ID,
    name: 'general',
    position: 0,
    permission_overwrites: [],
    parent_id: null,
    nsfw: false,
    ...extra,
  }
}

describe('bulk message deletes', () => {
  it('MB1: drops every deleted message from the cache', () => {
    const { router, context } = harness()
    router.route(dispatch('MESSAGE_CREATE', message('1')), shard, false)
    router.route(dispatch('MESSAGE_CREATE', message('2')), shard, false)
    router.route(dispatch('MESSAGE_CREATE', message('3')), shard, false)

    router.route(
      dispatch('MESSAGE_DELETE_BULK', { ids: ['1', '3'], channel_id: CHANNEL_ID }),
      shard,
      false,
    )

    assert.equal(context.cache.messages.get('1'), undefined)
    assert.equal(context.cache.messages.get('3'), undefined)
    assert.equal(context.cache.messages.get('2')?.content, 'hello')
  })

  it('MB2: fires once for the batch, not once per message', () => {
    // A moderator clearing a hundred messages would otherwise fire a hundred delete listeners,
    // which is how a bot that logs deletions gets rate-limited by its own audit channel.
    const { router, emitted } = harness()
    router.route(
      dispatch('MESSAGE_DELETE_BULK', {
        ids: ['1', '2', '3'],
        channel_id: CHANNEL_ID,
        guild_id: GUILD_ID,
      }),
      shard,
      false,
    )

    const deletes = emitted.filter((entry) => entry.event.startsWith('messageDelete'))
    assert.deepEqual(deletes, [
      { event: 'messageDeleteBulk', args: [['1', '2', '3'], CHANNEL_ID, GUILD_ID] },
    ])
  })
})

describe('channel pins', () => {
  it('MB3: writes the new pin time through to the cached channel', () => {
    // Discord sends no CHANNEL_UPDATE alongside this, so without the write-through the field
    // goes stale the first time anybody pins anything.
    const { router, context } = harness()
    router.route(
      dispatch('CHANNEL_CREATE', textChannel({ last_pin_timestamp: null })),
      shard,
      false,
    )

    router.route(
      dispatch('CHANNEL_PINS_UPDATE', {
        channel_id: CHANNEL_ID,
        guild_id: GUILD_ID,
        last_pin_timestamp: '2024-05-01T10:00:00+00:00',
      }),
      shard,
      false,
    )

    const channel = context.cache.channels.get(CHANNEL_ID)
    assert.ok(channel instanceof GuildTextBasedChannel)
    assert.equal(channel.lastPinTimestamp, '2024-05-01T10:00:00+00:00')
  })

  it('MB4: tells absent apart from null', () => {
    // Optional and nullable mean different things here: absent is "the payload said nothing",
    // null is "there is nothing pinned any more". Treating the first as the second would blank
    // a live pin time on every event that omitted it.
    const { router, context, emitted } = harness()
    router.route(
      dispatch('CHANNEL_CREATE', textChannel({ last_pin_timestamp: '2024-01-01T00:00:00+00:00' })),
      shard,
      false,
    )

    router.route(
      dispatch('CHANNEL_PINS_UPDATE', { channel_id: CHANNEL_ID, guild_id: GUILD_ID }),
      shard,
      false,
    )

    const channel = context.cache.channels.get(CHANNEL_ID)
    assert.ok(channel instanceof GuildTextBasedChannel)
    assert.equal(channel.lastPinTimestamp, '2024-01-01T00:00:00+00:00')
    assert.deepEqual(emitted.at(-1)?.args, [CHANNEL_ID, GUILD_ID, null])
  })

  it('MB5: clears the pin time when the channel has nothing pinned', () => {
    const { router, context } = harness()
    router.route(
      dispatch('CHANNEL_CREATE', textChannel({ last_pin_timestamp: '2024-01-01T00:00:00+00:00' })),
      shard,
      false,
    )

    router.route(
      dispatch('CHANNEL_PINS_UPDATE', {
        channel_id: CHANNEL_ID,
        guild_id: GUILD_ID,
        last_pin_timestamp: null,
      }),
      shard,
      false,
    )

    const channel = context.cache.channels.get(CHANNEL_ID)
    assert.ok(channel instanceof GuildTextBasedChannel)
    assert.equal(channel.lastPinTimestamp, null)
  })
})

describe('typing', () => {
  it('MB6: caches the member riding inside the payload', () => {
    // Often the first time the bot has seen them, and a bot that reacts to typing usually
    // wants to know who.
    const { router, context } = harness()
    router.route(
      dispatch('TYPING_START', {
        channel_id: CHANNEL_ID,
        guild_id: GUILD_ID,
        user_id: USER.id,
        timestamp: 1700000000,
        member: {
          user: USER,
          roles: [],
          joined_at: '2021-03-14T12:00:00.000000+00:00',
          deaf: false,
          mute: false,
          flags: 0,
        },
      }),
      shard,
      false,
    )

    assert.equal(context.cache.member(GUILD_ID, USER.id)?.userId, USER.id)
  })

  it('MB7: reports the start time in milliseconds', () => {
    // Seconds on the wire, milliseconds everywhere else in the library. Converting in the
    // handler stops this being the one event with a different time unit.
    const { router, emitted } = harness()
    router.route(
      dispatch('TYPING_START', {
        channel_id: CHANNEL_ID,
        user_id: USER.id,
        timestamp: 1700000000,
      }),
      shard,
      false,
    )

    assert.deepEqual(emitted.at(-1), {
      event: 'typingStart',
      args: [CHANNEL_ID, USER.id, undefined, 1700000000000],
    })
  })

  it('MB8: survives a direct message, which carries no guild or member', () => {
    const { router, context, emitted } = harness()
    router.route(
      dispatch('TYPING_START', { channel_id: CHANNEL_ID, user_id: USER.id, timestamp: 1 }),
      shard,
      false,
    )

    assert.equal(context.cache.members.size, 0)
    assert.equal(emitted.at(-1)?.event, 'typingStart')
  })
})
