import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MemoryCacheAdapter,
  type CacheAdapter,
  type CacheScope,
  type CacheScopeContext,
} from '@vestra/core'
import { GatewayIntentBits } from '@vestra/types'
import { scriptedClient, tick, type ScriptedTransport } from './scripted-client.ts'

/**
 * That a swapped-in adapter is the one the client actually stores through.
 *
 * @remarks
 * `adapter-conformance.ts` asks whether an adapter honours the contract. It says nothing
 * about whether the client ever calls it. Those are different failures with the same symptom
 * — a Redis adapter that passes conformance, is installed, and quietly stores nothing while
 * the client keeps its own map — and ADR 4's promise that "a Redis or SQLite adapter is a
 * third-party package implementing one interface" is only worth anything if both hold.
 *
 * So this drives a real shard through a real dispatch and asks the adapter what it saw. `AW4`
 * runs the same script against the default adapter and against a custom one and requires the
 * same entries in the same scopes — which catches the failure the others cannot, a fast path
 * somewhere above the seam that special-cases the adapter this library happens to ship. It
 * would not catch a private copy kept above the seam for every adapter alike, because that
 * would move both sides together; `AW2` and `AW3` are what say the seam is used at all.
 */

const GUILD = '613425648685547541'
const ROLE = '41771983423143936'
const CHANNEL = '290926798999357250'

/** One adapter call, as the recorder saw it. */
interface Call {
  scope: CacheScope
  method: string
  key: string | undefined
}

/**
 * A conforming adapter that writes down what it was asked to do.
 *
 * @remarks
 * Delegates to {@link MemoryCacheAdapter} rather than reimplementing storage, so a case here
 * fails because the wiring is wrong and never because the recorder is. The client has no way
 * to tell it apart from any other third-party adapter: it arrives through the same public
 * `cache.adapter` factory and implements the same ten members.
 */
class RecordingCacheAdapter<V> implements CacheAdapter<V> {
  readonly #inner: MemoryCacheAdapter<V>
  readonly #scope: CacheScope
  readonly #log: Call[]

  /**
   * @param context - What the registry tells an adapter about its scope.
   * @param log - Where every call is appended, shared across every scope's instance.
   */
  constructor(context: CacheScopeContext<V>, log: Call[]) {
    this.#inner = new MemoryCacheAdapter(context)
    this.#scope = context.scope
    this.#log = log
    log.push({ scope: context.scope, method: 'construct', key: undefined })
  }

  #record(method: string, key?: string): void {
    this.#log.push({ scope: this.#scope, method, key })
  }

  get(key: string): V | undefined {
    this.#record('get', key)
    return this.#inner.get(key)
  }

  set(key: string, value: V, expiresAt: number): void {
    this.#record('set', key)
    this.#inner.set(key, value, expiresAt)
  }

  delete(key: string): boolean {
    this.#record('delete', key)
    return this.#inner.delete(key)
  }

  has(key: string): boolean {
    this.#record('has', key)
    return this.#inner.has(key)
  }

  clear(): void {
    this.#record('clear')
    this.#inner.clear()
  }

  get size(): number {
    return this.#inner.size
  }

  keys(): IterableIterator<string> {
    this.#record('keys')
    return this.#inner.keys()
  }

  values(): IterableIterator<V> {
    this.#record('values')
    return this.#inner.values()
  }

  entries(): IterableIterator<[key: string, value: V]> {
    this.#record('entries')
    return this.#inner.entries()
  }

  sweep(now: number): number {
    this.#record('sweep')
    return this.#inner.sweep(now)
  }
}

/** A guild carrying one of everything the default policy caches. */
function guild(): Record<string, unknown> {
  return {
    id: GUILD,
    name: 'a guild',
    owner_id: '1',
    roles: [
      {
        id: ROLE,
        name: 'moderator',
        color: 0,
        colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
        hoist: false,
        position: 1,
        permissions: '0',
        managed: false,
        mentionable: false,
        flags: 0,
      },
    ],
    emojis: [{ id: '55', name: 'blob', roles: [], require_colons: true, managed: false }],
    features: [],
    channels: [
      {
        id: CHANNEL,
        type: 0,
        name: 'general',
        position: 0,
        permission_overwrites: [],
        parent_id: null,
        flags: 0,
      },
    ],
    threads: [],
    members: [],
    voice_states: [],
    presences: [],
    stage_instances: [],
    guild_scheduled_events: [],
    unavailable: false,
    member_count: 1,
    joined_at: '2024-01-01T00:00:00.000000+00:00',
    large: false,
    verification_level: 0,
    default_message_notifications: 0,
    explicit_content_filter: 0,
    mfa_level: 0,
    premium_tier: 0,
    nsfw_level: 0,
    system_channel_flags: 0,
    afk_timeout: 300,
  }
}

/** A client whose every scope stores through the recorder. */
async function recordingClient(): Promise<{
  client: Awaited<ReturnType<typeof scriptedClient>>['client']
  socket: ScriptedTransport
  log: Call[]
}> {
  const log: Call[] = []
  const { client, transports } = await scriptedClient({
    intents: [GatewayIntentBits.Guilds],
    cache: { adapter: (context) => new RecordingCacheAdapter(context, log) },
  })
  const socket = transports[0]
  assert.ok(socket !== undefined)
  return { client, socket, log }
}

/** The scopes the log mentions, sorted. */
function scopesIn(log: readonly Call[], method?: string): string[] {
  const seen = new Set<string>()
  for (const call of log) {
    if (method !== undefined && call.method !== method) continue
    seen.add(call.scope)
  }
  return [...seen].sort()
}

describe('a swapped-in cache adapter is the one that stores', () => {
  it('AW1: is built once per enabled scope, and never for a disabled one', async () => {
    const { client, log } = await recordingClient()
    try {
      const built = scopesIn(log, 'construct')
      // The canary: a factory that was never called would leave this empty and make every
      // other case below pass on a log nothing wrote to.
      assert.ok(built.length > 0, 'the adapter factory was never called')

      // Exactly the default policy's four. A disabled scope must not build an adapter at all
      // — a third party paying per connection should not open one for `presences` because
      // the registry built every scope and then decided.
      assert.deepEqual(built, ['channels', 'emojis', 'guilds', 'roles'])
    } finally {
      await client.destroy()
    }
  })

  it('AW2: receives every write a dispatch produces', async () => {
    const { client, socket, log } = await recordingClient()
    try {
      socket.dispatch('GUILD_CREATE', guild(), 10)
      await tick()

      assert.deepEqual(
        scopesIn(log, 'set'),
        ['channels', 'emojis', 'guilds', 'roles'],
        'a GUILD_CREATE carries all four, so all four should have been written through',
      )
      const keys = log.filter((call) => call.method === 'set').map((call) => call.key)
      assert.ok(keys.includes(GUILD), 'the guild itself was not written through the adapter')
      assert.ok(keys.includes(ROLE), 'the roles inside the payload were not written through')
    } finally {
      await client.destroy()
    }
  })

  it('AW3: answers reads, rather than being written to and then bypassed', async () => {
    const { client, socket, log } = await recordingClient()
    try {
      socket.dispatch('GUILD_CREATE', guild(), 10)
      await tick()
      log.length = 0

      const found = client.cache.guilds.get(GUILD)
      assert.ok(found !== undefined, 'the guild was not readable')
      assert.equal(found.name, 'a guild')

      // A store holding its own copy would answer this without asking anybody.
      assert.deepEqual(
        log.filter((call) => call.method === 'get').map((call) => call.key),
        [GUILD],
      )
    } finally {
      await client.destroy()
    }
  })

  it('AW4: leaves the same entries the default adapter would', async () => {
    // The decisive one. Everything above only shows the adapter is consulted; this shows it is
    // the whole story, because any private copy kept above the seam would make the two
    // disagree the moment the seam stopped being used for something.
    const { client: custom, socket: customSocket } = await recordingClient()
    const { client: standard, transports } = await scriptedClient({
      intents: [GatewayIntentBits.Guilds],
    })
    const standardSocket = transports[0]
    assert.ok(standardSocket !== undefined)

    try {
      customSocket.dispatch('GUILD_CREATE', guild(), 10)
      standardSocket.dispatch('GUILD_CREATE', guild(), 10)
      await tick()

      const contents = (
        client: Awaited<ReturnType<typeof scriptedClient>>['client'],
      ): { guilds: string[]; channels: string[]; roles: string[]; emojis: string[] } => ({
        guilds: [...client.cache.guilds.keys()].sort(),
        channels: [...client.cache.channels.keys()].sort(),
        roles: [...client.cache.roles.keys()].sort(),
        emojis: [...client.cache.emojis.keys()].sort(),
      })

      const both = contents(standard)
      assert.ok(both.guilds.length > 0, 'the default client cached nothing to compare against')
      assert.deepEqual(contents(custom), both)
    } finally {
      await custom.destroy()
      await standard.destroy()
    }
  })

  it('AW5: is the thing the sweeper sweeps', async () => {
    // `sweep` is one of the three obligations the contract states, and the only one whose
    // caller lives in the client rather than in the adapter's own tests. A sweeper that swept
    // a store's private map would satisfy every case above and still never call this.
    const log: Call[] = []
    const { client, transports } = await scriptedClient({
      intents: [GatewayIntentBits.Guilds],
      // A TTL is what arms the sweeper at all, and a short interval is what makes it fire
      // inside a test rather than a minute later.
      cache: {
        guilds: { ttl: 50 },
        adapter: (context) => new RecordingCacheAdapter(context, log),
      },
      sweepInterval: 20,
    })
    const socket = transports[0]
    assert.ok(socket !== undefined)

    try {
      socket.dispatch('GUILD_CREATE', guild(), 10)
      await new Promise((resolve) => setTimeout(resolve, 150))

      assert.ok(
        log.some((call) => call.method === 'sweep' && call.scope === 'guilds'),
        'the sweeper never reached the adapter holding the expiring scope',
      )
    } finally {
      await client.destroy()
    }
  })
})
