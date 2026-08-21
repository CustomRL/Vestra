import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import { GatewayOpcodes, type GatewayDispatchPayload } from '@vestra/types'
import {
  CacheRegistry,
  EventRouter,
  defineHandler,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }

interface Emitted {
  event: string
  args: unknown[]
}

function context(): { context: EventContext; emitted: Emitted[] } {
  const emitted: Emitted[] = []
  return {
    emitted,
    context: {
      cache: new CacheRegistry(),
      rest: undefined as never,
      user: undefined,
      emit: (event: string, ...args: unknown[]) => {
        emitted.push({ event, args })
        return true
      },
      listenerCount: () => 0,
    },
  }
}

function dispatch(t: string, d: unknown = {}): GatewayDispatchPayload {
  return { op: GatewayOpcodes.Dispatch, t, s: 1, d } as GatewayDispatchPayload
}

describe('event router', () => {
  it('EV1: routes a dispatch to the handler registered for it', () => {
    const seen: string[] = []
    const { context: ctx } = context()
    const router = new EventRouter(ctx, [
      defineHandler('MESSAGE_CREATE', () => seen.push('create')),
      defineHandler('MESSAGE_DELETE', () => seen.push('delete')),
    ])

    router.route(dispatch('MESSAGE_DELETE'), shard)
    assert.deepEqual(seen, ['delete'], 'only the matching handler runs')
  })

  it('EV2: treats an unhandled event as ordinary, not as an error', () => {
    // Most of the seventy-six have no handler and are not meant to. Reaching consumers
    // through `raw` alone is what makes adding a handler later purely additive.
    const { context: ctx, emitted } = context()
    const router = new EventRouter(ctx)

    router.route(dispatch('ENTITLEMENT_CREATE'), shard)

    assert.deepEqual(
      emitted.map((entry) => entry.event),
      ['raw'],
      'raw only — no error, no derived event',
    )
  })

  it('EV3: emits raw before the handler runs', () => {
    // So a consumer watching raw sees the payload as it arrived, not after the cache has
    // been updated from it.
    const order: string[] = []
    const { context: ctx } = context()
    const router = new EventRouter(
      {
        ...ctx,
        emit: ((event: string) => {
          order.push(`emit:${event}`)
          return true
        }) as EventContext['emit'],
      },
      [defineHandler('MESSAGE_CREATE', () => order.push('handler'))],
    )

    router.route(dispatch('MESSAGE_CREATE'), shard)
    assert.deepEqual(order, ['emit:raw', 'handler'])
  })

  it('EV4: contains a throwing handler and reports it', () => {
    // Handlers run consumer code — a cache filter, listeners somebody else wrote — so a
    // throw is not hypothetical, and it must not take the connection with it.
    const { context: ctx, emitted } = context()
    const router = new EventRouter(ctx, [
      defineHandler('MESSAGE_CREATE', () => {
        throw new Error('handler exploded')
      }),
    ])

    assert.doesNotThrow(() => {
      router.route(dispatch('MESSAGE_CREATE'), shard)
    })

    const error = emitted.find((entry) => entry.event === 'error')
    assert.ok(error !== undefined, 'the failure must be reported')
    assert.equal((error.args[0] as Error).message, 'handler exploded')
    assert.deepEqual(error.args[1], { event: 'MESSAGE_CREATE', shardId: 0 })
  })

  it('EV5: contains a throwing raw listener too', () => {
    // Containing a messageCreate listener but not a raw one would be an inconsistency with
    // no defence: both are consumer code on the same path.
    const { context: ctx } = context()
    const router = new EventRouter(
      {
        ...ctx,
        emit: ((event: string) => {
          if (event === 'raw') throw new Error('raw listener exploded')
          return true
        }) as EventContext['emit'],
      },
      [],
    )

    assert.doesNotThrow(() => {
      router.route(dispatch('MESSAGE_CREATE'), shard)
    })
  })

  it('EV6: turns a non-Error throw into an Error', () => {
    // Consumer code can throw anything. An `error` event carrying a string would break
    // every listener that reads `.message`.
    const { context: ctx, emitted } = context()
    const router = new EventRouter(ctx, [
      defineHandler('MESSAGE_CREATE', () => {
        // Consumer code can throw anything; `only-throw-error` is disabled for this one
        // line because throwing a non-Error is precisely what is under test.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'a string'
      }),
    ])

    router.route(dispatch('MESSAGE_CREATE'), shard)
    const error = emitted.find((entry) => entry.event === 'error')
    assert.ok(error?.args[0] instanceof Error)
  })

  it('EV7: refuses a second handler for one event', () => {
    // Always a mistake — a duplicated registry line, or a copy-paste that kept the wrong
    // event name — and which one wins would otherwise depend on registration order.
    const { context: ctx } = context()
    const router = new EventRouter(ctx, [defineHandler('MESSAGE_CREATE', () => undefined)])

    assert.throws(() => {
      router.register(defineHandler('MESSAGE_CREATE', () => undefined))
    }, /already registered/)
  })

  it('EV8: passes the replayed flag to raw and nothing else', () => {
    // Handlers are pure functions of (cache, data), which is what makes them idempotent by
    // construction rather than by each one remembering to check a flag.
    const { context: ctx, emitted } = context()
    const router = new EventRouter(ctx, [defineHandler('MESSAGE_CREATE', () => undefined)])

    router.route(dispatch('MESSAGE_CREATE'), shard, true)
    const raw = emitted.find((entry) => entry.event === 'raw')
    assert.equal(raw?.args[2], true)
  })
})
