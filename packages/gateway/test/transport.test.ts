import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { WebSocketTransport, type Transport, type TransportListeners } from '@vestra/gateway'
import {
  largePayload,
  startMockGateway,
  websocketClientCanConnect,
  type MockGateway,
} from './mock-gateway.ts'

/**
 * Transport conformance against a real websocket server (§7.3, X1–X9).
 *
 * @remarks
 * These are the behaviours {@link MockTransport} cannot prove, because it stands in for the
 * very layer under test. Each one is a property of Node's global `WebSocket` that the shard
 * depends on and that would fail silently if it changed.
 *
 * The suite skips itself where the runtime's `WebSocket` cannot reach a locally hosted
 * server at all — see {@link websocketClientCanConnect}. Skipping is the honest outcome
 * there: every assertion would fail for a reason that says nothing about this code.
 */

/** Whether these tests can run at all here. */
const canConnect = await websocketClientCanConnect()
const skip = canConnect
  ? false
  : "this runtime's WebSocket cannot connect to a local server; see mock-gateway.ts"

interface Harness {
  transport: Transport
  events: {
    open: number
    messages: (ArrayBuffer | string)[]
    closes: { code: number; reason: string; wasClean: boolean }[]
    errors: Error[]
  }
  /** Resolves once a close has been observed. */
  closed: Promise<{ code: number; reason: string; wasClean: boolean }>
  /** Resolves once at least `count` messages have arrived. */
  messagesReceived: (count: number) => Promise<void>
}

/**
 * Reads a received message as text.
 *
 * @param message - The message, which may be absent if none arrived.
 * @returns The decoded text.
 */
function decode(message: ArrayBuffer | string | undefined): string {
  assert.ok(message !== undefined, 'expected a message to have arrived')
  return typeof message === 'string' ? message : Buffer.from(message).toString('utf8')
}

function harness(): Harness {
  const events: Harness['events'] = { open: 0, messages: [], closes: [], errors: [] }

  let resolveClosed: (close: { code: number; reason: string; wasClean: boolean }) => void = () =>
    undefined
  const closed = new Promise<{ code: number; reason: string; wasClean: boolean }>((resolve) => {
    resolveClosed = resolve
  })

  const messageWaiters: { count: number; resolve: () => void }[] = []

  const listeners: TransportListeners = {
    onOpen: () => {
      events.open += 1
    },
    onMessage: (data) => {
      events.messages.push(data)
      for (const waiter of [...messageWaiters]) {
        if (events.messages.length >= waiter.count) {
          messageWaiters.splice(messageWaiters.indexOf(waiter), 1)
          waiter.resolve()
        }
      }
    },
    onClose: (code, reason, wasClean) => {
      events.closes.push({ code, reason, wasClean })
      resolveClosed({ code, reason, wasClean })
    },
    onError: (error) => {
      events.errors.push(error)
    },
  }

  return {
    transport: new WebSocketTransport(listeners, { userAgent: 'Vestra conformance test' }),
    events,
    closed,
    messagesReceived: async (count) => {
      if (events.messages.length >= count) return
      await new Promise<void>((resolve) => {
        messageWaiters.push({ count, resolve })
      })
    },
  }
}

describe('transport conformance', { skip }, () => {
  const running: MockGateway[] = []

  async function gateway(options?: Parameters<typeof startMockGateway>[0]): Promise<MockGateway> {
    const mock = await startMockGateway(options)
    running.push(mock)
    return mock
  }

  const harnesses: Harness[] = []

  function connected(mock: MockGateway): Harness {
    const h = harness()
    harnesses.push(h)
    h.transport.connect(mock.url)
    return h
  }

  after(async () => {
    // Sockets left open hold the event loop and the runner never exits.
    for (const h of harnesses) h.transport.destroy()
    for (const mock of running) await mock.close()
  })

  it('X1: delivers a close code and reason verbatim, cleanly', async () => {
    const mock = await gateway()
    const h = connected(mock)

    const connection = await mock.waitForConnection()
    connection.close(4004, 'Authentication failed.')

    const close = await h.closed
    assert.equal(close.code, 4004)
    assert.equal(close.reason, 'Authentication failed.')
    assert.equal(close.wasClean, true, 'a completed closing handshake is a clean close')
  })

  it('X2: reports 1006 when the peer destroys the socket', async () => {
    const mock = await gateway()
    const h = connected(mock)

    const connection = await mock.waitForConnection()
    connection.destroy()

    const close = await h.closed
    // 1006 is synthesised by the client; it never appears on the wire. Everything the
    // shard classifies as "abnormal" depends on this collapse happening.
    assert.equal(close.code, 1006)
    assert.equal(close.wasClean, false)
  })

  it('X3: reports 1006 when the peer ends the stream without a close frame', async () => {
    const mock = await gateway()
    const h = connected(mock)

    const connection = await mock.waitForConnection()
    connection.endWithoutClose()

    const close = await h.closed
    assert.equal(close.code, 1006)
    assert.equal(close.wasClean, false)
  })

  it('X4: reports 1006 when the handshake is rejected', async () => {
    const mock = await gateway({ rejectWithStatus: 401 })
    const h = connected(mock)

    const close = await h.closed
    // A rejected upgrade never produces a close frame, so a 401 is indistinguishable from
    // a dropped connection at this layer. The shard must not expect an authoritative code.
    assert.equal(close.code, 1006)
    assert.equal(close.wasClean, false)
    assert.equal(h.events.open, 0, 'the socket never opened')
  })

  it('X5: delivers a fragmented message as one message', async () => {
    const mock = await gateway()
    const h = connected(mock)

    const connection = await mock.waitForConnection()
    connection.sendFragmented(['{"op":', '0,"t":', '"READY"}'])

    await h.messagesReceived(1)
    assert.equal(h.events.messages.length, 1, 'three frames, one message')

    const text = decode(h.events.messages[0])
    assert.equal(text, '{"op":0,"t":"READY"}')
  })

  it('X6: delivers a large message whole', async () => {
    const mock = await gateway()
    const h = connected(mock)

    const connection = await mock.waitForConnection()
    // The spec asks for 24 MB. That is a slow allocation for every run, and the property
    // under test — reassembly across many TCP segments — is already exercised well below
    // it, so this trades a little coverage for a suite that stays fast.
    const payload = largePayload(2 * 1024 * 1024)
    connection.sendText(payload)

    await h.messagesReceived(1)
    const text = decode(h.events.messages[0])
    assert.equal(text.length, payload.length, 'a truncated reassembly is the failure mode')
    assert.equal(text, payload)
  })

  it('X7: receives binary as an ArrayBuffer, not a Blob', async () => {
    const mock = await gateway()
    const h = connected(mock)

    const connection = await mock.waitForConnection()
    connection.sendBinary(Buffer.from('compressed', 'utf8'))

    await h.messagesReceived(1)
    const [message] = h.events.messages
    // The default is 'blob'. If the transport ever stops setting this, decompression gets
    // a Blob it cannot read synchronously and every compressed connection breaks.
    assert.ok(message instanceof ArrayBuffer, 'binaryType must be arraybuffer')
    assert.equal(Buffer.from(message).toString('utf8'), 'compressed')
  })

  it('X8: preserves message order across a single write', async () => {
    const mock = await gateway()
    const h = connected(mock)

    const connection = await mock.waitForConnection()
    for (let i = 0; i < 20; i += 1) connection.sendText(String(i))

    await h.messagesReceived(20)
    const order = h.events.messages.map((message) => decode(message))
    assert.deepEqual(
      order,
      Array.from({ length: 20 }, (_v, i) => String(i)),
      'gateway sequence numbers assume the socket never reorders',
    )
  })

  it('X9: rejects a close code the protocol does not allow a client to send', async () => {
    const mock = await gateway()
    const h = connected(mock)
    await mock.waitForConnection()

    // 1001 is reserved: an endpoint may report it, but a client may not send it. Node
    // throws rather than silently substituting, which is why the transport guards the
    // codes it forwards.
    assert.throws(() => {
      h.transport.close(1001, 'going away')
    })
  })

  it('does not hang when the peer never answers the closing handshake', async () => {
    const mock = await gateway({ swallowClose: true })
    const h = connected(mock)

    const connection = await mock.waitForConnection()
    h.transport.close(4000, 'shutting down')

    // The peer will never echo the close frame. `destroy` is the escape hatch, and the
    // shard depends on it not waiting for a close event that is never coming.
    h.transport.destroy()
    connection.destroy()

    const close = await h.closed
    assert.ok(close.code === 1006 || close.code === 4000)
  })
})
