import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  Client,
  ClientError,
  ClientErrorCode,
  resolveClientOptions,
  resolveIntents,
} from '@vestra/core'
import { GatewayIntentBits } from '@vestra/types'

const TOKEN = 'not.a.real.token'

/** Gateway info that never opens a socket, because no shard is ever connected. */
const info = {
  url: 'wss://gateway.discord.gg/',
  shards: 1,
  session_start_limit: { total: 1000, remaining: 1000, reset_after: 0, max_concurrency: 1 },
}

describe('client options', () => {
  it('CO1: combines intent bits from an array', () => {
    // `[Guilds, GuildMessages]` is what people write; making them reach for `|` is a
    // papercut on the first line of every bot.
    const combined = resolveIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
    assert.equal(combined, GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages)
    assert.equal(resolveIntents(513), 513, 'a bit set passes through')
  })

  it('CO2: refuses an empty token here rather than as a 4004 later', () => {
    assert.throws(() => resolveClientOptions({ token: '   ', intents: 0 }), TypeError)
  })

  it('CO3: defaults the sweep interval but honours an explicit null', () => {
    assert.equal(resolveClientOptions({ token: TOKEN, intents: 0 }).sweepInterval, 60_000)
    assert.equal(
      resolveClientOptions({ token: TOKEN, intents: 0, sweepInterval: null }).sweepInterval,
      null,
    )
  })
})

describe('client', () => {
  it('CL1: exposes cache, rest and shards without connecting', () => {
    const client = new Client({ token: TOKEN, intents: 0 })

    assert.ok(client.cache.roles.enabled, 'the cache is built from the defaults')
    assert.equal(typeof client.rest.get, 'function')
    assert.equal(client.user, undefined, 'no identity before READY')
  })

  it('CL2: shares a REST client when given one', () => {
    // Rate-limit buckets are keyed by token, so two clients on one token with two REST
    // instances each believe they own the whole allowance.
    const client = new Client({ token: TOKEN, intents: 0 })
    const second = new Client({ token: TOKEN, intents: 0, rest: client.rest })

    assert.equal(second.rest, client.rest)
  })

  it('CL3: passes gateway options through untouched', () => {
    const client = new Client({
      token: TOKEN,
      intents: [GatewayIntentBits.Guilds],
      gateway: { shardCount: 4, fetchGatewayBot: () => Promise.resolve(info) },
    })

    assert.equal(client.options.intents, GatewayIntentBits.Guilds)
    assert.equal(client.options.gateway.shardCount, 4)
  })

  it('CL4: destroys idempotently without having connected', async () => {
    // `destroy()` runs on a fatal close as well as on shutdown, so a second call must not
    // turn one failure into two.
    const client = new Client({ token: TOKEN, intents: 0 })

    await client.destroy()
    await assert.doesNotReject(client.destroy())
  })

  it('CL5: refuses a member fetch for a shard that is not connected', () => {
    // A member request is answered on the connection it was sent on, so a misrouted one
    // produces no error and no chunks — just a timeout. Failing loudly beats that.
    const client = new Client({
      token: TOKEN,
      intents: 0,
      gateway: { shardCount: 1, fetchGatewayBot: () => Promise.resolve(info) },
    })

    assert.throws(
      () => client.shards.shardIdForGuild('613425648685547541'),
      /not known until connect/,
      'the shard count is unknown before connect, which is its own clear failure',
    )
  })
})

describe('fleet readiness', () => {
  it('CL20: whenReady does not resolve before anything has connected', () => {
    // The guard used to read `#announcedReady`, which is set by the **first** shard because it
    // gates the once-per-client `ready` emit — so `whenReady()` returned as soon as any shard
    // was up, about a minute early on a two-hundred shard bot, while its own documentation
    // promised the fleet. It now compares the ready set against the owned shards, and
    // `#readyShards`, which was written to and never read, is what it compares.
    //
    // This covers the `owned > 0` half: with nothing connected the ready set is empty and the
    // owned set is empty, and an empty set must not read as "all of them are ready". The
    // partially-ready case needs three live sockets to reach the private set honestly, which
    // is what `scripts/client-check.ts` in the testing bot exercises.
    const client = new Client({ token: TOKEN, intents: 0 })
    assert.equal(client.shards.shards.size, 0)

    let settled = false
    void client.whenReady().then(() => {
      settled = true
    })

    return new Promise<void>((resolve) => {
      setImmediate(() => {
        assert.equal(settled, false, 'whenReady resolved with nothing connected')
        resolve()
      })
    })
  })
})

describe('listener hygiene', () => {
  it('CL21: leaves no listeners behind when login fails', async () => {
    // Found by review. A retry loop used to stack one `ready` and one `error` listener per
    // attempt — `onError` removed `onReady` but never itself — until Node warned about the
    // leak. Worse, the orphaned readiness promise stayed armed, so a later fatal close
    // rejected something nobody was awaiting, which Node reports as an unhandled rejection and
    // exits on by default.
    const client = new Client({
      token: TOKEN,
      intents: 0,
      gateway: { fetchGatewayBot: () => Promise.reject(new Error('gateway is down')) },
    })

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await assert.rejects(async () => await client.login())
    }

    assert.equal(client.listenerCount('ready'), 0, 'ready listeners accumulated')
    assert.equal(client.listenerCount('error'), 0, 'error listeners accumulated')

    await client.destroy()
  })
})

describe('refusing work after destroy', () => {
  it('CL22: refuses login, fetchMembers and setPresence once destroyed', async () => {
    // Destroying is not reversible — the shard map is cleared and the sweeper stopped — so a
    // second login would build a fresh fleet on a client whose caller believes it is the same
    // one. Refusing is the honest answer.
    const client = new Client({ token: TOKEN, intents: 0 })
    await client.destroy()

    for (const [name, call] of [
      ['login', async () => await client.login()],
      ['fetchMembers', async () => await client.fetchMembers('613425648685547541')],
      [
        'setPresence',
        async () => {
          await client.setPresence({ status: 'online' })
        },
      ],
    ] as const) {
      await assert.rejects(
        call,
        (error: unknown) => {
          assert.ok(error instanceof ClientError, `${name} threw a bare Error`)
          assert.equal(error.code, ClientErrorCode.Destroyed)
          return true
        },
        `${name} did not refuse`,
      )
    }
  })

  it('CL23: tells "not connected yet" apart from "destroyed"', async () => {
    // The whole reason for the code. Both refusals used to be a bare `Error`, so telling them
    // apart meant matching message text — which stops working the day somebody improves the
    // wording. `NotReady` is retryable after `login()`; `Destroyed` never is.
    //
    // The third code, `ShardUnavailable`, needs a connected fleet with one shard down to
    // reach, which is what the testing bot's live probes are for.
    const client = new Client({ token: TOKEN, intents: 0 })

    await assert.rejects(
      async () => await client.fetchMembers('613425648685547541'),
      (error: unknown) => {
        assert.ok(error instanceof ClientError, 'a bare Error still escapes here')
        assert.equal(error.code, ClientErrorCode.NotReady)
        // The manager's own explanation is kept rather than discarded.
        assert.ok(error.cause instanceof Error)
        return true
      },
    )

    await client.destroy()
  })
})
