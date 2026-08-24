import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REST, type RateLimitInfo } from '@vestra/rest'
import { json, rateLimitHeaders, startMockDiscord } from './mock-discord.ts'

/**
 * The padding added to every rate-limit wait.
 *
 * @remarks
 * These assert on elapsed wall-clock, which is normally how a flaky test is written. It is
 * safe here only because every failure mode points the same way: a timer may overshoot but
 * never fires short, so waiting *longer* than the floor asserted below cannot fail. The
 * floor is the stated reset plus the offset, less a few milliseconds of slack for the
 * arithmetic itself — a client that dropped the offset would come in around fifty
 * milliseconds under it, which is far outside that slack.
 *
 * The offset exists because `x-ratelimit-reset-after` was true when Discord's edge wrote
 * the response and is stale by the transit time by the time the client reads it. Resuming
 * at exactly the stated moment leaves that transit time as the whole safety margin, and on
 * a loopback socket that is a fraction of a millisecond.
 */

const RESET_MS = 50
const OFFSET_MS = 50

/** How far apart the mock saw two requests. */
function gap(times: readonly number[]): number {
  const [first, second] = [times[0], times[1]]
  assert.ok(first !== undefined && second !== undefined, 'expected two requests')
  return second - first
}

describe('rate-limit offset', () => {
  it('RO1: waits past a spent allowance by the offset', async () => {
    const at: number[] = []
    const mock = await startMockDiscord((request, response) => {
      at.push(request.at)
      json(
        response,
        200,
        { ok: true },
        rateLimitHeaders({
          bucket: 'b',
          limit: 1,
          // Spent, so the next request in this bucket has to wait the window out.
          remaining: 0,
          resetAfterSeconds: RESET_MS / 1000,
        }),
      )
    })
    try {
      const rest = new REST({ api: mock.url, version: '10' }).setToken('t0ken')
      await rest.get('/channels/1/messages')
      await rest.get('/channels/1/messages')

      assert.ok(
        gap(at) >= RESET_MS + OFFSET_MS - 5,
        `resumed after ${String(gap(at))}ms; the reset plus the offset is ` +
          `${String(RESET_MS + OFFSET_MS)}ms`,
      )
    } finally {
      await mock.close()
    }
  })

  it('RO2: waits past a 429 by the offset, and reports what Discord said', async () => {
    const at: number[] = []
    const limits: RateLimitInfo[] = []
    let calls = 0
    const mock = await startMockDiscord((request, response) => {
      at.push(request.at)
      calls += 1
      if (calls === 1) {
        // Bare `retry-after`, with none of the `x-ratelimit-*` headers. Discord sends those
        // too, and when it does the bucket state they set makes the retry wait the window
        // out anyway — which would cover for a 429 path that had dropped the offset. Left
        // off here so this asserts the 429 path and nothing else.
        json(
          response,
          429,
          { message: 'You are being rate limited.', retry_after: RESET_MS / 1000, global: false },
          { 'retry-after': String(RESET_MS / 1000), 'x-ratelimit-scope': 'user' },
        )
        return
      }
      json(
        response,
        200,
        { ok: true },
        rateLimitHeaders({ bucket: 'b', limit: 5, remaining: 4, resetAfterSeconds: 1 }),
      )
    })
    try {
      const rest = new REST({ api: mock.url, version: '10' }).setToken('t0ken')
      rest.on('rateLimited', (info) => limits.push(info))
      await rest.get('/channels/1/messages')

      assert.equal(calls, 2)
      assert.ok(
        gap(at) >= RESET_MS + OFFSET_MS - 5,
        `retried after ${String(gap(at))}ms; retry_after plus the offset is ` +
          `${String(RESET_MS + OFFSET_MS)}ms`,
      )

      // The padding is this client's business. A listener logging `timeToReset` is
      // reporting what the server said, so it must not carry the offset.
      const [reported] = limits
      assert.ok(reported !== undefined)
      assert.equal(reported.timeToReset, RESET_MS)
    } finally {
      await mock.close()
    }
  })

  it('RO3: can be turned off for a server whose timing is controlled', async () => {
    const at: number[] = []
    const mock = await startMockDiscord((request, response) => {
      at.push(request.at)
      json(
        response,
        200,
        { ok: true },
        rateLimitHeaders({
          bucket: 'b',
          limit: 1,
          remaining: 0,
          resetAfterSeconds: RESET_MS / 1000,
        }),
      )
    })
    try {
      const rest = new REST({ api: mock.url, version: '10', rateLimitOffset: 0 }).setToken('t0ken')
      await rest.get('/channels/1/messages')
      await rest.get('/channels/1/messages')

      // Only an upper bound: the point is that nothing near the offset was added. A lower
      // bound here would be asserting that a timer fired promptly, which is not a promise
      // any runtime makes.
      assert.ok(
        gap(at) < RESET_MS + OFFSET_MS - 5,
        `waited ${String(gap(at))}ms with the offset disabled`,
      )
    } finally {
      await mock.close()
    }
  })
})
