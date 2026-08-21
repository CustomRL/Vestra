import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import { GatewayOpcodes, type GatewayDispatchPayload } from '@vestra/types'
import {
  CacheRegistry,
  EventRouter,
  handlers,
  ReactionEmoji,
  type CacheOptions,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }
const GUILD_ID = '613425648685547541'
const CHANNEL_ID = '41771983423143936'
const MESSAGE_ID = '900000000000000000'
const USER = {
  id: '80351110224678912',
  username: 'nelly',
  discriminator: '0',
  global_name: null,
  avatar: null,
}

const UNICODE = { id: null, name: '👍' }
const CUSTOM = { id: '123456789', name: 'vestra', animated: false }

function harness(options: CacheOptions = { members: true, users: true }): {
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

describe('reaction handlers', () => {
  it('RX1: reports the IDs and a converted emoji', () => {
    const { router, emitted } = harness()
    router.route(
      dispatch('MESSAGE_REACTION_ADD', {
        user_id: USER.id,
        channel_id: CHANNEL_ID,
        message_id: MESSAGE_ID,
        guild_id: GUILD_ID,
        emoji: UNICODE,
        burst: false,
        type: 0,
      }),
      shard,
      false,
    )

    const last = emitted.at(-1)
    assert.equal(last?.event, 'messageReactionAdd')
    assert.ok(last.args[0] instanceof ReactionEmoji)
    assert.deepEqual(last.args.slice(1), [MESSAGE_ID, CHANNEL_ID, USER.id, GUILD_ID])
  })

  it('RX2: caches the member riding along on a reaction', () => {
    // Often the first sight of them: a lurker's first interaction with a bot is frequently a
    // reaction rather than a message.
    const { router, context } = harness()
    router.route(
      dispatch('MESSAGE_REACTION_ADD', {
        user_id: USER.id,
        channel_id: CHANNEL_ID,
        message_id: MESSAGE_ID,
        guild_id: GUILD_ID,
        emoji: UNICODE,
        burst: false,
        type: 0,
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
    assert.equal(context.cache.users.get(USER.id)?.username, 'nelly')
  })

  it('RX3: survives a reaction in a direct message', () => {
    const { router, context, emitted } = harness()
    router.route(
      dispatch('MESSAGE_REACTION_ADD', {
        user_id: USER.id,
        channel_id: CHANNEL_ID,
        message_id: MESSAGE_ID,
        emoji: UNICODE,
        burst: false,
        type: 0,
      }),
      shard,
      false,
    )

    assert.equal(context.cache.members.size, 0)
    assert.equal(emitted.at(-1)?.args[4], undefined)
  })

  it('RX4: tells one person un-reacting apart from a moderator clearing an emoji', () => {
    // Different events with different argument counts: there is no user on the moderator one,
    // because there is no one user.
    const { router, emitted } = harness()
    router.route(
      dispatch('MESSAGE_REACTION_REMOVE', {
        user_id: USER.id,
        channel_id: CHANNEL_ID,
        message_id: MESSAGE_ID,
        guild_id: GUILD_ID,
        emoji: UNICODE,
        burst: false,
        type: 0,
      }),
      shard,
      false,
    )
    const single = emitted.at(-1)

    router.route(
      dispatch('MESSAGE_REACTION_REMOVE_EMOJI', {
        channel_id: CHANNEL_ID,
        message_id: MESSAGE_ID,
        guild_id: GUILD_ID,
        emoji: UNICODE,
      }),
      shard,
      false,
    )
    const everyones = emitted.at(-1)

    assert.equal(single?.event, 'messageReactionRemove')
    assert.equal(single.args.length, 5)
    assert.equal(everyones?.event, 'messageReactionRemoveEmoji')
    assert.equal(everyones.args.length, 4)
  })

  it('RX5: fires once when every reaction is cleared', () => {
    // One event rather than a burst, for the same reason MESSAGE_DELETE_BULK is one event.
    const { router, emitted } = harness()
    router.route(
      dispatch('MESSAGE_REACTION_REMOVE_ALL', {
        channel_id: CHANNEL_ID,
        message_id: MESSAGE_ID,
        guild_id: GUILD_ID,
      }),
      shard,
      false,
    )

    assert.deepEqual(emitted.at(-1), {
      event: 'messageReactionRemoveAll',
      args: [MESSAGE_ID, CHANNEL_ID, GUILD_ID],
    })
  })
})

describe('ReactionEmoji', () => {
  it('RX6: gives the REST routes an unencoded identifier', () => {
    // `rest.channels.addReaction` encodes what it is given. Encoding here as well produces
    // `%25F0%259F...`, which Discord rejects with a 400 that blames the emoji.
    assert.equal(new ReactionEmoji(UNICODE).identifier, '👍')
    assert.equal(new ReactionEmoji(CUSTOM).identifier, 'vestra:123456789')
  })

  it('RX7: keeps the identifier and the message markup apart', () => {
    // The classic reaction bug: the route takes `name:id` and rejects `<:name:id>`.
    assert.equal(String(new ReactionEmoji(CUSTOM)), '<:vestra:123456789>')
    assert.equal(String(new ReactionEmoji(UNICODE)), '👍')
    assert.notEqual(new ReactionEmoji(CUSTOM).identifier, String(new ReactionEmoji(CUSTOM)))
  })

  it('RX8: knows a custom emoji from a Unicode one', () => {
    assert.equal(new ReactionEmoji(CUSTOM).custom, true)
    assert.equal(new ReactionEmoji(UNICODE).custom, false)
  })

  it('RX9: marks an animated custom emoji in its markup', () => {
    const animated = new ReactionEmoji({ ...CUSTOM, animated: true })
    assert.equal(String(animated), '<a:vestra:123456789>')
    // The identifier does not carry the `a`, and adding it would 400.
    assert.equal(animated.identifier, 'vestra:123456789')
  })
})
