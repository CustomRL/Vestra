import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  GatewayCloseCodes,
  GatewayDispatchEvents,
  GatewayIntentBits,
  GatewayOpcodes,
  UnrecoverableGatewayCloseCodes,
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
})
