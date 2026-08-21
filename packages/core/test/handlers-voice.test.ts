import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import { GatewayOpcodes, type GatewayDispatchPayload } from '@vestra/types'
import {
  CacheRegistry,
  EventRouter,
  handlers,
  VoiceState,
  type CacheOptions,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }
const GUILD_ID = '613425648685547541'
const USER_ID = '80351110224678912'
const CHANNEL_A = '111'
const CHANNEL_B = '222'

function voiceState(extra: Record<string, unknown> = {}): unknown {
  return {
    guild_id: GUILD_ID,
    channel_id: CHANNEL_A,
    user_id: USER_ID,
    session_id: 'session-1',
    deaf: false,
    mute: false,
    self_deaf: false,
    self_mute: false,
    self_video: false,
    suppress: false,
    request_to_speak_timestamp: null,
    ...extra,
  }
}

function harness(options: CacheOptions = { voiceStates: true, members: true }): {
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

describe('voice state handler', () => {
  it('V1: caches a join and reports no previous state', () => {
    const { router, context, emitted } = harness()
    router.route(dispatch('VOICE_STATE_UPDATE', voiceState()), shard, false)

    assert.equal(context.cache.voiceState(GUILD_ID, USER_ID)?.channelId, CHANNEL_A)
    assert.deepEqual(emitted.at(-1)?.args.slice(0, 3), [GUILD_ID, USER_ID, undefined])
    assert.ok(emitted.at(-1)?.args[3] instanceof VoiceState)
  })

  it('V2: hands the listener the state as it was before the change', () => {
    // The one place this library gives a listener an old object. Without it, "did they move
    // channel or just mute themselves" is unanswerable and every consumer keeps a shadow copy
    // of the cache to work it out.
    const { router, emitted } = harness()
    router.route(dispatch('VOICE_STATE_UPDATE', voiceState()), shard, false)
    router.route(
      dispatch('VOICE_STATE_UPDATE', voiceState({ channel_id: CHANNEL_B, self_mute: true })),
      shard,
      false,
    )

    const [, , previous, current] = emitted.at(-1)?.args as [string, string, VoiceState, VoiceState]
    assert.equal(previous.channelId, CHANNEL_A)
    assert.equal(previous.selfMute, false)
    assert.equal(current.channelId, CHANNEL_B)
    assert.equal(current.selfMute, true)
  })

  it('V3: patches in place so a held reference stays live', () => {
    const { router, context } = harness()
    router.route(dispatch('VOICE_STATE_UPDATE', voiceState()), shard, false)
    const held = context.cache.voiceState(GUILD_ID, USER_ID)

    router.route(dispatch('VOICE_STATE_UPDATE', voiceState({ self_mute: true })), shard, false)

    assert.equal(held?.selfMute, true)
    assert.equal(context.cache.voiceState(GUILD_ID, USER_ID), held)
  })

  it('V4: removes the entry on a disconnect rather than keeping an empty one', () => {
    // Keeping it would make `voiceStates.size` count everyone who has ever been in voice, and
    // `voiceState(guild, user)` returning an object reads as "they are connected" to every
    // caller who did not also check `channelId`.
    const { router, context, emitted } = harness()
    router.route(dispatch('VOICE_STATE_UPDATE', voiceState()), shard, false)
    router.route(dispatch('VOICE_STATE_UPDATE', voiceState({ channel_id: null })), shard, false)

    assert.equal(context.cache.voiceState(GUILD_ID, USER_ID), undefined)
    assert.equal(context.cache.voiceStates.size, 0)

    const [guildId, userId, previous, current] = emitted.at(-1)?.args as [
      string,
      string,
      VoiceState,
      undefined,
    ]
    assert.equal(guildId, GUILD_ID)
    assert.equal(userId, USER_ID)
    assert.equal(previous.channelId, CHANNEL_A)
    assert.equal(current, undefined)
  })

  it('V5: still announces a disconnect it has no cached state for', () => {
    // The scope is off by default, so gating the departure on a cache hit made the one event a
    // "who left voice" bot exists to hear silent on most clients — while joins and moves kept
    // firing, which is what made it look like the event worked.
    //
    // Discord said they left; reporting that is not inventing an event. `previous` is
    // `undefined`, which is the honest answer to what they were doing before, and the IDs say
    // who and where regardless.
    const { router, emitted } = harness({ voiceStates: false })
    router.route(dispatch('VOICE_STATE_UPDATE', voiceState({ channel_id: null })), shard, false)

    assert.deepEqual(emitted.at(-1), {
      event: 'voiceStateUpdate',
      args: [GUILD_ID, USER_ID, undefined, undefined],
    })
  })

  it('V5b: reports a join with the scope off, so the event does not depend on caching', () => {
    const { router, emitted } = harness({ voiceStates: false })
    router.route(dispatch('VOICE_STATE_UPDATE', voiceState()), shard, false)

    const last = emitted.at(-1)
    assert.equal(last?.event, 'voiceStateUpdate')
    assert.deepEqual(last.args.slice(0, 2), [GUILD_ID, USER_ID])
    assert.ok(last.args[3] instanceof VoiceState)
  })

  it('V6: ignores a voice state with no guild', () => {
    const { router, context, emitted } = harness()
    router.route(dispatch('VOICE_STATE_UPDATE', voiceState({ guild_id: undefined })), shard, false)

    assert.equal(context.cache.voiceStates.size, 0)
    assert.deepEqual(
      emitted.map((entry) => entry.event),
      ['raw'],
    )
  })

  it('V7: caches the member riding along on a join', () => {
    const { router, context } = harness()
    router.route(
      dispatch(
        'VOICE_STATE_UPDATE',
        voiceState({
          member: {
            user: {
              id: USER_ID,
              username: 'nelly',
              discriminator: '0',
              global_name: null,
              avatar: null,
            },
            roles: [],
            joined_at: '2021-03-14T12:00:00.000000+00:00',
            deaf: false,
            mute: false,
            flags: 0,
          },
        }),
      ),
      shard,
      false,
    )

    assert.equal(context.cache.member(GUILD_ID, USER_ID)?.userId, USER_ID)
  })

  it('V8: groups states by guild', () => {
    const { router, context } = harness()
    router.route(dispatch('VOICE_STATE_UPDATE', voiceState()), shard, false)
    router.route(
      dispatch('VOICE_STATE_UPDATE', voiceState({ user_id: '999', session_id: 's2' })),
      shard,
      false,
    )

    assert.equal(context.cache.voiceStates.group(GUILD_ID).length, 2)
  })
})

describe('leaving a guild', () => {
  it('V11: takes the departing member voice state and presence with them', () => {
    // Both are keyed `guildId:userId`, so both die with the membership. Leaving them behind
    // means `voiceState(guild, user)` keeps reporting somebody as connected to a channel in a
    // guild they are no longer in.
    const { router, context } = harness({
      voiceStates: true,
      members: true,
      presences: true,
      users: true,
    })
    router.route(dispatch('VOICE_STATE_UPDATE', voiceState()), shard, false)
    router.route(
      dispatch('PRESENCE_UPDATE', {
        user: { id: USER_ID },
        guild_id: GUILD_ID,
        status: 'online',
        activities: [],
        client_status: {},
      }),
      shard,
      false,
    )
    assert.equal(context.cache.voiceStates.size, 1)
    assert.equal(context.cache.presences.size, 1)

    router.route(
      dispatch('GUILD_MEMBER_REMOVE', {
        guild_id: GUILD_ID,
        user: { id: USER_ID, username: 'n', discriminator: '0', global_name: null, avatar: null },
      }),
      shard,
      false,
    )

    assert.equal(context.cache.voiceStates.size, 0, 'the voice state leaked')
    assert.equal(context.cache.presences.size, 0, 'the presence leaked')
    // The user survives: they may still be in other guilds.
    assert.equal(context.cache.users.size, 1)
  })
})

describe('VoiceState structure', () => {
  it('V9: clones through the constructor, keeping one shape', () => {
    const original = new VoiceState(voiceState() as never, GUILD_ID, undefined)
    const copy = original.clone()

    assert.notEqual(copy, original)
    assert.deepEqual(Object.keys(copy), Object.keys(original))
    assert.equal(copy.channelId, original.channelId)
    assert.equal(copy.guildId, GUILD_ID)

    // Detached: mutating the original must not reach the copy, which is the whole point.
    original.patch(voiceState({ self_mute: true }) as never)
    assert.equal(copy.selfMute, false)
  })

  it('V10: keeps the two mute flags distinct and combines them only on request', () => {
    // A bot deciding whether somebody can be heard needs both; collapsing them into one
    // boolean silently makes moderation tooling wrong.
    const serverMuted = new VoiceState(voiceState({ mute: true }) as never, GUILD_ID, undefined)
    const selfMuted = new VoiceState(voiceState({ self_mute: true }) as never, GUILD_ID, undefined)

    assert.equal(serverMuted.mute, true)
    assert.equal(serverMuted.selfMute, false)
    assert.equal(serverMuted.muted, true)

    assert.equal(selfMuted.mute, false)
    assert.equal(selfMuted.selfMute, true)
    assert.equal(selfMuted.muted, true)

    // Deafening is not muting: a deafened member can still speak.
    const deafened = new VoiceState(voiceState({ self_deaf: true }) as never, GUILD_ID, undefined)
    assert.equal(deafened.deafened, true)
    assert.equal(deafened.muted, false)
  })
})
