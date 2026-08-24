import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import {
  GatewayOpcodes,
  StageInstancePrivacyLevel,
  type GatewayDispatchPayload,
} from '@vestra/types'
import {
  CacheRegistry,
  EventRouter,
  StageInstance,
  handlers,
  type CacheOptions,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }
const GUILD_ID = '613425648685547541'
const CHANNEL_ID = '41771983423143936'
const STAGE_ID = '840647391636226060'

function stagePayload(extra: Record<string, unknown> = {}): unknown {
  return {
    id: STAGE_ID,
    guild_id: GUILD_ID,
    channel_id: CHANNEL_ID,
    topic: 'Office hours',
    privacy_level: StageInstancePrivacyLevel.GuildOnly,
    discoverable_disabled: true,
    guild_scheduled_event_id: null,
    ...extra,
  }
}

/** Every scope on, so a write to any of them is visible. */
const ALL_SCOPES: CacheOptions = {
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
}

function harness(options: CacheOptions = ALL_SCOPES): {
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

describe('stage instance handlers', () => {
  it('SH1: emits the new stage as a structure', () => {
    const { router, emitted } = harness()
    router.route(dispatch('STAGE_INSTANCE_CREATE', stagePayload()), shard, false)

    const last = emitted.at(-1)
    assert.equal(last?.event, 'stageInstanceCreate')
    const stage = last.args[0]
    assert.ok(stage instanceof StageInstance)
    assert.equal(stage.id, STAGE_ID)
    assert.equal(stage.channelId, CHANNEL_ID)
    assert.equal(stage.topic, 'Office hours')
  })

  it('SH2: emits the updated stage, carrying the new topic', () => {
    const { router, emitted } = harness()
    router.route(
      dispatch('STAGE_INSTANCE_UPDATE', stagePayload({ topic: 'Now: questions' })),
      shard,
      false,
    )

    const last = emitted.at(-1)
    assert.equal(last?.event, 'stageInstanceUpdate')
    const stage = last.args[0]
    assert.ok(stage instanceof StageInstance)
    assert.equal(stage.topic, 'Now: questions')
  })

  it('SH3: emits the whole instance on a delete, not just its ID', () => {
    // The delete dispatch carries the full object, so the listener gets the topic and privacy
    // level of the stage that just ended. This is the half of the delete-handler rule that
    // `channelDelete` cannot have — there, the payload is a stub and only the cache can fill
    // it in. Emitting an ID here would throw away information that actually arrived.
    const { router, emitted } = harness()
    router.route(dispatch('STAGE_INSTANCE_DELETE', stagePayload()), shard, false)

    const last = emitted.at(-1)
    assert.equal(last?.event, 'stageInstanceDelete')
    const stage = last.args[0]
    assert.ok(stage instanceof StageInstance)
    assert.equal(stage.id, STAGE_ID)
    assert.equal(stage.topic, 'Office hours')
    assert.equal(stage.privacyLevel, StageInstancePrivacyLevel.GuildOnly)
    assert.equal(stage.guildId, GUILD_ID)
  })

  it('SH4: gives each dispatch its own event rather than one shared one', () => {
    // Three dispatches, three events. Registering a handler under the wrong dispatch name is
    // the failure `EventHandler.event` exists to catch, and this is what proves the three are
    // wired the way they are named.
    const { router, emitted } = harness()
    router.route(dispatch('STAGE_INSTANCE_CREATE', stagePayload()), shard, false)
    router.route(dispatch('STAGE_INSTANCE_UPDATE', stagePayload()), shard, false)
    router.route(dispatch('STAGE_INSTANCE_DELETE', stagePayload()), shard, false)

    // `raw` fires for every dispatch and is not what this is about.
    assert.deepEqual(
      emitted.map((entry) => entry.event).filter((event) => event !== 'raw'),
      ['stageInstanceCreate', 'stageInstanceUpdate', 'stageInstanceDelete'],
    )
  })

  it('SH5: caches no stage instance anywhere', () => {
    // The decision recorded on `StageInstance`: a guild has at most one live stage per stage
    // channel and most never open one, so a scope would sit empty in almost every process.
    const { router, context } = harness()
    router.route(dispatch('STAGE_INSTANCE_CREATE', stagePayload()), shard, false)
    router.route(dispatch('STAGE_INSTANCE_UPDATE', stagePayload()), shard, false)

    const filled = context.cache.stores
      .filter((store) => store.size > 0)
      .map((store) => store.scope)
    assert.deepEqual(filled, [], 'the stage handlers must write to no scope')
  })
})
