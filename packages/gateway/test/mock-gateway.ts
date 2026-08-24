import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'

/**
 * A minimal RFC 6455 server standing in for Discord's gateway.
 *
 * @remarks
 * A real socket rather than a stubbed transport, mirroring `mock-discord.ts` in
 * `@vestra/rest` and for the same reason. {@link MockTransport} proves the state machine;
 * it cannot prove anything about the socket layer, because it *is* the thing standing in
 * for the socket. The behaviours that only appear against a real peer — an abnormal close
 * collapsing to 1006, a closing handshake that never completes, fragmented frames arriving
 * as one message — need a server that can be made to misbehave on purpose.
 *
 * Hand-rolled rather than pulled from `ws`: ADR 1 forbids runtime dependencies, and a test
 * dependency that implements the exact protocol under test would be its own hazard.
 */

/**
 * The GUID every RFC 6455 handshake concatenates before hashing.
 *
 * @remarks
 * Fixed verbatim from RFC 6455 section 1.3, and worth checking character by character if the
 * conformance suite ever starts skipping again: this was wrong in the last digit for the whole
 * of Phase 3, which made every `Sec-WebSocket-Accept` the mock computed invalid. A client that
 * validates the header — Node's global `WebSocket`, which is undici's — refuses the handshake
 * with an empty `TypeError` that names nothing, and a hand-written raw client connects happily
 * because it never checks. That combination read as a runtime bug rather than a typo.
 */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/** Opcodes this server understands. */
const Opcode = {
  Continuation: 0x0,
  Text: 0x1,
  Binary: 0x2,
  Close: 0x8,
  Ping: 0x9,
  Pong: 0xa,
} as const

/** A message the server received from the client. */
export interface ReceivedMessage {
  /** The decoded payload. */
  data: string
  /** Whether it arrived as binary. */
  binary: boolean
}

/** A connection the mock gateway is holding. */
export interface MockConnection {
  /** Sends a text frame. */
  sendText: (data: string) => void
  /** Sends a JSON payload as a text frame. */
  sendJson: (payload: unknown) => void
  /** Sends a binary frame. */
  sendBinary: (data: Buffer) => void
  /**
   * Sends one logical message split across several websocket frames.
   *
   * @param parts - The fragments, in order.
   *
   * @remarks
   * Fragmentation is invisible to a correct client: the parts must surface as one message.
   * Proving that is the point of X5.
   */
  sendFragmented: (parts: string[]) => void
  /** Begins a proper closing handshake. */
  close: (code: number, reason?: string) => void
  /** Destroys the TCP socket with no close frame at all, which the client sees as 1006. */
  destroy: () => void
  /** Ends the TCP stream cleanly but without a close frame — also a 1006. */
  endWithoutClose: () => void
  /** Every message received from this connection, in order. */
  readonly received: ReceivedMessage[]
}

/** A running mock gateway. */
export interface MockGateway {
  /** The `ws://` URL to point a transport at. */
  url: string
  /** Connections accepted, in order. */
  connections: MockConnection[]
  /** Resolves once at least `count` connections have been accepted. */
  waitForConnection: (count?: number) => Promise<MockConnection>
  /** Shuts the server and every open socket down. */
  close: () => Promise<void>
}

/** How the server should respond to the upgrade request. */
export interface MockGatewayOptions {
  /**
   * Rejects the handshake with this status instead of upgrading.
   *
   * @remarks
   * A failed handshake never produces a close frame, so the client must report 1006. That
   * is X4, and it is the case a stubbed transport cannot represent at all.
   */
  rejectWithStatus?: number
  /** Never reply to a client close frame, leaving the handshake half-finished. */
  swallowClose?: boolean
}

function encodeFrame(opcode: number, payload: Buffer, fin = true): Buffer {
  const length = payload.length
  const header: number[] = [(fin ? 0x80 : 0x00) | opcode]

  // Server-to-client frames are never masked, so the mask bit stays clear and the length
  // is the only thing that varies.
  if (length < 126) {
    header.push(length)
  } else if (length < 65_536) {
    header.push(126, (length >> 8) & 0xff, length & 0xff)
  } else {
    header.push(127, 0, 0, 0, 0)
    header.push((length >> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff)
  }

  return Buffer.concat([Buffer.from(header), payload])
}

/**
 * Pulls whole frames out of a running buffer.
 *
 * @param buffer - Everything received and not yet consumed.
 * @returns The frames decoded, and whatever bytes are left over.
 *
 * @remarks
 * TCP gives no message boundaries, so a frame can arrive split across reads and several
 * frames can arrive in one. Both are normal and both must be handled, or the tests fail
 * for reasons that have nothing to do with the code under test.
 */
function decodeFrames(buffer: Buffer): {
  frames: { opcode: number; payload: Buffer }[]
  rest: Buffer
} {
  const frames: { opcode: number; payload: Buffer }[] = []
  let offset = 0

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset]
    const second = buffer[offset + 1]
    if (first === undefined || second === undefined) break

    const opcode = first & 0x0f
    const masked = (second & 0x80) !== 0
    let length = second & 0x7f
    let cursor = offset + 2

    if (length === 126) {
      if (cursor + 2 > buffer.length) break
      length = buffer.readUInt16BE(cursor)
      cursor += 2
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break
      length = Number(buffer.readBigUInt64BE(cursor))
      cursor += 8
    }

    let mask: Buffer | undefined
    if (masked) {
      if (cursor + 4 > buffer.length) break
      mask = buffer.subarray(cursor, cursor + 4)
      cursor += 4
    }

    if (cursor + length > buffer.length) break

    const payload = Buffer.from(buffer.subarray(cursor, cursor + length))
    // Client frames must be masked; unmasking in place is cheaper than allocating twice.
    if (mask !== undefined) {
      for (let i = 0; i < payload.length; i += 1) {
        const byte = payload[i]
        const key = mask[i % 4]
        if (byte !== undefined && key !== undefined) payload[i] = byte ^ key
      }
    }

    frames.push({ opcode, payload })
    offset = cursor + length
  }

  return { frames, rest: Buffer.from(buffer.subarray(offset)) }
}

/**
 * Starts a throwaway websocket server standing in for the Discord gateway.
 *
 * @param options - How the server should misbehave, if at all.
 * @returns The running server.
 */
export async function startMockGateway(options: MockGatewayOptions = {}): Promise<MockGateway> {
  const connections: MockConnection[] = []
  const sockets = new Set<Socket>()
  const waiters: { count: number; resolve: (connection: MockConnection) => void }[] = []

  const server: Server = createServer((_incoming, response) => {
    response.writeHead(426)
    response.end('Upgrade Required')
  })

  server.on('upgrade', (incoming: IncomingMessage, socket: Socket) => {
    sockets.add(socket)
    socket.on('error', () => undefined)

    if (options.rejectWithStatus !== undefined) {
      socket.write(`HTTP/1.1 ${String(options.rejectWithStatus)} Unauthorized\r\n\r\n`)
      socket.destroy()
      return
    }

    const key = incoming.headers['sec-websocket-key']
    const accept = createHash('sha1')
      .update(`${typeof key === 'string' ? key : ''}${WS_GUID}`)
      .digest('base64')

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )

    const received: ReceivedMessage[] = []
    let pending: Buffer = Buffer.alloc(0)
    /** Set once this side has sent a close frame, so the echo is not sent twice. */
    let closeSent = false

    const write = (opcode: number, payload: Buffer, fin = true): void => {
      if (!socket.destroyed) socket.write(encodeFrame(opcode, payload, fin))
    }

    const connection: MockConnection = {
      received,
      sendText: (data) => {
        write(Opcode.Text, Buffer.from(data, 'utf8'))
      },
      sendJson: (payload) => {
        write(Opcode.Text, Buffer.from(JSON.stringify(payload), 'utf8'))
      },
      sendBinary: (data) => {
        write(Opcode.Binary, data)
      },
      sendFragmented: (parts) => {
        parts.forEach((part, index) => {
          const opcode = index === 0 ? Opcode.Text : Opcode.Continuation
          write(opcode, Buffer.from(part, 'utf8'), index === parts.length - 1)
        })
      },
      close: (code, reason = '') => {
        const payload = Buffer.alloc(2 + Buffer.byteLength(reason, 'utf8'))
        payload.writeUInt16BE(code, 0)
        payload.write(reason, 2, 'utf8')
        closeSent = true
        write(Opcode.Close, payload)
        // Give the frame a turn to reach the client before the socket goes away. The
        // client's echo arrives in the meantime and must not be answered: a second close
        // frame is a protocol error, and the client reports 1006 instead of our code.
        setTimeout(() => {
          socket.end()
        }, 50)
      },
      destroy: () => {
        socket.destroy()
      },
      endWithoutClose: () => {
        socket.end()
      },
    }

    socket.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk])
      const { frames, rest } = decodeFrames(pending)
      pending = rest

      for (const frame of frames) {
        if (frame.opcode === Opcode.Text) {
          received.push({ data: frame.payload.toString('utf8'), binary: false })
        } else if (frame.opcode === Opcode.Binary) {
          received.push({ data: frame.payload.toString('utf8'), binary: true })
        } else if (frame.opcode === Opcode.Ping) {
          write(Opcode.Pong, frame.payload)
        } else if (frame.opcode === Opcode.Close) {
          // Echoing the close frame is what completes the handshake. Not echoing it is
          // exactly the zombie-peer case the shard must not wait on.
          if (options.swallowClose !== true && !closeSent) {
            closeSent = true
            write(Opcode.Close, frame.payload)
            socket.end()
          }
        }
      }
    })

    socket.on('close', () => {
      sockets.delete(socket)
    })

    connections.push(connection)
    for (const waiter of [...waiters]) {
      if (connections.length >= waiter.count) {
        waiters.splice(waiters.indexOf(waiter), 1)
        waiter.resolve(connection)
      }
    }
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address() as AddressInfo

  return {
    url: `ws://127.0.0.1:${String(address.port)}`,
    connections,
    waitForConnection: async (count = 1) => {
      const existing = connections[count - 1]
      if (existing !== undefined) return existing
      return await new Promise<MockConnection>((resolve) => {
        waiters.push({ count, resolve })
      })
    },
    close: async () => {
      for (const socket of sockets) socket.destroy()
      sockets.clear()
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      })
    },
  }
}

/**
 * A payload large enough to cross Node's internal buffering thresholds.
 *
 * @param bytes - How large the payload should be.
 * @returns A string of exactly that byte length.
 *
 * @remarks
 * X6 asks for 24 MB specifically. A message that size arrives as many TCP segments and
 * many `'data'` events, so it is the case where a client that reassembles incorrectly
 * delivers a truncated message rather than failing outright.
 */
export function largePayload(bytes: number): string {
  return randomBytes(Math.ceil(bytes / 2))
    .toString('hex')
    .slice(0, bytes)
}
