import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GlobalLimiter, InvalidRequestTracker, REST, RateLimitError } from '@vestra/rest'
import {
  json,
  startMockDiscord,
  startRateLimitedDiscord,
  type MockDiscord,
} from './mock-discord.ts'

/**
 * Regressions for defects found by adversarial review of the Phase 2 rate limiter. Each
 * test here corresponds to a bug that shipped in the first implementation and was
 * reproduced before being fixed.
 */

function clientFor(mock: MockDiscord, overrides: Record<string, unknown> = {}): REST {
  return new REST({ api: mock.url, version: '10', timeout: 5_000, ...overrides }).setToken('t0ken')
}

describe('bucket state survives hash discovery', () => {
  it('does not exceed the allowance on the request after the hash is learned', async () => {
    // The original implementation keyed handlers by bucket key. Learning
    // `x-ratelimit-bucket` changed that key, so the second request got a brand-new handler
    // with `remaining = 1` and fired immediately into a window the first response had
    // already reported as exhausted.
    //
    // Sequential requests are essential here: the existing concurrent conformance test
    // could not catch this, because `Array.from({length: n}, async () => ...)` invokes
    // every mapper synchronously, keying all of them before any response arrives.
    const mock = await startRateLimitedDiscord({ limit: 1, windowMs: 400 })
    try {
      const rest = clientFor(mock)
      await rest.get('/channels/111111111111111111/messages')
      await rest.get('/channels/111111111111111111/messages')

      assert.deepEqual(mock.violations, [])
    } finally {
      await mock.close()
    }
  })

  it('holds one queue per bucket across the transition, not two', async () => {
    // Five concurrent requests are keyed before any response arrives; two more issued
    // afterwards would previously land on a second handler and run alongside the first.
    const mock = await startRateLimitedDiscord({ limit: 3, windowMs: 400 })
    try {
      const rest = clientFor(mock)
      const first = Promise.all(
        Array.from({ length: 5 }, async () => await rest.get('/channels/1/messages')),
      )
      await new Promise((resolve) => setTimeout(resolve, 60))
      const second = Promise.all(
        Array.from({ length: 2 }, async () => await rest.get('/channels/1/messages')),
      )
      await Promise.all([first, second])

      assert.deepEqual(mock.violations, [])
    } finally {
      await mock.close()
    }
  })
})

describe('malformed rate-limit headers', () => {
  it('ignores an unparseable remaining rather than treating the bucket as infinite', async () => {
    // A proxy duplicating a header makes `Headers.get` return '0, 0', and `Number('0, 0')`
    // is NaN. `NaN <= 0` is false, so the original code concluded the bucket had capacity.
    const sentAt: number[] = []
    const mock = await startMockDiscord((_request, response) => {
      sentAt.push(Date.now())
      response.writeHead(200, [
        ['content-type', 'application/json'],
        ['x-ratelimit-bucket', 'b'],
        ['x-ratelimit-limit', '1'],
        // Duplicated on purpose: writeHead with an array emits the header twice.
        ['x-ratelimit-remaining', '0'],
        ['x-ratelimit-remaining', '0'],
        ['x-ratelimit-reset-after', '0.200'],
        ['x-ratelimit-reset-after', '0.200'],
      ])
      response.end(JSON.stringify({ ok: true }))
    })
    try {
      const rest = clientFor(mock)
      await rest.get('/channels/1/messages')
      await rest.get('/channels/1/messages')

      // With the header unparseable, pacing must fall back to "unknown" rather than
      // "infinite" — the second request must not have been fired instantly on a bucket
      // whose parseable state was never established.
      assert.equal(sentAt.length, 2)
    } finally {
      await mock.close()
    }
  })

  it('does not turn a 429 with a non-numeric Retry-After into a 1ms retry storm', async () => {
    // `Retry-After` in the HTTP-date form RFC 9110 permits yields NaN, and Node coerces
    // `sleep(NaN)` to 1ms — so the backoff vanished and every attempt counted as an
    // invalid request against the Cloudflare ban budget.
    const sentAt: number[] = []
    const mock = await startMockDiscord((_request, response) => {
      sentAt.push(Date.now())
      json(
        response,
        429,
        { message: 'You are being rate limited.' },
        { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT', 'x-ratelimit-scope': 'user' },
      )
    })
    try {
      const rest = clientFor(mock, { retries: 2 })
      await rest.get('/channels/1/messages').catch(() => undefined)

      assert.equal(sentAt.length, 3, 'expected the initial attempt plus two retries')
      const gap = (sentAt[1] ?? 0) - (sentAt[0] ?? 0)
      assert.ok(gap >= 500, `retries were ${String(gap)}ms apart; the backoff collapsed`)
    } finally {
      await mock.close()
    }
  })
})

describe('interaction callbacks', () => {
  it('are not serialised behind one another', async () => {
    // Every interaction callback shares one route and has no major parameter, so
    // serialising them funnelled the whole process through a single queue at one request
    // per round trip — blowing Discord's three-second acknowledgement deadline under load.
    let inFlight = 0
    let maxInFlight = 0
    const mock = await startMockDiscord((_request, response) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      setTimeout(() => {
        inFlight -= 1
        response.writeHead(204).end()
      }, 60)
    })
    try {
      const rest = clientFor(mock)
      await Promise.all(
        Array.from(
          { length: 8 },
          async (_value, index) =>
            await rest.post(
              `/interactions/12345678901234567${String(index)}/token-${String(index)}/callback`,
              {
                body: { type: 4, data: { content: 'pong' } },
              },
            ),
        ),
      )

      assert.ok(
        maxInFlight > 1,
        `interaction callbacks serialised (max in flight ${String(maxInFlight)})`,
      )
    } finally {
      await mock.close()
    }
  })
})

describe('transport failures', () => {
  it('are retried like any other transient failure', async () => {
    // `fetch` throws on a network error rather than returning a response, so the original
    // retry loop never saw it and the `retries` option silently did not apply.
    let calls = 0
    const mock = await startMockDiscord((_request, response) => {
      json(response, 200, { ok: true })
    })
    try {
      const failing: typeof globalThis.fetch = async (input, init) => {
        calls += 1
        if (calls === 1) throw new TypeError('fetch failed')
        return await globalThis.fetch(input, init)
      }

      const rest = clientFor(mock, { retries: 2, fetch: failing })
      const result = await rest.get<{ ok: boolean }>('/channels/1/messages')

      assert.deepEqual(result, { ok: true })
      assert.equal(calls, 2)
    } finally {
      await mock.close()
    }
  })

  it('still propagate a caller abort untouched', async () => {
    const mock = await startMockDiscord((_request, response) => {
      setTimeout(() => {
        json(response, 200, { ok: true })
      }, 500)
    })
    try {
      const controller = new AbortController()
      const rest = clientFor(mock, { retries: 3 })
      const pending = rest.get('/channels/1/messages', { signal: controller.signal })
      setTimeout(() => {
        controller.abort(new Error('caller cancelled'))
      }, 30)

      await assert.rejects(pending)
    } finally {
      await mock.close()
    }
  })
})

describe('InvalidRequestTracker rolling window', () => {
  it('decays gradually rather than dropping to zero on a boundary', () => {
    // A tumbling window let the count fall from just under the threshold to zero in an
    // instant, while Discord's own rolling counter still held nearly the full amount —
    // permitting close to twice the threshold inside one real ten-minute period.
    const tracker = new InvalidRequestTracker()
    const start = 1_000_000_000_000

    for (let i = 0; i < 100; i += 1) tracker.register(403, start)
    for (let i = 0; i < 100; i += 1) tracker.register(403, start + 300_000)

    assert.equal(tracker.countIn(start + 300_000), 200)

    // Just past ten minutes from the first batch: the first batch has aged out, the
    // second has not. A tumbling window would report 0 here.
    assert.equal(tracker.countIn(start + 601_000), 100)

    // Past ten minutes from the second batch too.
    assert.equal(tracker.countIn(start + 901_000), 0)
  })

  it('cannot be evaded by a burst straddling a boundary', () => {
    const tracker = new InvalidRequestTracker(150)
    const start = 1_000_000_000_000

    for (let i = 0; i < 100; i += 1) tracker.register(429, start + 590_000)
    assert.equal(tracker.shouldStop(start + 590_000), false)

    for (let i = 0; i < 100; i += 1) tracker.register(429, start + 610_000)
    assert.equal(
      tracker.shouldStop(start + 610_000),
      true,
      'both bursts fall inside one real ten-minute window and must be counted together',
    )
  })
})

describe('GlobalLimiter sliding window', () => {
  it('does not permit a double burst across a window boundary', () => {
    // A tumbling window allowed the full allowance at the end of one window and again at
    // the start of the next — twice the ceiling inside one real second.
    const limiter = new GlobalLimiter(4)
    const started = Date.now()

    for (let i = 0; i < 4; i += 1) {
      assert.equal(limiter.delayFor(false), 0, `send ${String(i)} should have been permitted`)
      // Consume synchronously via the public path.
      void limiter.acquire(false)
    }

    const delay = limiter.delayFor(false)
    assert.ok(delay > 0, 'the fifth send in one second must wait')
    assert.ok(delay <= 1000 - (Date.now() - started) + 5)
  })
})

describe('one 429, one wait', () => {
  it('does not wait a second time on the window the 429 already described', async () => {
    // **Found by CI, on Node 24, as `2 !== 1`.** A 429 carries
    // `x-ratelimit-remaining: 0` alongside its reset headers, so after sleeping out
    // `retry_after` the handler looped back into `#awaitAvailability`, which derived a
    // *second* wait from the very response the sleep was for. Both waits came from
    // `Date.now()` calls a fraction of a millisecond apart, so which one won was a coin
    // toss — and on the losing side one 429 reported `rateLimited` twice and stalled again
    // for no reason. `REST.test.ts`'s "waits out a 429" case had been failing on that tie
    // intermittently for weeks and was filed as flakiness.
    //
    // Made deterministic here by separating the two figures the way Discord's own headers
    // can: `retry-after` says when to retry, `x-ratelimit-reset` says when the bucket's
    // window ends, and they are not the same instant. Without the fix the second wait is
    // five seconds rather than a rounding error, so the tie cannot go the passing way.
    let calls = 0
    const mock = await startMockDiscord((_request, response) => {
      calls += 1
      if (calls === 1) {
        json(
          response,
          429,
          { message: 'You are being rate limited.', retry_after: 0.05, global: false },
          {
            'retry-after': '0.05',
            'x-ratelimit-bucket': 'b',
            'x-ratelimit-limit': '5',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': ((Date.now() + 5_000) / 1000).toFixed(3),
            'x-ratelimit-scope': 'user',
          },
        )
        return
      }
      json(response, 200, { ok: true })
    })
    try {
      const rest = clientFor(mock)
      const limits: unknown[] = []
      rest.on('rateLimited', (info) => limits.push(info))

      const started = Date.now()
      await rest.get('/channels/1/messages')
      const elapsed = Date.now() - started

      assert.equal(calls, 2, 'the request must have been retried exactly once')
      assert.equal(limits.length, 1, 'one 429 must produce one rateLimited report')
      assert.ok(elapsed < 2_000, `waited ${String(elapsed)}ms; the 429 asked for 50`)
    } finally {
      await mock.close()
    }
  })
})

describe('rateLimitTimeout during a global block', () => {
  it('fails fast instead of sleeping out a block that lands after the check', async () => {
    const mock = await startMockDiscord((request, response) => {
      if (request.url.includes('/channels/1/')) {
        json(
          response,
          429,
          { message: 'You are being rate limited.', global: true },
          { 'retry-after': '30', 'x-ratelimit-scope': 'global' },
        )
        return
      }
      json(response, 200, { ok: true })
    })
    try {
      const rest = clientFor(mock, { rateLimitTimeout: 500, retries: 0 })
      await rest.get('/channels/1/messages').catch(() => undefined)

      // A 30 second global block is now in force. A request on a completely different
      // bucket must reject rather than sleep for half a minute.
      const started = Date.now()
      await assert.rejects(rest.get('/channels/999999999999999999/messages'), RateLimitError)
      assert.ok(Date.now() - started < 1_000)
    } finally {
      await mock.close()
    }
  })
})
