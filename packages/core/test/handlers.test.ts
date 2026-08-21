import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import { GatewayOpcodes, type GatewayDispatchPayload } from '@vestra/types'
import {
  CacheRegistry,
  EventRouter,
  handlers,
  type CacheOptions,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }

const USER = {
  id: '80351110224678912',
  username: 'nelly',
  discriminator: '0',
  global_name: null,
  avatar: null,
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

describe('handler registry', () => {
  it('EH1: registers every handler without a duplicate', () => {
    // `register` throws on a second handler for one event, so this failing means the
    // registry lists something twice.
    const { router } = harness()
    assert.equal(router.size, handlers.length)
    assert.ok(handlers.length >= 11, 'the registry must not have quietly emptied')
  })

  it('EH2: files each handler under its own event name', () => {
    // The registry is a plain array precisely so the key cannot disagree with the handler.
    const { router } = harness()
    for (const handler of handlers) {
      assert.equal(router.handles(handler.event), true, `${handler.event} is not routed`)
    }
  })

  it('EH3: caches and emits a created message end to end', () => {
    const { router, emitted, context } = harness({ messages: true })

    router.route(
      dispatch('MESSAGE_CREATE', {
        id: '1',
        channel_id: '2',
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
      }),
      shard,
    )

    assert.equal(context.cache.messages.get('1')?.content, 'hello')
    assert.ok(emitted.some((entry) => entry.event === 'messageCreate'))
  })

  it('EH4: keeps working with every scope disabled, which is the default', () => {
    // The canonical handler shape caches and emits in one line; `add` returning its
    // argument is what lets that serve both configurations.
    const { router, emitted, context } = harness()

    router.route(
      dispatch('MESSAGE_CREATE', {
        id: '1',
        channel_id: '2',
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
      }),
      shard,
    )

    assert.equal(context.cache.messages.size, 0, 'nothing cached')
    const emit = emitted.find((entry) => entry.event === 'messageCreate')
    assert.ok(emit !== undefined, 'the event still fires')
  })

  it('EH5: applies READY to the client identity', () => {
    const { router, context } = harness()

    router.route(
      dispatch('READY', {
        v: 10,
        user: USER,
        guilds: [],
        session_id: 's',
        resume_gateway_url: 'wss://x/',
        application: { id: '1', flags: 0 },
      }),
      shard,
    )

    assert.equal(context.user?.username, 'nelly')
  })

  it('EH7: the READY handler sets the identity and does not announce it', () => {
    // `ready` promises once per client and a handler runs once per shard, so the handler
    // sets `user` and the Client owns the announcement. Emitting from both fired a live
    // two-shard run's startup listener twice, which no unit test noticed at the time.
    const { router, context, emitted } = harness()

    router.route(
      dispatch('READY', {
        v: 10,
        user: USER,
        guilds: [],
        session_id: 's',
        resume_gateway_url: 'wss://x/',
        application: { id: '1', flags: 0 },
      }),
      shard,
    )

    assert.equal(context.user?.username, 'nelly', 'the handler must set the identity')
    assert.equal(
      emitted.some((entry) => entry.event === 'ready'),
      false,
      'announcing is not',
    )
  })

  it('EH6: is idempotent under replay', () => {
    // Handlers are pure functions of (cache, data), so applying the same dispatch twice
    // leaves the cache in the same state. That is what makes a resume safe without any
    // handler checking a flag.
    const { router, context } = harness({ members: true })
    const payload = dispatch('GUILD_MEMBER_ADD', {
      guild_id: '9',
      user: USER,
      roles: [],
      joined_at: '2021-01-01T00:00:00+00:00',
      deaf: false,
      mute: false,
      flags: 0,
    })

    router.route(payload, shard)
    const afterFirst = context.cache.members.size

    router.route(payload, shard, true)
    assert.equal(context.cache.members.size, afterFirst, 'a replay must not duplicate')
    assert.equal(context.cache.member('9', USER.id)?.userId, USER.id)
  })
})
