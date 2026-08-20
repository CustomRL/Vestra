import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DiscordAPIError, HTTPError, RateLimitError, REST, type RateLimitInfo } from '@vestra/rest'
import {
  json,
  rateLimitHeaders,
  startMockDiscord,
  startRateLimitedDiscord,
  type MockDiscord,
} from './mock-discord.ts'

/** Builds a client pointed at a mock server, with retries fast enough for a test. */
function clientFor(mock: MockDiscord, overrides: Record<string, unknown> = {}): REST {
  return new REST({ api: mock.url, version: '10', timeout: 5_000, ...overrides }).setToken('t0ken')
}

describe('REST request building', () => {
  it('sends the authorisation header, user agent and JSON body', async () => {
    const mock = await startMockDiscord((_request, response) => {
      json(response, 200, { id: '1' })
    })
    try {
      const rest = clientFor(mock)
      const result = await rest.post<{ id: string }>('/channels/1/messages', {
        body: { content: 'hi' },
      })

      assert.deepEqual(result, { id: '1' })
      const sent = mock.requests[0]
      assert.ok(sent)
      assert.equal(sent.url, '/v10/channels/1/messages')
      assert.equal(sent.headers.authorization, 'Bot t0ken')
      assert.match(String(sent.headers['user-agent']), /DiscordBot/)
      assert.equal(sent.headers['content-type'], 'application/json')
      assert.deepEqual(JSON.parse(sent.body), { content: 'hi' })
    } finally {
      await mock.close()
    }
  })

  it('omits authorisation when a route opts out', async () => {
    const mock = await startMockDiscord((_request, response) => {
      json(response, 200, { url: 'wss://gateway' })
    })
    try {
      await clientFor(mock).gateway.get()
      assert.equal(mock.requests[0]?.headers.authorization, undefined)
    } finally {
      await mock.close()
    }
  })

  it('refuses an authorised request before a token is set', async () => {
    const mock = await startMockDiscord((_request, response) => {
      json(response, 200, {})
    })
    try {
      const rest = new REST({ api: mock.url })
      await assert.rejects(rest.get('/users/@me'), /before setToken/)
      assert.equal(mock.requests.length, 0, 'the request must not reach the network')
    } finally {
      await mock.close()
    }
  })

  it('url-encodes the audit log reason so non-ASCII survives', async () => {
    const mock = await startMockDiscord((_request, response) => {
      response.writeHead(204).end()
    })
    try {
      await clientFor(mock).guilds.removeMember('1', '2', { reason: 'spam — repeated' })
      assert.equal(
        mock.requests[0]?.headers['x-audit-log-reason'],
        encodeURIComponent('spam — repeated'),
      )
    } finally {
      await mock.close()
    }
  })

  it('serialises query parameters and drops undefined ones', async () => {
    const mock = await startMockDiscord((_request, response) => {
      json(response, 200, [])
    })
    try {
      await clientFor(mock).channels.getMessages('1', { limit: 50, before: undefined })
      assert.equal(mock.requests[0]?.url, '/v10/channels/1/messages?limit=50')
    } finally {
      await mock.close()
    }
  })

  it('sends multipart with payload_json when files are attached', async () => {
    const mock = await startMockDiscord((_request, response) => {
      json(response, 200, { id: '1' })
    })
    try {
      await clientFor(mock).channels.createMessage(
        '1',
        { content: 'see attached', attachments: [{ id: 0, filename: 'a.txt' }] },
        { files: [{ name: 'a.txt', data: 'hello', contentType: 'text/plain' }] },
      )

      const sent = mock.requests[0]
      assert.ok(sent)
      // fetch must supply the boundary; setting the header by hand omits it and Discord
      // rejects the request.
      assert.match(String(sent.headers['content-type']), /^multipart\/form-data; boundary=/)
      assert.match(sent.body, /name="files\[0\]"/)
      assert.match(sent.body, /name="payload_json"/)
      assert.match(sent.body, /see attached/)
    } finally {
      await mock.close()
    }
  })
})

describe('REST response handling', () => {
  it('returns undefined for a 204', async () => {
    const mock = await startMockDiscord((_request, response) => {
      response.writeHead(204).end()
    })
    try {
      assert.equal(await clientFor(mock).delete('/channels/1/messages/2'), undefined)
    } finally {
      await mock.close()
    }
  })

  it('throws DiscordAPIError carrying the Discord error code', async () => {
    const mock = await startMockDiscord((_request, response) => {
      json(response, 403, { code: 50013, message: 'Missing Permissions' })
    })
    try {
      await assert.rejects(clientFor(mock).get('/channels/1'), (error: unknown) => {
        assert.ok(error instanceof DiscordAPIError)
        // Branching on `code` rather than `status` is the whole reason this class exists.
        assert.equal(error.code, 50013)
        assert.equal(error.status, 403)
        assert.equal(error.method, 'GET')
        return true
      })
    } finally {
      await mock.close()
    }
  })

  it('throws HTTPError when the body is not a Discord error', async () => {
    const mock = await startMockDiscord((_request, response) => {
      response.writeHead(502, { 'content-type': 'text/html' }).end('<html>bad gateway</html>')
    })
    try {
      const rest = clientFor(mock, { retries: 0 })
      await assert.rejects(rest.get('/channels/1'), (error: unknown) => {
        assert.ok(error instanceof HTTPError)
        assert.equal(error.status, 502)
        return true
      })
    } finally {
      await mock.close()
    }
  })

  it('retries a 5xx and succeeds', async () => {
    let calls = 0
    const mock = await startMockDiscord((_request, response) => {
      calls += 1
      if (calls === 1) {
        response.writeHead(500, { 'content-type': 'text/plain' }).end('boom')
        return
      }
      json(response, 200, { ok: true })
    })
    try {
      const result = await clientFor(mock, { retries: 2 }).get<{ ok: boolean }>('/channels/1')
      assert.deepEqual(result, { ok: true })
      assert.equal(calls, 2)
    } finally {
      await mock.close()
    }
  })
})

describe('REST rate limiting', () => {
  it('never exceeds the allowance the server advertises', async () => {
    // The server enforces the limit it reports and records any breach, so this asserts
    // behaviour rather than header parsing.
    const mock = await startRateLimitedDiscord({ limit: 3, windowMs: 300 })
    try {
      const rest = clientFor(mock)
      await Promise.all(
        Array.from({ length: 12 }, async () => await rest.get('/channels/1/messages')),
      )
      assert.deepEqual(mock.violations, [])
    } finally {
      await mock.close()
    }
  })

  it('keeps separate channels in separate buckets', async () => {
    const mock = await startRateLimitedDiscord({ limit: 2, windowMs: 300 })
    try {
      const rest = clientFor(mock)
      const started = Date.now()
      await Promise.all([
        rest.get('/channels/111111111111111111/messages'),
        rest.get('/channels/111111111111111111/messages'),
        rest.get('/channels/222222222222222222/messages'),
        rest.get('/channels/222222222222222222/messages'),
      ])

      assert.deepEqual(mock.violations, [])
      // Four requests across two buckets of two must not have serialised into a wait.
      assert.ok(Date.now() - started < 250, 'independent buckets were needlessly serialised')
    } finally {
      await mock.close()
    }
  })

  it('waits out a 429 and reports it', async () => {
    let calls = 0
    const limits: RateLimitInfo[] = []
    const mock = await startMockDiscord((_request, response) => {
      calls += 1
      if (calls === 1) {
        json(
          response,
          429,
          { message: 'You are being rate limited.', retry_after: 0.05, global: false },
          {
            ...rateLimitHeaders({ bucket: 'b', limit: 5, remaining: 0, resetAfterSeconds: 0.05 }),
            'x-ratelimit-scope': 'user',
          },
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
      const rest = clientFor(mock)
      rest.on('rateLimited', (info) => limits.push(info))

      const result = await rest.get<{ ok: boolean }>('/channels/1/messages')

      assert.deepEqual(result, { ok: true })
      assert.equal(calls, 2)
      assert.equal(limits.length, 1)
      const reported = limits[0]
      assert.ok(reported)
      assert.equal(reported.afterRejection, true)
      assert.equal(reported.global, false)
    } finally {
      await mock.close()
    }
  })

  it('blocks every bucket while globally limited', async () => {
    let globalSent = false
    const mock = await startMockDiscord((request, response) => {
      if (!globalSent && request.url.includes('/channels/1/')) {
        globalSent = true
        json(
          response,
          429,
          { message: 'You are being rate limited.', retry_after: 0.15, global: true },
          { 'retry-after': '0.15', 'x-ratelimit-scope': 'global' },
        )
        return
      }
      json(response, 200, { ok: true })
    })
    try {
      const rest = clientFor(mock)
      await rest.get('/channels/1/messages')

      // A different bucket entirely: it must still have been held back by the global block.
      const started = Date.now()
      await rest.get('/channels/999999999999999999/messages')
      assert.ok(
        Date.now() - started < 200,
        'the global block should have elapsed by now, not still be blocking',
      )
      assert.equal(globalSent, true)
    } finally {
      await mock.close()
    }
  })

  it('fails fast when a wait would exceed rateLimitTimeout', async () => {
    const mock = await startMockDiscord((_request, response) => {
      json(
        response,
        429,
        { message: 'You are being rate limited.', retry_after: 30, global: false },
        {
          ...rateLimitHeaders({ bucket: 'b', limit: 1, remaining: 0, resetAfterSeconds: 30 }),
          'x-ratelimit-scope': 'user',
        },
      )
    })
    try {
      const rest = clientFor(mock, { rateLimitTimeout: 1_000, retries: 1 })
      await assert.rejects(rest.get('/channels/1/messages'), (error: unknown) => {
        assert.ok(error instanceof RateLimitError)
        assert.ok(error.timeToReset > 1_000)
        return true
      })
    } finally {
      await mock.close()
    }
  })

  it('refuses to send once the invalid request threshold is reached', async () => {
    const mock = await startMockDiscord((_request, response) => {
      json(response, 403, { code: 50013, message: 'Missing Permissions' })
    })
    try {
      const rest = clientFor(mock, { invalidRequestThreshold: 3 })

      for (let i = 0; i < 3; i += 1) {
        await assert.rejects(rest.get(`/channels/${String(i)}`), DiscordAPIError)
      }

      // The guard must fire before the request leaves, not after another 403.
      const before = mock.requests.length
      await assert.rejects(rest.get('/channels/9'), /Cloudflare ban/)
      assert.equal(mock.requests.length, before)
    } finally {
      await mock.close()
    }
  })
})
