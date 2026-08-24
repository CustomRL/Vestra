import assert from 'node:assert/strict'
import { Client, type ClientOptions } from '@vestra/core'
import { CompressionMode, type Transport, type TransportListeners } from '@vestra/gateway'
import { GatewayOpcodes, type GatewaySendPayload } from '@vestra/types'

/**
 * A `Client` driven over a scripted socket instead of a network.
 *
 * @remarks
 * Shared rather than copied per test, because the setup is not incidental: bringing a real
 * shard to READY means stepping the handshake in the right order and disabling compression,
 * and both are easy to get subtly wrong. A test that drives the real gateway path this way
 * catches an absence — something that should have happened and did not — where a test
 * against a stub would pass on the broken version too.
 */

/** A transport that speaks to the test instead of a network. */
export class ScriptedTransport implements Transport {
  /** Every frame the shard has written, raw. */
  readonly sends: string[] = []
  bufferedAmount = 0

  readonly #listeners: TransportListeners

  /**
   * @param listeners - What the shard wants told.
   */
  constructor(listeners: TransportListeners) {
    this.#listeners = listeners
  }

  /** Everything the shard has sent, parsed. */
  get sent(): GatewaySendPayload[] {
    return this.sends.map((raw) => JSON.parse(raw) as GatewaySendPayload)
  }

  connect(): void {
    // Opened by the test, so the handshake can be stepped through deliberately.
  }

  send(data: Uint8Array | string): void {
    this.sends.push(typeof data === 'string' ? data : Buffer.from(data).toString('utf8'))
  }

  close(): void {
    this.#listeners.onClose(1000, '', true)
  }

  destroy(): void {
    this.#listeners.onClose(4000, 'transport destroyed', false)
  }

  /** Simulates the socket opening. */
  open(): void {
    this.#listeners.onOpen()
  }

  /** Delivers a payload from the "gateway". */
  receive(payload: unknown): void {
    this.#listeners.onMessage(JSON.stringify(payload))
  }

  /** Delivers a dispatch. */
  dispatch(event: string, data: unknown, sequence: number): void {
    this.receive({ op: GatewayOpcodes.Dispatch, t: event, s: sequence, d: data })
  }
}

/** Lets pending microtasks and timers settle. */
export async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5))
}

/** Waits for something to become defined, rather than racing a fixed delay. */
async function waitFor<T>(read: () => T | undefined, what: string): Promise<T> {
  const deadline = Date.now() + 5_000
  for (;;) {
    const value = read()
    if (value !== undefined) return value
    assert.ok(Date.now() < deadline, what)
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}

/** A client and the sockets underneath it. */
export interface ScriptedClient {
  /** The client, already at READY on every shard. */
  client: Client
  /** One per shard, in shard order. */
  transports: ScriptedTransport[]
}

/**
 * Builds a client and brings every shard to READY.
 *
 * @param overrides - Client options to merge over the defaults.
 * @param shardCount - How many shards to spawn.
 * @returns The client and its sockets.
 *
 * @remarks
 * Shards are driven one at a time because identify pacing is real: with
 * `max_concurrency: 1` the manager does not build the next shard's transport until the
 * previous one has identified, so a loop that expected every transport up front would wait
 * forever on shard two.
 */
export async function scriptedClient(
  overrides: Omit<Partial<ClientOptions>, 'token'> = {},
  shardCount = 1,
): Promise<ScriptedClient> {
  const transports: ScriptedTransport[] = []

  const client = new Client({
    token: 'not.a.real.token',
    intents: 0,
    ...overrides,
    gateway: {
      // The default is `zlib-stream`, and a scripted transport delivers plain JSON. Without
      // this every frame fails to inflate and the handshake never completes.
      compression: CompressionMode.None,
      shardCount,
      fetchGatewayBot: async () =>
        await Promise.resolve({
          url: 'wss://gateway.discord.gg/',
          shards: shardCount,
          session_start_limit: {
            total: 1000,
            remaining: 1000,
            reset_after: 0,
            max_concurrency: 1,
          },
        }),
      transport: (listeners) => {
        const transport = new ScriptedTransport(listeners)
        transports.push(transport)
        return transport
      },
      ...overrides.gateway,
    },
  })

  const login = client.login()

  for (let shardId = 0; shardId < shardCount; shardId += 1) {
    const socket = await waitFor(
      () => transports[shardId],
      `shard ${String(shardId)} never built a transport`,
    )

    socket.open()
    await tick()
    socket.receive({ op: GatewayOpcodes.Hello, d: { heartbeat_interval: 45_000 } })
    await tick()
    socket.dispatch(
      'READY',
      {
        v: 10,
        user: { id: '1', username: 'bot', discriminator: '0', avatar: null, bot: true },
        guilds: [],
        session_id: `session-${String(shardId)}`,
        resume_gateway_url: 'wss://gateway.discord.gg/',
        shard: [shardId, shardCount],
        application: { id: '1', flags: 0 },
      },
      1,
    )
    await tick()
  }

  await login
  return { client, transports }
}
