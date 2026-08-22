import assert from 'node:assert/strict'
import { createDeflate, constants, createZstdCompress, type Deflate } from 'node:zlib'
import { describe, it } from 'node:test'
import {
  CompressionMode,
  DefaultCompressionLimits,
  createCompression,
  type Compression,
} from '@vestra/gateway'

/**
 * Emulates Discord's zlib-stream sender: one deflate context for the whole connection,
 * flushed with `Z_SYNC_FLUSH` after each message so every message ends `00 00 ff ff`.
 */
class ZlibSender {
  readonly #deflate: Deflate = createDeflate({ flush: constants.Z_SYNC_FLUSH })
  readonly #out: Buffer[] = []

  constructor() {
    this.#deflate.on('data', (chunk: Buffer) => {
      this.#out.push(chunk)
    })
  }

  async send(text: string): Promise<Buffer> {
    this.#out.length = 0
    await new Promise<void>((resolve, reject) => {
      this.#deflate.write(Buffer.from(text, 'utf8'), (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    await new Promise<void>((resolve) => {
      this.#deflate.flush(constants.Z_SYNC_FLUSH, resolve)
    })
    return Buffer.concat(this.#out)
  }
}

/** Emulates Discord's zstd-stream sender: one context, flushed per message. */
class ZstdSender {
  readonly #compress: ReturnType<typeof createZstdCompress> = createZstdCompress()
  readonly #out: Buffer[] = []

  constructor() {
    this.#compress.on('data', (chunk: Buffer) => {
      this.#out.push(chunk)
    })
  }

  async send(text: string): Promise<Buffer> {
    this.#out.length = 0
    await new Promise<void>((resolve, reject) => {
      this.#compress.write(Buffer.from(text, 'utf8'), (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    await new Promise<void>((resolve) => {
      this.#compress.flush(resolve)
    })
    return Buffer.concat(this.#out)
  }
}

/** Collects payloads and errors from a decompressor. */
function collector(): {
  payloads: string[]
  errors: Error[]
  hooks: { onPayload: (p: Buffer) => void; onError: (e: Error) => void }
} {
  const payloads: string[] = []
  const errors: Error[] = []
  return {
    payloads,
    errors,
    hooks: {
      // Stringify inside the callback, honouring the borrow contract.
      onPayload: (payload: Buffer) => payloads.push(payload.toString('utf8')),
      onError: (error: Error) => errors.push(error),
    },
  }
}

/**
 * Waits until a condition holds, or gives up.
 *
 * @remarks
 * Decompression completes on the threadpool, and a large payload needs several round
 * trips. A fixed number of ticks is therefore not enough and is flaky on a loaded CI
 * runner; waiting on the condition itself is both faster and stable.
 */
async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

/** Lets any pending callbacks run, for asserting that nothing was delivered. */
async function quiesce(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50))
}

describe('zlib-stream decompression', () => {
  it('decodes a multi-message stream sharing one context', async () => {
    // The whole point: the zlib header arrives once and the LZ77 window carries across
    // messages, so per-message inflateSync would desynchronise after the first.
    const sender = new ZlibSender()
    const sink = collector()
    const codec = createCompression(CompressionMode.ZlibStream, sink.hooks)

    const messages = [
      JSON.stringify({ op: 10, d: { heartbeat_interval: 41_250 } }),
      JSON.stringify({ op: 0, t: 'READY', s: 1, d: { v: 10 } }),
      JSON.stringify({ op: 11 }),
      JSON.stringify({ op: 0, t: 'MESSAGE_CREATE', s: 2, d: { content: 'hello' } }),
    ]
    for (const message of messages) codec.push(await sender.send(message))
    await waitFor(() => sink.payloads.length === messages.length)

    assert.deepEqual(sink.errors, [])
    assert.deepEqual(sink.payloads, messages)
    codec.destroy()
  })

  it('reassembles a payload split across several websocket frames', async () => {
    // Only the final frame carries the sentinel; the earlier ones must still be written
    // through, not buffered separately.
    const sender = new ZlibSender()
    const sink = collector()
    const codec = createCompression(CompressionMode.ZlibStream, sink.hooks)

    const big = JSON.stringify({ op: 0, t: 'GUILD_CREATE', s: 1, d: { blob: 'x'.repeat(200_000) } })
    const framed = await sender.send(big)

    const third = Math.floor(framed.length / 3)
    codec.push(framed.subarray(0, third))
    codec.push(framed.subarray(third, third * 2))
    codec.push(framed.subarray(third * 2))
    await waitFor(() => sink.payloads.length === 1)

    assert.deepEqual(sink.errors, [])
    assert.equal(sink.payloads.length, 1)
    assert.equal(sink.payloads[0], big)
    codec.destroy()
  })

  it('does not cut at an interior occurrence of the sentinel bytes', async () => {
    // 00 00 ff ff occurs naturally inside Huffman-coded data. Scanning for it instead of
    // checking the last four bytes desynchronises the context for the rest of the
    // connection, so this drives many messages through to make a premature cut visible.
    const sender = new ZlibSender()
    const sink = collector()
    const codec = createCompression(CompressionMode.ZlibStream, sink.hooks)

    const messages: string[] = []
    for (let i = 0; i < 40; i += 1) {
      const payload = JSON.stringify({
        op: 0,
        s: i,
        d: { binaryish: Buffer.alloc(256, i % 256).toString('base64'), i },
      })
      messages.push(payload)
      codec.push(await sender.send(payload))
    }
    await waitFor(() => sink.payloads.length === messages.length)

    assert.deepEqual(sink.errors, [])
    assert.deepEqual(sink.payloads, messages)
    codec.destroy()
  })

  it('aborts a payload that decompresses past the limit', async () => {
    // zlib's own maxOutputLength does not apply to streams — verified: 200,000 bytes were
    // emitted under a 4,096 byte cap with no error — so the guard is counted by hand.
    const sender = new ZlibSender()
    const sink = collector()
    const codec = createCompression(CompressionMode.ZlibStream, sink.hooks, {
      ...DefaultCompressionLimits,
      maxPayloadBytes: 4_096,
    })

    codec.push(await sender.send(JSON.stringify({ d: 'x'.repeat(200_000) })))
    await waitFor(() => sink.errors.length > 0)

    assert.equal(sink.payloads.length, 0, 'an oversized payload was delivered')
    assert.equal(sink.errors.length, 1)
    assert.match(String(sink.errors[0]?.message), /past the 4096 byte limit/)
  })

  it('stops accumulating when no frame boundary ever arrives', async () => {
    const sink = collector()
    const codec = createCompression(CompressionMode.ZlibStream, sink.hooks, {
      ...DefaultCompressionLimits,
      maxBufferedBytes: 2_048,
    })

    // Never terminated by the sentinel: nothing in the protocol promises one arrives.
    for (let i = 0; i < 10; i += 1) codec.push(Buffer.alloc(512, 1))
    await waitFor(() => sink.errors.length > 0)

    assert.ok(sink.errors.length >= 1)
    assert.match(String(sink.errors[0]?.message), /without reaching a frame boundary/)
  })

  it('discards output that arrives after destroy', async () => {
    // Decompression finishes asynchronously, so a payload can surface after the socket
    // closed and a new session began. Delivering it there would corrupt sequence tracking.
    const sender = new ZlibSender()
    const sink = collector()
    const codec: Compression = createCompression(CompressionMode.ZlibStream, sink.hooks)

    codec.push(await sender.send(JSON.stringify({ op: 0, s: 99 })))
    codec.destroy()
    await quiesce()

    assert.deepEqual(sink.payloads, [], 'a payload was delivered after destroy')
  })
})

describe('zstd-stream decompression', () => {
  it('decodes a multi-message stream sharing one context', async () => {
    // The zstd magic bytes appear on the first message only, so a per-message sync
    // decompress fails from message two with ZSTD_error_prefix_unknown.
    const sender = new ZstdSender()
    const sink = collector()
    const codec = createCompression(CompressionMode.ZstdStream, sink.hooks)

    const messages = [
      JSON.stringify({ op: 10, d: { heartbeat_interval: 41_250 } }),
      JSON.stringify({ op: 0, t: 'READY', s: 1, d: { v: 10 } }),
      JSON.stringify({ op: 0, t: 'MESSAGE_CREATE', s: 2, d: { content: 'hello' } }),
    ]
    for (const message of messages) codec.push(await sender.send(message))
    await waitFor(() => sink.payloads.length === messages.length)

    assert.deepEqual(sink.errors, [])
    assert.deepEqual(sink.payloads, messages)
    codec.destroy()
  })

  it('confirms the magic bytes appear only on the first message', async () => {
    // This is the property that makes a shared context mandatory. If it ever changed,
    // per-message decoding would become viable and this test should be revisited.
    const sender = new ZstdSender()
    const first = await sender.send('{"op":10}')
    const second = await sender.send('{"op":11}')

    assert.deepEqual([...first.subarray(0, 4)], [0x28, 0xb5, 0x2f, 0xfd])
    assert.notDeepEqual([...second.subarray(0, 4)], [0x28, 0xb5, 0x2f, 0xfd])
  })
})

describe('no compression', () => {
  it('passes messages through unchanged', async () => {
    const sink = collector()
    const codec = createCompression(CompressionMode.None, sink.hooks)

    assert.equal(codec.query, null, 'no compress parameter should be added to the URL')
    codec.push(Buffer.from('{"op":11}', 'utf8'))
    await waitFor(() => sink.payloads.length === 1)

    assert.deepEqual(sink.payloads, ['{"op":11}'])
  })
})
