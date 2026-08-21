import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  GatewayCloseCodes,
  GatewayDispatchEvents,
  GatewayIntentBits,
  GatewayOpcodes,
  UnrecoverableGatewayCloseCodes,
  type GatewayDispatchData,
  type GatewayDispatchEventMap,
  type GatewayReceivePayload,
} from '@vestra/types'

/**
 * The shard state machine in `@vestra/gateway` is a `switch` over `op`. If this union
 * stops narrowing, that switch silently degrades to casts, so the property is pinned here
 * where breaking it is a compile error.
 */
function handle(payload: GatewayReceivePayload): string {
  switch (payload.op) {
    case GatewayOpcodes.Hello:
      // `heartbeat_interval` exists on no other member of the union.
      return `hello:${String(payload.d.heartbeat_interval)}`
    case GatewayOpcodes.Dispatch:
      return `dispatch:${payload.t}:${String(payload.s)}`
    case GatewayOpcodes.InvalidSession:
      return `invalid:${String(payload.d)}`
    case GatewayOpcodes.Heartbeat:
      return 'heartbeat-request'
    case GatewayOpcodes.HeartbeatAck:
      return 'ack'
    case GatewayOpcodes.Reconnect:
      return 'reconnect'
  }
}

describe('GatewayReceivePayload narrowing', () => {
  it('narrows hello to its heartbeat interval', () => {
    assert.equal(
      handle({ op: GatewayOpcodes.Hello, t: null, s: null, d: { heartbeat_interval: 41_250 } }),
      'hello:41250',
    )
  })

  it('narrows a dispatch to its event name and sequence', () => {
    assert.equal(
      handle({
        op: GatewayOpcodes.Dispatch,
        t: GatewayDispatchEvents.Resumed,
        s: 7,
        d: undefined,
      }),
      'dispatch:RESUMED:7',
    )
  })

  it('narrows invalid session to its resumable flag', () => {
    assert.equal(
      handle({ op: GatewayOpcodes.InvalidSession, t: null, s: null, d: false }),
      'invalid:false',
    )
  })
})

describe('gateway close codes', () => {
  it('classifies the misconfiguration codes as unrecoverable', () => {
    // Reconnecting on any of these loops forever, so the list must not silently shrink.
    assert.ok(UnrecoverableGatewayCloseCodes.includes(GatewayCloseCodes.AuthenticationFailed))
    assert.ok(UnrecoverableGatewayCloseCodes.includes(GatewayCloseCodes.DisallowedIntents))
    assert.ok(UnrecoverableGatewayCloseCodes.includes(GatewayCloseCodes.InvalidIntents))
    assert.ok(UnrecoverableGatewayCloseCodes.includes(GatewayCloseCodes.ShardingRequired))
  })

  it('leaves transient codes recoverable', () => {
    assert.ok(!UnrecoverableGatewayCloseCodes.includes(GatewayCloseCodes.UnknownError))
    assert.ok(!UnrecoverableGatewayCloseCodes.includes(GatewayCloseCodes.SessionTimedOut))
    assert.ok(!UnrecoverableGatewayCloseCodes.includes(GatewayCloseCodes.RateLimited))
  })
})

describe('gateway intents', () => {
  it('combines into a bit set without collision', () => {
    const intents = GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages
    assert.equal(intents & GatewayIntentBits.Guilds, GatewayIntentBits.Guilds)
    assert.equal(intents & GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessages)
    assert.equal(intents & GatewayIntentBits.MessageContent, 0)
  })
})

describe('dispatch event names', () => {
  it('uses SCREAMING_SNAKE_CASE wire values throughout', () => {
    const offenders = Object.entries(GatewayDispatchEvents).filter(
      ([, value]) => !/^[A-Z][A-Z0-9_]*$/.test(value),
    )
    assert.deepEqual(offenders, [], 'dispatch event values must match Discord wire format')
  })

  /**
   * Every key of the event map must be a real dispatch event name.
   *
   * @remarks
   * A compile-time check rather than a runtime one, because the map is types-only and
   * erases. It exists because the failure it catches is silent: a mistyped key such as
   * `THREAD_MEMBER_UPDATED` is still a perfectly legal interface member, it simply never
   * matches a payload, and the event it was meant to describe keeps resolving to
   * `unknown` with nothing to indicate why.
   */
  it('maps only real event names', () => {
    // Resolves to `true` only when every key is a genuine event name. A stray key makes
    // it `false`, and the assignment below stops compiling.
    type NoStrayKeys =
      Exclude<keyof GatewayDispatchEventMap, GatewayDispatchEvents> extends never ? true : false

    const noStrayKeys: NoStrayKeys = true
    assert.equal(noStrayKeys, true)
  })

  /**
   * Every dispatch event must have a payload type.
   *
   * @remarks
   * Coverage reached all seventy-six events, so completeness is now enforceable rather
   * than aspirational. Adding a name to `GatewayDispatchEvents` without a matching row in
   * `GatewayDispatchEventMap` breaks this, which is the intent: the event would otherwise
   * resolve to `unknown` and the gap would be invisible until a consumer tripped over it.
   *
   * If an event genuinely cannot be modelled yet, map it to `unknown` explicitly. That is
   * the same type a missing row produces, but it is a decision on the record instead of an
   * oversight.
   */
  it('gives every dispatch event a payload type', () => {
    // `true` only while every event name is a key of the map; a gap makes it `false` and
    // the assignment stops compiling.
    type FullCoverage =
      Exclude<GatewayDispatchEvents, keyof GatewayDispatchEventMap> extends never ? true : false

    const fullCoverage: FullCoverage = true
    assert.equal(fullCoverage, true)
  })

  /**
   * Events that have been given a payload type must keep one.
   *
   * @remarks
   * Guards a regression that no other test would notice. Removing a row from
   * `GatewayDispatchEventMap` does not break a build — the event silently falls back to
   * `unknown`, and consumers lose narrowing without a single error anywhere.
   */
  it('keeps a payload type for events that already have one', () => {
    type IsTyped<E extends GatewayDispatchEvents> =
      GatewayDispatchData<E> extends unknown
        ? unknown extends GatewayDispatchData<E>
          ? false
          : true
        : true

    const messageCreate: IsTyped<'MESSAGE_CREATE'> = true
    const threadMembersUpdate: IsTyped<'THREAD_MEMBERS_UPDATE'> = true
    const voiceServerUpdate: IsTyped<'VOICE_SERVER_UPDATE'> = true

    assert.deepEqual([messageCreate, threadMembersUpdate, voiceServerUpdate], [true, true, true])
  })
})
