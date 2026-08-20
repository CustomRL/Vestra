import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BucketRegistry, GlobalLimiter, InvalidRequestTracker } from '@vestra/rest'

describe('BucketRegistry route identity', () => {
  const registry = new BucketRegistry()

  it('replaces non-major snowflakes but keeps the major parameter', () => {
    const identity = registry.getIdentity('GET', '/channels/123456789012345678/messages')
    assert.equal(identity.route, 'GET:/channels/:id/messages')
    assert.equal(identity.majorParameter, '123456789012345678')
  })

  it('scopes buckets separately per channel', () => {
    const a = registry.getIdentity('POST', '/channels/111111111111111111/messages')
    const b = registry.getIdentity('POST', '/channels/222222222222222222/messages')
    assert.equal(a.route, b.route)
    assert.notEqual(registry.getBucketKey(a), registry.getBucketKey(b))
  })

  it('treats guild and webhook ids as major parameters too', () => {
    assert.equal(
      registry.getIdentity('GET', '/guilds/123456789012345678/members').majorParameter,
      '123456789012345678',
    )
    assert.equal(registry.getIdentity('GET', '/users/@me').majorParameter, 'global')
  })

  it('includes the webhook token in the major parameter', () => {
    // Two webhooks on one channel have independent allowances, and the token is what
    // distinguishes them.
    const a = registry.getIdentity('POST', '/webhooks/123456789012345678/token-aaa')
    const b = registry.getIdentity('POST', '/webhooks/123456789012345678/token-bbb')
    assert.equal(a.route, 'POST:/webhooks/:id/:token')
    assert.equal(b.route, 'POST:/webhooks/:id/:token')
    assert.notEqual(a.majorParameter, b.majorParameter)
  })

  it('collapses reaction emoji, which are arbitrary text', () => {
    const unicode = registry.getIdentity(
      'PUT',
      '/channels/123456789012345678/messages/234567890123456789/reactions/%F0%9F%91%8D/@me',
    )
    const custom = registry.getIdentity(
      'PUT',
      '/channels/123456789012345678/messages/234567890123456789/reactions/name:345678901234567890/@me',
    )
    assert.equal(unicode.route, custom.route, 'differing emoji must share one bucket')
  })

  it('gives message deletion its own bucket', () => {
    // Discord applies a stricter limit to deletes than to anything else on this route,
    // and does not express that difference in the bucket hash.
    const del = registry.getIdentity(
      'DELETE',
      '/channels/123456789012345678/messages/234567890123456789',
    )
    const get = registry.getIdentity(
      'GET',
      '/channels/123456789012345678/messages/234567890123456789',
    )
    assert.equal(del.route, 'DELETE:/channels/:id/messages/:id:delete')
    assert.equal(get.route, 'GET:/channels/:id/messages/:id')
  })

  it('exempts interaction callbacks from the global limit', () => {
    const interaction = registry.getIdentity(
      'POST',
      '/interactions/123456789012345678/some-token/callback',
    )
    assert.equal(interaction.exemptFromGlobal, true)
    assert.equal(interaction.route, 'POST:/interactions/:id/:token/callback')
    assert.equal(registry.getIdentity('GET', '/users/@me').exemptFromGlobal, false)
  })

  it('strips the query string before deriving a route', () => {
    const withQuery = registry.getIdentity('GET', '/channels/123456789012345678/messages?limit=50')
    assert.equal(withQuery.route, 'GET:/channels/:id/messages')
  })
})

describe('BucketRegistry hashes', () => {
  it('switches from a provisional key to the hash-based one', () => {
    const registry = new BucketRegistry()
    const identity = registry.getIdentity('GET', '/channels/123456789012345678/messages')

    const provisional = registry.getBucketKey(identity)
    assert.match(provisional, /^provisional:/)

    registry.setHash(identity.route, 'abcdef')
    assert.equal(registry.getBucketKey(identity), 'abcdef:123456789012345678')
  })

  it('sweeps hashes that have gone unused', () => {
    const registry = new BucketRegistry()
    const identity = registry.getIdentity('GET', '/channels/123456789012345678/messages')
    registry.setHash(identity.route, 'abcdef')
    assert.equal(registry.size, 1)

    assert.equal(registry.sweep(Date.now() + 1000), 0, 'swept an entry that was still fresh')
    assert.equal(registry.sweep(Date.now() + 86_400_001), 1)
    assert.equal(registry.size, 0)
  })
})

describe('GlobalLimiter', () => {
  it('permits the configured burst then makes callers wait', async () => {
    const limiter = new GlobalLimiter(3)
    for (let i = 0; i < 3; i += 1) await limiter.acquire(false)

    // The allowance is spent, so the next caller must wait for the window to roll.
    assert.ok(limiter.delayFor(false) > 0)
  })

  it('blocks every request, exemptions included, while globally limited', () => {
    const limiter = new GlobalLimiter(50)
    limiter.blockUntil(Date.now() + 5_000)

    assert.ok(limiter.blocked)
    assert.ok(limiter.delayFor(false) > 0)
    assert.ok(limiter.delayFor(true) > 0, 'a global block must apply even to interaction callbacks')
  })

  it('never shortens an existing block', () => {
    const limiter = new GlobalLimiter(50)
    const long = Date.now() + 10_000
    limiter.blockUntil(long)
    limiter.blockUntil(Date.now() + 1_000)

    // A late response from an in-flight request must not undo a longer block.
    assert.ok(limiter.delayFor(false) > 5_000)
  })

  it('exempts interaction callbacks from the per-second ceiling', async () => {
    const limiter = new GlobalLimiter(1)
    await limiter.acquire(false)
    assert.ok(limiter.delayFor(false) > 0)
    assert.equal(limiter.delayFor(true), 0)
  })
})

describe('InvalidRequestTracker', () => {
  it('counts only the statuses Discord treats as invalid', () => {
    const tracker = new InvalidRequestTracker()
    const now = Date.now()

    for (const status of [200, 201, 204, 404, 400]) tracker.register(status, now)
    assert.equal(tracker.countIn(now), 0)

    for (const status of [401, 403, 429]) tracker.register(status, now)
    assert.equal(tracker.countIn(now), 3)
  })

  it('counts 429 responses, so a retry loop accelerates towards the ban', () => {
    const tracker = new InvalidRequestTracker()
    const now = Date.now()
    for (let i = 0; i < 10; i += 1) tracker.register(429, now)
    assert.equal(tracker.countIn(now), 10)
  })

  it('resets once the ten-minute window elapses', () => {
    const tracker = new InvalidRequestTracker()
    const start = Date.now()
    tracker.register(403, start)
    assert.equal(tracker.countIn(start), 1)

    const later = start + 600_001
    assert.equal(tracker.countIn(later), 0)
    tracker.register(403, later)
    assert.equal(tracker.countIn(later), 1)
  })

  it('refuses to send once the threshold is reached', () => {
    const tracker = new InvalidRequestTracker(3)
    const now = Date.now()

    tracker.register(401, now)
    tracker.register(401, now)
    assert.equal(tracker.shouldStop(now), false)

    tracker.register(401, now)
    assert.equal(tracker.shouldStop(now), true)

    // ...and recovers when the window rolls over.
    assert.equal(tracker.shouldStop(now + 600_001), false)
  })
})
