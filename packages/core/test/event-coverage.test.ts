import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GatewayDispatchEvents } from '@vestra/types'
import { handlers, UnhandledEvents } from '@vestra/core'

/**
 * Every dispatch is either handled or has a recorded reason why not.
 *
 * @remarks
 * The guard that keeps "unhandled" meaning *decided against* rather than *nobody has looked*.
 * A new event added to `@vestra/types` fails here until somebody either writes a handler or
 * writes down why there is none, which is the point: the failure is the prompt.
 *
 * This is the event-side twin of `cache-coverage.test.ts`, and it exists for the same reason —
 * both catch a gap that every unit test in the package would pass straight over, because the
 * gap is an absence rather than a wrong answer.
 */

describe('event coverage', () => {
  it('EC1: accounts for every dispatch Discord defines', () => {
    const handled = new Set(handlers.map((handler) => handler.event))
    const unaccounted = Object.values(GatewayDispatchEvents).filter(
      (event) => !handled.has(event) && UnhandledEvents[event] === undefined,
    )

    assert.deepEqual(
      unaccounted,
      [],
      `these dispatches are neither handled nor explained in unhandled.ts: ${unaccounted.join(', ')}`,
    )
  })

  it('EC2: does not explain away an event that is actually handled', () => {
    // The other direction, and the one that rots quietly: a reason left behind after a handler
    // is written reads as a decision not to handle something the library does handle.
    const handled = new Set<string>(handlers.map((handler) => handler.event))
    const contradictory = Object.keys(UnhandledEvents).filter((event) => handled.has(event))

    assert.deepEqual(
      contradictory,
      [],
      `these are handled but still listed as unhandled: ${contradictory.join(', ')}`,
    )
  })

  it('EC3: names an event that does not exist nowhere in the list', () => {
    // A typo in a key is invisible otherwise — the entry simply never matches, and the event it
    // was meant to describe silently fails EC1 instead.
    const known = new Set<string>(Object.values(GatewayDispatchEvents))
    const unknown = Object.keys(UnhandledEvents).filter((event) => !known.has(event))

    assert.deepEqual(unknown, [], `these are not dispatch events at all: ${unknown.join(', ')}`)
  })

  it('EC4: gives every reason enough substance to be a reason', () => {
    // A one-word entry passes EC1 while explaining nothing. The bar is low on purpose — this
    // catches a placeholder, not bad writing.
    const thin = Object.entries(UnhandledEvents)
      .filter(([, reason]) => reason.length < 30)
      .map(([event]) => event)

    assert.deepEqual(thin, [], `these reasons are too short to be reasons: ${thin.join(', ')}`)
  })

  it('EC5: files each handler under its own event name', () => {
    // The registry is a plain array so the key cannot disagree with the handler, and this is
    // what checks that it does not.
    for (const handler of handlers) {
      assert.ok(
        Object.values(GatewayDispatchEvents).includes(handler.event),
        `${handler.event} is not a dispatch event`,
      )
    }
  })
})
