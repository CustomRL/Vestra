I have verified the protocol against the current official docs source and re-run the load-bearing local probes myself. Here is the specification.

---

# Phase 3 — `@vestra/gateway` implementation specification

## 0. Verification ledger

Everything below is tagged. Nothing is asserted from memory.

**Verified today against Discord's documentation source** — `discord/discord-api-docs@main`, files `developers/events/gateway.mdx` (781 lines), `developers/events/gateway-events.mdx` (1679 lines), `developers/topics/opcodes-and-status-codes.mdx` (427 lines), `developers/change-log.mdx`. These are the source of `docs.discord.com`. Quotations below are verbatim from those files.

**Verified locally by probe, Node v25.8.1** (`/tmp/probe.mjs`, `probe2.mjs`, `probe3.mjs`, `probe4.mjs`):

| Claim | Result |
|---|---|
| `WebSocket.close(code)` accepted codes | 1000 ✅, 3000 ✅, 4000 ✅, 4999 ✅; 1001, 1006, 2000, 5000 all throw `DOMException: invalid code` |
| `binaryType` default | `'blob'`; assigning `'nodebuffer'` silently leaves `'blob'`; `'arraybuffer'` honoured |
| receive back-pressure | `['pause','resume','_socket','terminate']` — none present on the global WebSocket |
| `inflate._processChunk(chunk, Z_SYNC_FLUSH)` | call 1 correct, call 2 throws `TypeError: Cannot read properties of null (reading 'writeSync')` |
| shared async inflate, write-callback only, no `flush()` | correct payloads; every frame ended `00 00 ff ff` |
| `maxOutputLength: 4096` on a **streaming** inflate | 200,000 bytes emitted, no error, `destroyed === false` — **does not guard streams** |
| zstd-stream framing | magic `28 b5 2f fd` on message 1 only; `zstdDecompressSync` on message 2 throws `ZSTD_error_prefix_unknown`; shared streaming context decodes all three |
| Node 22 zstd stability | `zlib.createZstdDecompress` is **Stability 1 — Experimental**, "Added in: v22.15.0" (nodejs.org v22 docs) |
| `maxOutputLength` documented scope | "Limits output size when using **convenience methods**" (nodejs.org v22 docs) |
| Node 22 globals page | lists `WebSocket` (v21.0.0/v20.10.0, Stable as of v22.4.0) and `MessageEvent` (v15.0.0). **`CloseEvent` and `ErrorEvent` are absent from the Node 22 globals documentation** — corroborates the researchers' "do not reference them by name" rule |

**Two researcher claims I could not confirm, corrected below:**

1. *"Inflation must be a strict per-shard FIFO queue — never call `write()` for N+1 before N's callback has fired"* conflicts with another researcher's *"write every message immediately, do not await between writes."* I tested it: six frames written **synchronously with no awaiting**, including a 300,039-byte payload spanning many output chunks, harvesting the accumulator inside each write callback — all six reconstructed byte-exact and in order. The mechanism is that `Writable` will not enter `_transform` for N+1 until N's callback has fired, and all `'data'` for N is pushed before that callback. **Resolution: write immediately, never await between writes, harvest inside the write callback.** See §4.3.
2. The claimed corruption from harvesting *outside* the callback **did not reproduce** (4/4 payloads exact, including a 200 KB one). The likely reason is that output for N+1 needs a threadpool round-trip, so the harvesting microtask always wins. I am not promoting this to "safe" — it depends on undocumented internals — but the spec must not cite a corruption that was not observed. It is listed in §8 as unproven, and the mandated pattern is the one with the stronger argument.

---

## 1. Blocking prerequisite: `@vestra/types` changes

I re-read the repo files and confirm every gap. `@vestra/gateway` cannot be written cleanly without these; each requires a cast otherwise, which ADR 3's conventions forbid.

| # | File | Change | Verified against |
|---|---|---|---|
| 1 | `enums/gateway.ts` | Add `RequestChannelInfo: 43` to `GatewayOpcodes` | opcode table: `43 \| Request Channel Info \| Send` |
| 2 | `gateway/payloads.ts` | Add `GatewayRequestGuildMembers` (op 8) and `GatewayRequestSoundboardSounds` (op 31) to the `GatewaySendPayload` union — currently only Heartbeat/Identify/PresenceUpdate/Resume/VoiceStateUpdate | Send Events table |
| 3 | `gateway/payloads.ts` | Add `capabilities?: number` to `GatewayIdentifyData`; add a `GatewayCapabilityFlags = { ChannelObfuscation: 1 << 15 }` const | Identify Structure now lists `capabilities?  integer  … Default 0` |
| 4 | `enums/dispatch-events.ts` | Add `RateLimited: 'RATE_LIMITED'` (absent today) | `#### Rate Limited` under `### Rate Limits` |
| 5 | `gateway/dispatch.ts` | Add `GUILD_MEMBERS_CHUNK: GatewayGuildMembersChunkDispatchData` and `RATE_LIMITED: GatewayRateLimitedDispatchData` to `GatewayDispatchEventMap` (the event *name* `GuildMembersChunk` exists; the data type does not) | Guild Members Chunk fields; Rate Limited fields |
| 6 | `gateway/dispatch.ts` | Replace `GUILD_CREATE: APIGuild` with `GatewayGuildCreateDispatchData = (APIGuild & GuildCreateExtraFields) \| APIUnavailableGuild` | "The inner payload can be: An available Guild … An unavailable Guild" + the Extra Fields table (`joined_at`, `large`, `unavailable?`, `member_count`, `voice_states`, `members`, `channels`, `threads`, `presences`, `stage_instances`, `guild_scheduled_events`, `soundboard_sounds`) |
| 7 | `gateway/payloads.ts` | Reword the `GatewayInvalidSession.d` TSDoc. It currently says re-identify happens "after a delay of 1 to 5 seconds, **or Discord will invalidate the new session too**". I grepped all three current doc files for `random`, `between 1 and 5`, `backoff`, `exponential`: the only `random` hit is the heartbeat jitter sentence. The claim is not in the docs. Reword as Vestra policy. | absence verified |

Item 6 is load-bearing for §4.9: the readiness tracker needs `unavailable` to distinguish "guild arrived" from "guild is in an outage".

`RESTGetAPIGatewayBotResult` / `APISessionStartLimit` **need no change** — I compared them field-for-field against the JSON Response and Session Start Limit Structure tables. `reset_after` is documented as "Number of milliseconds after which the limit resets"; the existing TSDoc says milliseconds. Correct.

---

## 2. File layout

```
packages/gateway/src/
├── index.ts                          ~60    barrel
├── GatewayOptions.ts                ~190    options, defaults, resolution
├── Shard.ts                         ~300    the state machine (per-session)
├── ShardManager.ts                  ~260    fleet: preflight, buckets, routing
├── connection/
│   ├── ShardConnection.ts           ~240    one socket's lifetime (per-connection)
│   ├── Heartbeater.ts               ~140    jitter, cadence, ACK, zombie detection
│   ├── SendQueue.ts                 ~170    120/60s sliding window + heartbeat lane
│   ├── CloseCodes.ts                ~120    classification table, sendable codes
│   └── Backoff.ts                    ~90    full-jitter exponential
├── transport/
│   ├── Transport.ts                 ~110    interface + listener contract + factory
│   └── WebSocketTransport.ts        ~170    the global-WebSocket default
├── compression/
│   ├── Compression.ts                ~90    interface, borrow contract, mode union
│   ├── ZlibStream.ts                ~190    sentinel + shared inflate
│   ├── ZstdStream.ts                ~130    shared zstd context
│   ├── NoCompression.ts              ~50
│   └── index.ts                      ~60    mode registry
├── encoding/
│   ├── Encoding.ts                   ~70    interface (keeps the ETF door open)
│   └── JsonEncoding.ts               ~80
├── session/
│   ├── SessionStore.ts              ~110    interface + InMemorySessionStore
│   └── IdentifyThrottler.ts         ~170    interface + in-process per-key buckets
├── ready/
│   └── GuildReadyTracker.ts         ~120    pending set, idle timer, intent gate
├── members/
│   └── MemberChunker.ts             ~240    op 8 correlation, 30s gate, RATE_LIMITED
├── util/
│   ├── Timers.ts                     ~90    injectable clock/timer/random seams
│   └── ShardRouting.ts               ~60    (guild_id >> 22) % num_shards
└── errors/
    ├── GatewayError.ts               ~40
    ├── FatalCloseError.ts            ~60
    ├── SessionLimitError.ts          ~70
    └── PayloadTooLargeError.ts       ~50
```

`packages/gateway/test/` — `mock-transport.ts`, `mock-gateway.ts`, plus the suites in §7.

### The one architectural decision everything else hangs off

`Shard` holds **per-session** state and lives across reconnects. `ShardConnection` holds **per-connection** state and is constructed per socket and thrown away on close.

| Owned by `Shard` (survives a reconnect) | Owned by `ShardConnection` (destroyed with the socket) |
|---|---|
| `sessionId`, `sequence`, `resumeUrl` | transport, compression context, encoding |
| state, intent, backoff, resume-attempt count | `Heartbeater` (incl. `awaitingAck`) |
| `SessionStore`, `IdentifyThrottler`, `MemberChunker` | `SendQueue` (the 120/60s budget is per connection) |
| `GuildReadyTracker` | `epoch`, `disposed`, in-flight counters |

This makes the researchers' "two-tier reset" rule structural rather than disciplinary: you *cannot* carry `awaitingAck = false` or a stale inflate context into a new socket, because the object holding them no longer exists. The failure modes it forecloses — an instant zombie declaration on the first beat of a new socket, and `incorrect header check` on a reused inflate context — are the two most common reconnect-loop bugs.

---

## 3. Cross-cutting rules every file obeys

- **No top-level `await`** anywhere (ADR 2, `tests/cjs-interop.test.ts`). Compression contexts are created in `connect()`, never at module scope.
- **No `enum`** (`erasableSyntaxOnly`). `ShardState`, `ShardCloseAction`, `CompressionMode` are `as const` objects plus derived unions.
- **Never name `CloseEvent` or `ErrorEvent`.** Duck-type `event.code` / `event.reason` / `event.wasClean`. Verified: neither appears in Node 22's globals documentation, and the floor is 22.15.0. A named reference is a `ReferenceError` on the minimum supported Node.
- **No runtime dependencies.** `node:zlib`, `node:events`, `node:crypto` (nonces), `node:timers/promises`, and the `WebSocket` global.
- **Hot path** (`socket frame → inflate → JSON.parse → emit`): fixed field order, no `delete`, no `Object.assign`, snowflakes stay `string`.
- **TSDoc on every exported symbol** (`tsdoc/syntax` is an error).
- **No floating promises** — this package is almost entirely timers and queues.

---

## 4. Per-file specification

### 4.1 `GatewayOptions.ts`

Mirrors `RESTOptions.ts`: an optional-fields interface, a `Resolved…` type, a `Default…` const.

```ts
export interface ShardOptions {
  token: string
  intents: number
  shard?: [shardId: number, shardCount: number]
  compression?: CompressionMode          // 'none' | 'zlib-stream' | 'zstd-stream'
  encoding?: 'json'
  largeThreshold?: number                // 50..250
  presence?: GatewayPresenceUpdateData
  capabilities?: number                  // escape hatch; never set by default
  properties?: GatewayIdentifyProperties

  transport?: TransportFactory
  compressionFactory?: CompressionFactory
  encodingFactory?: EncodingFactory
  sessionStore?: SessionStore
  identifyThrottler?: IdentifyThrottler
  timers?: Timers

  handshakeTimeout?: number              // socket open → Hello
  identifyRetryDelay?: [minMs, maxMs]    // LIBRARY POLICY, see §8-C1
  resumeBackoff?: BackoffPolicy
  identifyBackoff?: BackoffPolicy
  maxResumeAttempts?: number
  maxReconnectAttempts?: number
  sendLimit?: number                     // 120
  sendWindow?: number                    // 60_000
  heartbeatReserve?: number              // slots withheld from user sends
  sendTimeout?: number | null            // null = wait forever, mirrors rateLimitTimeout
  maxInflightMessages?: number
  maxBufferedBytes?: number
  maxPayloadBytes?: number               // decompression-bomb ceiling
  chunkSize?: number                     // inflate output chunk size
  guildReadyIdleTimeout?: number
  headers?: Record<string, string>
  dispatcher?: unknown                   // passed through to undici; not typed here
}
```

Defaults, each annotated in TSDoc with whether it is **protocol** or **Vestra policy**:

```ts
export const DefaultShardOptions = {
  compression: 'zlib-stream',            // see §4.4 — decision needs sign-off
  encoding: 'json',
  largeThreshold: 50,                    // Discord's documented default
  handshakeTimeout: 30_000,              // policy
  identifyRetryDelay: [1_000, 5_000],    // policy (removed from the docs)
  resumeBackoff:   { baseMs: 500,  capMs: 30_000, maxAttempts: Infinity },
  identifyBackoff: { baseMs: 1_000, capMs: 60_000, maxAttempts: Infinity },
  maxResumeAttempts: 2,                  // policy
  maxReconnectAttempts: Infinity,
  sendLimit: 120, sendWindow: 60_000,    // protocol
  heartbeatReserve: 4,                   // policy, §8-C4
  sendTimeout: null,
  maxInflightMessages: 256,              // policy
  maxBufferedBytes: 8 * 1024 * 1024,     // policy
  maxPayloadBytes: 8 * 1024 * 1024,      // policy, §8-C5
  chunkSize: 64 * 1024,                  // policy; 16 KiB is Node's default
  guildReadyIdleTimeout: 15_000,         // policy, §8-C3
} as const
```

**`largeThreshold` default is 50, not 250.** Verified: "Value between 50 and 250 … Default 50". Under ADR 4 the default cache stores no members, so a 250 threshold means inflating, parsing and discarding up to 250 member objects per guild on every `GUILD_CREATE` for nothing. The TSDoc must state the precondition verbatim: raising it only has any effect **if the `GUILD_PRESENCES` intent is present and the guild is under 75k members** — "If your bot does not have the `GUILD_PRESENCES` Gateway Intent, or if the guild has over 75k members, members and presences returned in this event will only contain your bot and users in voice channels."

**`compress` (payload compression) must never be set when transport compression is active.** Verified: "If an app is using payload compression, it cannot use transport compression" and "Payload compression will be disabled if you use transport compression." `ShardOptions` deliberately has no payload-compression switch.

URL construction, in `Shard`:

```
`${baseOrResumeUrl}?v=${APIVersion}&encoding=${encoding.query}` + (compression.query ? `&compress=${compression.query}` : '')
```

The resume URL takes **identical** `v`, `encoding` and `compress` params: "When resuming with the `resume_gateway_url` you need to provide the same version and encoding as the initial connection."

---

### 4.2 `transport/Transport.ts` + `transport/WebSocketTransport.ts`

```ts
export interface TransportListeners {
  onOpen(): void
  onMessage(data: string | ArrayBuffer): void
  onClose(code: number, reason: string, wasClean: boolean): void
  onError(error: Error): void
}

export interface Transport {
  connect(url: string): void
  send(data: string | Uint8Array): void
  close(code: number, reason?: string): void
  /** Abandons the socket without waiting for a closing handshake. */
  destroy(): void
  readonly bufferedAmount: number
}

export type TransportFactory =
  (listeners: TransportListeners, options: TransportInit) => Transport
```

`connect` is separate from construction so a scripted test transport survives a reconnect sequence and records the URL of each attempt in order.

`destroy()` is in the interface rather than assumed, because the default implementation **cannot** implement it the way a `ws` adapter would. Required semantics for `WebSocketTransport.destroy()`:

1. Abort the `AbortController` whose signal was passed to every `addEventListener(type, fn, { signal })` on the socket — detaching all listeners atomically. Without this, the abandoned socket's late `close`/`message` events re-enter a state machine that has already opened a new connection, producing double reconnects.
2. Synthesise a local close (`code: 4000, wasClean: false`) so the shard's state machine advances immediately.
3. Best-effort `ws.close(4000)`; swallow any throw.
4. Drop the reference; increment an abandoned-socket counter. Past a cap (default 4) emit an error — do not silently ignore.

`WebSocketTransport` rules:

- `ws.binaryType = 'arraybuffer'` **immediately after construction**, then assert it took. Verified: the default is `'blob'`, and `'nodebuffer'` is silently ignored. A Blob forces an `await blob.arrayBuffer()` on the hot path and makes frame ordering depend on promise resolution order.
- Never pass 1001 or 1006 to `close()`. Verified: both throw `DOMException: invalid code`. Route every code through `assertSendableCloseCode` (§4.6).
- Pass `{ headers: { 'user-agent': … }, dispatcher }` via undici's non-standard init so users get a real UA and a proxy escape hatch without a dependency.
- The `error` event carries no diagnostic information (empty `message`, bare `TypeError`, no `cause`, no `code`). Do not attempt to surface a cause. `WebSocketTransport` must log the target URL and attempt count itself, because the event will not. Document this as the known diagnosability cost of ADR 1, and point at the `ws` adapter as the escape hatch.
- Note in TSDoc that undici always offers `Sec-WebSocket-Extensions: permessage-deflate` and there is no opt-out. Discord does not negotiate it, so it is currently inert.
- **No receive back-pressure exists.** Verified: `pause`, `resume`, `_socket`, `terminate` are all absent. Back-pressure is imposed by `ShardConnection` (§4.5), and the only lever is closing the socket.

---

### 4.3 `compression/*`

```ts
export type CompressionMode = 'none' | 'zlib-stream' | 'zstd-stream'

export interface CompressionHooks {
  /**
   * Called once per gateway message, in arrival order.
   * BORROW CONTRACT: `payload` is valid only for the duration of this call.
   * It may alias a reused allocation. Decode it here; never retain it.
   */
  onPayload(payload: Buffer): void
  onError(error: Error): void
}

export interface Compression {
  readonly query: string | null    // 'zlib-stream' | 'zstd-stream' | null
  push(chunk: Buffer): void        // never throws; errors go to hooks.onError
  destroy(): void
}
```

The borrow contract is how the spec satisfies two rules at once: Node slices output out of a reused `_outBuffer`, so retaining a chunk pins up to `chunkSize` bytes per shard; and the single-chunk fast path (`chunk.toString('utf8')`, skipping `Buffer.concat`) is only sound if consumption happens inside the callback. `ShardConnection` hands the buffer straight to `Encoding.decode()` and stores nothing.

**`ZlibStream.ts`**

- One `zlib.createInflate({ chunkSize })` per connection. Verified as mandatory: the zlib header is sent once at the start of the connection and the LZ77 window carries across payloads. Per-message `inflateSync` is not a valid implementation.
- Boundary detection: check whether **the arriving websocket message's last four bytes** equal `00 00 ff ff`. Verified against the docs' own example: `if len(msg) < 4 or msg[-4:] != ZLIB_SUFFIX: return`. Never scan for interior occurrences — the same four bytes occur inside Huffman-coded data, and an interior cut desynchronises the shared context for the remainder of the connection.
- Write **every** chunk to the context on arrival, boundary or not — inflate accepts partial input, and this avoids the `bytearray` copy in Discord's Python example. Only the boundary decides when to harvest.
- `Buffer.from(arrayBuffer)` is a zero-copy view. Never concatenate input.
- **No `flush()`.** Verified: the write callback is already a complete-output barrier; `flush()` injects an extra empty write and costs one more threadpool round-trip per event on the hottest path.
- **No awaiting between writes.** Verified in §0 correction 1.
- **Harvest inside the write callback.** Swap the accumulator there, not after.
- Single-chunk fast path: if exactly one chunk accumulated, skip `Buffer.concat`.
- Attach an `'error'` listener. An unhandled `'error'` on a Node stream kills the process.
- Cap the accumulator (`maxBufferedBytes`). Nothing in the protocol guarantees a sentinel ever arrives.
- Count output bytes per payload against `maxPayloadBytes` and abort past it. **`maxOutputLength` does not work here** — verified: 200,000 bytes emitted under a 4,096 cap with no error, and Node documents the option as limiting "convenience methods" only.
- `destroy()` sets `#disposed` **before** destroying the stream. Every hook call checks it. Verified rationale: decompression completes asynchronously, so output can arrive after `close` has fired and a new session has started; feeding a stale payload into the new session corrupts sequence tracking. Discarding late payloads is safe precisely because `s` only advances on payloads actually parsed, so RESUME replays them.
- Never call `_processChunk`. Verified: it works once, then `_handle` is null.

**`ZstdStream.ts`**

- One `zlib.createZstdDecompress()` per connection, alive for its whole lifetime.
- **No sentinel, no input buffering.** One websocket message = one gateway message. Verified: "each websocket message corresponds to a single gateway message, but does not end a zstd frame." My probe confirms the zstd magic appears on message 1 only and per-message sync decompression fails from message 2 with `ZSTD_error_prefix_unknown`.
- The docs' "repeatedly call `ZSTD_decompressStream`" is already satisfied by `write(msg, cb)`. Do not add a manual loop; do not call `flush(ZSTD_e_flush)`.
- Same disposal, error, bomb-guard and borrow rules as `ZlibStream`.
- Because zstd gives the client **no** boundary self-check, a `JSON.parse` failure is the only signal of a violated 1:1 assumption. Surface it as a protocol error, not as a decode bug.

**`compression/index.ts`** — `createCompression(mode, hooks, settings)`, a registry lookup keyed by mode, so switching from zstd to zlib is one option and no code path.

---

### 4.4 Default compression — a decision that needs sign-off

**Recommendation: default `zlib-stream` for 1.0.** This differs from the researchers', who proposed zstd at `"likely"` confidence and themselves listed it as an open question deserving an ADR.

The case for zstd is real: Discord's own figures favour it, and the decoder is strictly simpler. The case against is that `zlib.createZstdDecompress` is **Stability 1 — Experimental** across the entire Node 22 LTS line (verified at v22.x docs today), it sits on the hot path of a library whose selling point is reliability, ADR 1 leaves no fallback implementation, and — decisively — the only round-trip evidence anyone has used **Node's compressor on both ends**. That proves Node is self-consistent; it does not prove interoperability with Discord's encoder, and the window-size question (§8-A6) is unresolved.

Both codecs ship fully implemented behind the same interface. The default flips to `zstd-stream` when (a) a conformance test against captured live gateway traffic passes, and (b) node:zlib's zstd reaches Stability 2. Record it as ADR 7 either way; the Node floor of 22.15.0 stays justified because it buys the *option*, and the option is what ADR 1's pluggable-interface constraint exists to protect.

---

### 4.5 `connection/ShardConnection.ts`

Owns one socket from `connect()` to disposal. Constructed by `Shard`, never reused.

```ts
export class ShardConnection {
  constructor(shard: ShardContext, url: string, epoch: number)
  connect(): void
  sendHeartbeat(sequence: number | null): void
  send(payload: GatewaySendPayload, signal?: AbortSignal): Promise<void>
  /** Graceful: 1000 ends the session, 4000 keeps it resumable. */
  close(code: number, reason?: string): void
  /** Abandons the socket; the only correct response to a zombie. */
  dispose(): void
  readonly epoch: number
  readonly disposed: boolean
}
```

Responsibilities and rules:

- Constructs transport, compression and `SendQueue`; wires `Heartbeater`.
- Message path: `onMessage(data)` → `Buffer.from(ab)` (zero-copy) → `compression.push` → `onPayload(buf)` → `encoding.decode(buf)` → `shard.handleFrame(payload)`. Nothing is retained.
- **Back-pressure**: maintain explicit counters — messages pushed but not yet delivered, and accumulated compressed bytes. Past `maxInflightMessages` or `maxBufferedBytes`, emit `backpressure` and `close(4000)`. Verified rationale: `write()`'s boolean return is useless because the high-water mark counts *compressed* bytes — four writes totalling ~960 bytes expanded to 800 KB and `write()` returned `true` every time. Closing is safe because a non-1000/1001 close leaves the session resumable.
- **Decompression error** → `hooks.onError` → dispose the connection (the context is already dead and cannot be reset), reconnect with a fresh one, attempt RESUME once; if it recurs immediately, degrade to identify.
- `dispose()` sets `disposed` first, then stops the heartbeater, destroys the compression context, and calls `transport.destroy()`.

---

### 4.6 `connection/Heartbeater.ts`

```ts
export class Heartbeater {
  constructor(hooks: HeartbeaterHooks, timers: Timers)
  start(intervalMs: number): void
  beatNow(): void            // op 1 received from Discord
  ack(): void                // op 11 received
  stop(): void
  readonly latency: number
  readonly acked: boolean
}
```

Rules, all verified verbatim:

- **First beat only is jittered**: `timers.setTimeout(beat, intervalMs * timers.random())`. "Upon receiving the Hello event, your app should wait `heartbeat_interval * jitter` where `jitter` is any random value between 0 and 1, then send its first Heartbeat event. From that point until the connection is closed, your app must continually send Discord a heartbeat every `heartbeat_interval` milliseconds." Do **not** re-randomise per beat. Jitter is per *connection*, so a resume connection re-jitters its own first beat. Purpose, per the Info callout: preventing an influx of traffic when many clients reconnect at once.
- **Payload**: `{ op: 1, d: <last non-null s> }`, `null` if none. "You need to cache the most recent non-null `s` value for heartbeats, and to pass when Resuming." Control frames (op 1/7/9/10/11) carry `s: null` and must never overwrite it.
- **Zombie check fires at the moment the next beat is due.** If the previous beat is un-ACKed, do not send another and do not wait for a close — call `hooks.onZombie()`, which disposes the connection. "If a client does not receive a heartbeat ACK between its attempts at sending heartbeats, this may be due to a failed or 'zombied' connection. The client should immediately terminate the connection with any close code besides `1000` or `1001`, then reconnect and attempt to Resume."
- **Zombie recovery uses `dispose()`, never `close()`.** A zombie is by definition a peer that has stopped responding, so the closing handshake never completes; the researchers observed `readyState` stuck at 2 (CLOSING) with no close event after 45 seconds, and there is no closing-handshake timeout in undici and no `terminate()` on the WHATWG interface. A shard that awaits the close event before reconnecting hangs forever. This is the single worst failure mode in the design and it is invisible against a well-behaved mock server — hence test scenario R7.
- **`beatNow()`** on receiving op 1: "your app should immediately send back another Heartbeat event without waiting the remainder of the current interval." *Policy (docs silent, §8-A2):* a requested beat does **not** reset the periodic timer and shares the single `awaitingAck` flag, so a burst of requested beats can neither starve nor falsely trip the detector.
- **Heartbeat fire-time drift**: record `actual - scheduled` on every beat and emit `heartbeatDrift` past a threshold. A blocked event loop delays the heartbeat timer itself, Discord stops receiving beats and closes the connection, the bot reconnects, replays, and blocks again — the classic "dies under load" spiral. The fire-time delta is the only self-observable signal, because a blocked loop cannot run the code that would detect it in real time.
- **Never await user dispatch handlers on this path.** The heartbeat timer must be independent of dispatch processing.
- Secondary signal: sample `transport.bufferedAmount` at each beat; non-zero and not decreasing across two intervals means the send path is wedged — treat as zombied even if ACKs are somehow still arriving. (`bufferedAmount` is implemented; researcher-verified on Node 25, §8-B.)

---

### 4.7 `connection/SendQueue.ts`

Per connection. Enforces:

- **120 events per connection per 60 seconds**, as a **sliding** window — a `Float64Array` ring buffer of send timestamps, exactly the shape `GlobalLimiter` already uses for REST. A tumbling window would permit 240 sends across a real minute at a boundary, which is precisely a bot's shape when it wakes and flushes queued work. "Apps can send 120 gateway events per connection every 60 seconds… Apps that surpass the limit are immediately disconnected from the Gateway. Similar to other rate limits, repeat offenders will have their API access revoked."
- **A reserved heartbeat lane.** `sendHeartbeat` bypasses the FIFO queue entirely and may draw on the last `heartbeatReserve` slots; `send` may not. Without this, a presence-update burst delays a heartbeat past the interval, no ACK arrives, the shard diagnoses a zombie, reconnects, and repeats — a confusing loop whose actual cause is a rate limit. The reservation size is policy, not protocol (§8-C4).
- **4096-byte ceiling**, checked before every send: `Buffer.byteLength(serialised)` — throw `PayloadTooLargeError` naming the opcode. "Must not exceed 4096 bytes. If an event payload does exceed 4096 bytes, the connection will be closed with a `4002` close event code." Without the pre-send check the symptom is a mysterious 4002 several hundred milliseconds after an innocuous call, with nothing linking the two. Most likely to bite `RequestGuildMembers` with a large `user_ids` array.
- **Exhaustion policy** mirrors REST's `rateLimitTimeout`: `sendTimeout: null` waits indefinitely, a number rejects with a typed error. (§8-C6 — the failure characteristics differ from REST because a blocked gateway send can starve heartbeats, which is why the reserve exists.)
- `reset()` is never called — a new connection gets a new `SendQueue`.

---

### 4.8 `connection/CloseCodes.ts` and `connection/Backoff.ts`

```ts
export const ShardCloseAction = { Resume: 'resume', Identify: 'identify', Fatal: 'fatal' } as const
export function classifyClose(code: number | undefined, wasClean: boolean): ShardCloseAction
export const ClientCloseCodes = { Shutdown: 1000, Resumable: 4000 } as const
export function assertSendableCloseCode(code: number): void   // 1000 or 3000..4999
```

`Backoff` implements **full jitter**: `delay = random() * min(cap, base * 2 ** attempt)`. Full jitter rather than fixed or decorrelated is what actually decorrelates a fleet whose shards all disconnected in the same second.

- **Reset only on `READY` or `RESUMED`**, never on socket open. Resetting on open makes the backoff useless in the common failure mode where the socket opens and is immediately closed with 4014.
- **`startAtCap()` on 4008**, because the cause is you.
- `maxAttempts` breach → `Fatal`.

Backoff itself is entirely undocumented — verified by grepping all three doc files for `backoff`, `exponential` and retry guidance: zero hits. The only guidance is negative: "In order to prevent broken reconnect loops, you should consider some close codes as a signal to stop reconnecting." Everything in `Backoff` is Vestra policy and its TSDoc must say so.

---

### 4.9 `ready/GuildReadyTracker.ts`

```ts
export class GuildReadyTracker {
  constructor(opts: { idleMs: number; enabled: boolean }, timers: Timers,
              onComplete: (unresolved: string[]) => void)
  seed(ids: string[]): void
  resolve(id: string): void
  stop(): void
  readonly pending: ReadonlySet<string>
}
```

- READY means only that the handshake succeeded. Its `guilds` are Unavailable Guild objects — ids and nothing else. "`guilds` are the guilds of which your bot is a member. They start out as unavailable when you connect to the gateway. As they become available, your bot will be notified via Guild Create events."
- Remove an id on `GUILD_CREATE` **or** `GUILD_DELETE`. Both are required: "Guilds that are unavailable due to an outage will send a Guild Delete event." Tracking only `GUILD_CREATE` means outage guilds never clear and every restart during a Discord incident falls through to the timeout.
- **Idle timer, not absolute.** Reset on each resolution; fire `onComplete(unresolved)` when it expires. A 2500-guild shard legitimately streams far longer than a 10-guild one, so any fixed value either times out real bots or delays small ones. The 15 s default is ecosystem convention, not protocol (§8-C3).
- **`enabled: false` when `(intents & Guilds) === 0`.** Without the GUILDS intent `GUILD_CREATE` never arrives, so the set can never drain and every interaction-only bot pays the full timeout on every connect while its logs claim guilds failed to arrive. Gate on the intent bit, not on an empty array (§8-A9).
- This lives in `@vestra/gateway` and not `@vestra/core` because it touches only ids and event names: it constructs no structures and caches nothing, so ADR 5's boundary holds.

This is deliberately **not** a hard gate on anything. Per the Info callout — "In the event of a service outage where you stay connected to the Gateway, you should continue to send heartbeats and receive heartbeat ACKs. The Gateway will eventually respond and issue a session once it's able to" — **there is no unconditional Ready timeout that closes the socket.** As long as beats are being ACKed the connection is healthy. `handshakeTimeout` covers only socket-open → Hello, and the Identify → READY leg emits a warning at most.

---

### 4.10 `session/SessionStore.ts` and `session/IdentifyThrottler.ts`

```ts
export interface SessionState {
  sessionId: string
  sequence: number
  resumeUrl: string
  shard: [id: number, count: number]
}
export interface SessionStore {
  get(shardId: number): Promise<SessionState | undefined>
  set(shardId: number, state: SessionState): Promise<void>
  delete(shardId: number): Promise<void>
}
```

That triple plus the shard tuple is exactly and only what a resume needs — verified against Preparing to Resume: "it will need three values: the `session_id` and the `resume_gateway_url` from the Ready event, and the sequence number (`s`) from the last Dispatch event." Keeping the interface this small is what makes a Redis implementation trivial.

Cross-process resume is a **strong inference, not a documented guarantee** (§8-A8). The docs describe session lifetime in terms of the TCP connection and close code, never the client process. Write the TSDoc accordingly, and document that the store is only useful for fast restarts because sessions "timeout after a few minutes".

```ts
export interface IdentifyThrottler {
  waitForIdentify(shardId: number, signal?: AbortSignal): Promise<void>
}
export class InProcessIdentifyThrottler implements IdentifyThrottler {
  constructor(opts: { maxConcurrency: number; windowMs?: number }, timers?: Timers)
  setMaxConcurrency(value: number): void
}
```

- `rate_limit_key = shard_id % max_concurrency`, verbatim from the docs. Group by the key, never by shard id and never by a constant.
- Window is **5 seconds**: "max_concurrency | integer | Number of identify requests allowed per 5 seconds."
- One slot per key per window; waves drain in ascending shard order. Implement as **one FIFO queue per key**, not `floor(shard_id / max_concurrency)` — the shortcut is right only by accident for a contiguous set, and breaks for a process owning e.g. shards {3, 19, 35}, which all share key 3 and must be serialised.
- The per-key reading is the conservative one and satisfies both readings of an ambiguous doc (§8-A11).
- **Resume must not go through the throttler.** "This limit is global and across all shards, but does not include `RESUME` calls." Gating resumes needlessly serialises recovery of a whole fleet after a Discord restart.
- The interface exists because buckets are scoped to the **token**, not the process. A per-process throttler is silently wrong the moment a user runs 4 processes of 16 shards: each thinks it owns bucket 0 and four shards identify in the same window. That failure only appears in production, and retrofitting a cross-shard lock later means changing every shard constructor.

---

### 4.11 `members/MemberChunker.ts`

```ts
export class MemberChunker {
  request(options: RequestGuildMembersOptions): Promise<APIGuildMember[]>
  handleChunk(data: GatewayGuildMembersChunkDispatchData): void
  handleRateLimited(data: GatewayRateLimitedDispatchData): void
  reset(reason: Error): void
}
```

Verified rules:

- Payload: `guild_id` required; exactly one of `query` or `user_ids`; `limit` required when using `query`; optional `presences`, `nonce`.
- One `guild_id` per request. A `query` prefix returns at most 100 members. `user_ids` returns at most 100.
- `GUILD_MEMBERS` intent required for the all-members form; `GUILD_PRESENCES` required for `presences: true`, "otherwise it will always be false".
- **Nonce ≤ 32 bytes, asserted at construction time.** "Nonce can only be up to 32 bytes. If you send an invalid nonce it will be ignored and the reply member_chunk(s) will not have a nonce set." A UUID-with-braces or composite key over 32 bytes yields chunks with no nonce, the request can never be correlated, and the caller's promise hangs forever. Generate a short fixed-width id and assert `Buffer.byteLength(nonce) <= 32`.
- Completion is `chunk_index === chunk_count - 1` for that nonce — never a count of received chunks, which breaks when chunks interleave with another in-flight request. Up to 1000 members per chunk.
- **Op 8 all-members rate limit: 1 request per guild per bot every 30 seconds**, rolled out 2025-10-01. Applies only to the `limit: 0` + empty `query` form, and only to the request, not the chunks. Enforce a per-guild gate.
- **`RATE_LIMITED` dispatch**: `{ opcode, retry_after, meta: { guild_id, nonce? } }`. **`retry_after` is a float in SECONDS** — multiply by 1000. Treating it as milliseconds turns a 30-second backoff into 30 ms and reproduces the limit instantly. Reject the correlated pending request rather than letting it hang.
- Pending map needs a **TTL**; a request whose chunks never arrive otherwise leaks the callback and its closure forever. `reset(reason)` rejects everything on a fresh identify.
- TSDoc should point at the REST alternative: `GET /guilds/{id}/members?limit=1000&after=…` is bounded by the normal per-route bucket `@vestra/rest` already handles, and is now the faster path for a multi-guild backfill — but it needs the `GUILD_MEMBERS` privileged intent enabled in the portal, since "HTTP API restrictions are independent of Gateway restrictions."

---

### 4.12 `ShardManager.ts` and `util/ShardRouting.ts`

```ts
export class ShardManager extends EventEmitter<ShardManagerEvents> {
  constructor(options: ShardManagerOptions)
  connect(): Promise<void>
  destroy(opts?: { resumable?: boolean }): Promise<void>
  readonly shards: ReadonlyMap<number, Shard>
  shardIdForGuild(guildId: string): number
}
```

- **Preflight**: call `GET /gateway/bot` before opening any socket. Cache **only the `url`** as the base URL, for the process lifetime — "you should cache the value of the `url` field and use that when re-connecting." Do **not** cache the response: "this route should not be cached for extended periods of time as the value is not guaranteed to be the same per-call, and changes as the bot joins/leaves guilds." Caching the whole response makes a stale `shards` and a burned session budget invisible.
- Keeping the base URL separate from `resume_gateway_url` is what gives the failed-resume path somewhere to go.
- **Refuse to start** when `session_start_limit.remaining < shardCount`; warn when `remaining < shardCount * 2`. Throw `SessionLimitError` carrying `remaining`, `total`, `reset_after` — a typed fatal error, never a retry loop. The consequence of overrunning is not a throttle: "Upon hitting this limit, all active sessions for the app will be terminated, the bot token will be reset, and the owner will receive an email notification." A retry loop past the cap converts a config mistake into an outage needing manual human intervention. The refusal and the headroom thresholds are Vestra policy; the limit and its consequence are documented.
- Default shard count is `shards` from `GET /gateway/bot`. Do not derive a formula — none is published (§8-A12).
- Honour `UnrecoverableGatewayCloseCodes`. On 4011 surface a fatal error naming the required shard count; retrying is an infinite loop that also spends a session start each attempt.
- Read the daily budget and `max_concurrency` from the endpoint. Never hard-code 1000 or 1: above 150,000 guilds the limit becomes `max(2000, (guild_count / 1000) * 5)` and `max_concurrency` is increased.
- **Shard 0 receives guild-less events** — DM, subscription and entitlement events. Document it; shards are not interchangeable and DM handling must never be round-robined.
- **Zero-downtime resharding**: "`num_shards` does not relate to (or limit) the total number of potential sessions. It is only used for routing traffic… You can establish multiple sessions with the same `[shard_id, num_shards]`, or sessions with different `num_shards` values… to orchestrate 'zero-downtime' scaling." The design decision here is deliberately *not* to invent a `ShardGroup` class: a second `ShardManager` with a different `shardCount`, **sharing the same `IdentifyThrottler` and `REST` instance**, is the sanctioned cut-over path. `ShardManagerOptions` therefore takes `shardIds?: number[]` and `shardCount` independently, and the throttler is injectable. Costs nothing now; a manager that assumes `num_shards` is global state per token cannot express rolling resharding at all.
- `shardIdForGuild`: `Number(BigInt(id) >> 22n) % count`. Called only by the manager when routing an outbound op 8 / op 3 / op 4 — never per inbound dispatch, which would violate the snowflakes-as-string hot-path rule. If it ever lands on a hot path it needs a benchmark under `scripts/bench/` first.

---

## 5. The `Shard` state machine

### States (`as const`)

| State | Meaning | Connection object |
|---|---|---|
| `Idle` | constructed; `connect()` not called | none |
| `Connecting` | `transport.connect(url)` issued, awaiting `open` | alive |
| `Handshaking` | socket open, **no Hello yet**, nothing sent | alive |
| `Identifying` | Hello received, heartbeats started, Identify sent, awaiting READY | alive |
| `Resuming` | Hello received, heartbeats started, Resume sent | alive |
| `Replaying` | first replayed dispatch arrived; awaiting `RESUMED` | alive |
| `Ready` | READY or RESUMED received; live traffic | alive |
| `Reconnecting` | connection disposed, backoff timer pending | none |
| `Closing` | user shutdown in flight, close issued, abandon timer armed | alive |
| `Closed` | stopped by the user; `connect()` may be called again | none |
| `Fatal` | terminal; `connect()` throws | none |

The `identify | resume` branch is chosen **before connecting**, from `#intent`, which decides both the URL and what is sent after Hello:

```
intent = (sessionId && sequence !== null && resumeUrl && lastCloseAction !== Identify)
       ? 'resume' : 'identify'
url    = intent === 'resume' ? resumeUrl : baseUrl
```

### Transition table

| # | From | Trigger | To | Actions |
|---|---|---|---|---|
| 1 | `Idle`/`Closed` | `connect()` | `Connecting` | resolve intent + URL, `epoch++`, new `ShardConnection` |
| 2 | `Connecting` | transport `open` | `Handshaking` | **send nothing** |
| 3 | `Connecting` | transport `error`, or close before open | `Reconnecting` \| `Fatal` | classify; if intent was resume, `resumeAttempts++` |
| 4 | `Handshaking` | `handshakeTimeout` elapses | `Reconnecting` | dispose; policy, not protocol |
| 5 | `Handshaking` | **op 10 Hello** | `Identifying` \| `Resuming` | `heartbeater.start(d.heartbeat_interval)` **first**; then if identify → `await throttler.waitForIdentify(id)` → send Identify; else send Resume |
| 6 | `Identifying` | dispatch `t: "READY"` | `Ready` | store `session_id` + `resume_gateway_url`; `sessionStore.set`; seed `GuildReadyTracker`; `backoff.reset()`; `resumeAttempts = 0` |
| 7 | `Identifying` | **op 9** (any `d`) | `Reconnecting` | intent = identify; clear session; `identifyRetryDelay` + backoff. Treat `d` as false during identify (§8-A10) — a `d:false` storm across shards is the signature of a broken identify throttle |
| 8 | `Resuming` | any dispatch | `Replaying` | set replay flag; advance `s` normally |
| 9 | `Resuming`/`Replaying` | dispatch `t: "RESUMED"` | `Ready` | clear replay flag; `backoff.reset()`; `resumeAttempts = 0` |
| 10 | `Resuming`/`Replaying` | **op 9 `d:false`** | `Reconnecting` | clear `sessionId`/`sequence`/`resumeUrl`; `sessionStore.delete`; intent = identify; URL = **base**; `identifyRetryDelay` |
| 11 | *any connected state* | **op 9 `d:true`** | `Reconnecting` | intent = resume; `close(4000)` then reconnect (§8-A3) |
| 12 | *any state incl. `Handshaking`* | **op 7 Reconnect** | `Reconnecting` | `close(4000)`; intent = resume **if a session exists**, else identify + base URL |
| 13 | `Ready` | **op 0 Dispatch** | `Ready` | `sequence = s` (non-null only); feed tracker/chunker; emit `dispatch` |
| 14 | *any* | **op 1 received** | unchanged | `heartbeater.beatNow()` |
| 15 | *any* | **op 11** | unchanged | `heartbeater.ack()` |
| 16 | *any* | next beat due while un-ACKed | `Reconnecting` | **`connection.dispose()`** — not `close()`; intent = resume |
| 17 | *any* | transport `close(code, reason, wasClean)` | `Reconnecting` \| `Fatal` | `classifyClose` (§6); on Identify → clear session; on Fatal → `FatalCloseError` |
| 18 | *any* | back-pressure ceiling breached | `Reconnecting` | emit `backpressure`; `close(4000)`; intent = resume |
| 19 | *any* | compression `error` | `Reconnecting` | dispose; intent = resume once, then identify if it recurs |
| 20 | `Resuming`/`Replaying` | `resumeAttempts > maxResumeAttempts` | `Reconnecting` | intent = identify; URL = base |
| 21 | `Reconnecting` | backoff timer fires | `Connecting` | — |
| 22 | `Reconnecting` | `attempts > maxReconnectAttempts` | `Fatal` | — |
| 23 | *any* | `destroy({ recover: 'none' })` | `Closing` | `close(1000)` — ends the session deliberately |
| 24 | *any* | `destroy({ recover: 'resume' })` | `Closing` | `close(4000)` — keeps the session resumable; persist to `SessionStore` |
| 25 | `Closing` | close event, or abandon timer | `Closed` | `dispose()`; reject pending sends and chunk requests |

**Rules the table encodes that implementations routinely get wrong:**

- **Row 5 order.** Heartbeating starts *before* Identify, and Identify is **not** gated on the first (jittered) beat having fired. "After the connection is open and your app is sending heartbeats, you should send an Identify (opcode `2`) event." Blocking Identify on the jittered beat would delay login by up to a full interval (~41 s), which presents as a hung startup.
- **Row 12 reachability.** The op 7 handler must sit in the frame dispatcher, reachable from every state including `Handshaking`. "This can occur at any point in the gateway connection lifecycle, even before/in place of receiving a Hello event." And close yourself rather than waiting: "A few seconds after the reconnect event is dispatched, the connection may be closed by the server" — waiting wastes the grace window and risks the close arriving as 1006 mid-flight.
- **Row 12, no session.** Op 7 before READY means there is nothing to resume; fall back to a fresh Identify against the cached base URL.
- **Row 16.** `dispose()`, never `close()`.
- **Row 13.** Only op 0 advances `s`. Letting a control frame's `s: null` clobber it turns a resumable session into a 4007 on the next resume.
- **Rows 6/9.** Backoff resets on READY/RESUMED only.
- **Row 20.** The resume path is bounded: "If you *cannot* reconnect **or the reconnect fails**, you should open a new connection using the URL from the initial call to Get Gateway or Get Gateway Bot." `resume_gateway_url` points at one node; if that node is what died, retrying it forever is a loop against a host that will never answer.
- **Rows 23/24.** "When you close the connection to the gateway with close code `1000` or `1001`, your session will be invalidated and your bot will appear offline. If you simply close the TCP connection or use a different close code, the session will remain active and timeout after a few minutes." A reconnect implemented as `close(1000); connect()` silently converts every cheap resume into a full identify. And 1001 is not sendable at all from this API.
- **A shard cannot read back its own close code.** The close event reports what the *peer* sent, or 1006. Record `#closingIntent: 'zombie' | 'user' | 'resume' | 'backpressure' | null` **before** calling close/dispose and consult it in the close handler. Logic keyed purely off `event.code` misclassifies a deliberate zombie termination as a network drop and a deliberate shutdown as a reconnectable failure.

### Emitted events

`stateChange(from, to)` · `hello(interval)` · `ready(data)` · `resumed()` · `dispatch(payload, replayed)` · `guildsReady(unresolved)` · `closed(code, reason, wasClean, action)` · `zombie()` · `backpressure(inflight, bytes)` · `heartbeatDrift(ms)` · `rateLimited(data)` · `error(err)`

**Ordering guarantee to publish:** dispatch payloads are handed to handlers in gateway sequence order, exactly once per connection, and the library does not await handler return values. Do **not** guarantee ordered handler *completion* — offer an opt-in serial mode implemented as an explicit queue, never by awaiting in the receive path. Awaiting async handlers puts every user handler on the critical path between the socket and the heartbeat, converting one slow handler into a zombie reconnect.

---

## 6. Close-code decision table

Discord's `Reconnect` column is quoted verbatim from the close-code table I fetched. The Vestra action column is the library's mapping.

| Code | Description | Discord `Reconnect` | **Vestra action** | Notes |
|---|---|---|---|---|
| **1006 / no code** | abnormal termination | — | **resume** | Documented resume trigger #3: "It's disconnected but doesn't receive *any* close code." Every abnormal termination — TCP RST, FIN without a close frame, non-101 handshake, connection refused — collapses to `1006 / "" / wasClean:false`. Do not try to tell them apart from the event; use context the shard tracks itself. |
| **4000** Unknown error | "Try reconnecting?" | true | **resume** | |
| **4001** Unknown opcode | invalid opcode/payload | true | **resume** + loud warning | client-side bug |
| **4002** Decode error | invalid payload | true | **resume** + loud warning | usually the 4096-byte ceiling; `SendQueue` should have caught it |
| **4003** Not authenticated | "payload prior to identifying, **or this session has been invalidated**" | true | **re-identify** *(policy)* | genuinely ambiguous — §8-A4. Surface loudly; a resume-once-then-degrade policy is also defensible |
| **4004** Authentication failed | bad token | **false** | **fatal** | |
| **4005** Already authenticated | >1 identify | true | **resume** + loud warning | state-machine bug |
| **4007** Invalid `seq` | "Reconnect and start a new session" | true | **re-identify** | clear session first |
| **4008** Rate limited | "sending payloads too quickly" | true | **resume**, `backoff.startAtCap()` | the cause is you; treating it as fatal kills a shard that only needed to back off |
| **4009** Session timed out | "Reconnect and start a new one" | true | **re-identify** | clear session first |
| **4010** Invalid shard | | **false** | **fatal** | large-bot sharding: count must be a multiple of the assigned number |
| **4011** Sharding required | >2500 guilds | **false** | **fatal** | error names the required shard count |
| **4012** Invalid API version | | **false** | **fatal** | |
| **4013** Invalid intent(s) | bad bitfield | **false** | **fatal** | |
| **4014** Disallowed intent(s) | not enabled/approved | **false** | **fatal** | retrying presents as a mysterious outage instead of "enable MessageContent" |
| **1000 / 1001 received from Discord** | — | — | **re-identify** *(policy)* | undocumented direction — §8-A5 |
| **1012, 1013, other proxy/LB codes** | — | — | **resume** | default: resume-and-degrade |
| **any other unknown code** | — | — | **resume** | |

`UnrecoverableGatewayCloseCodes` in `packages/types/src/enums/gateway.ts` matches Discord's `Reconnect: false` set **exactly** — I compared all fourteen rows. Honour it; do not duplicate it.

Client-sent codes: **1000** = deliberate permanent shutdown (invalidates the session, bot appears offline promptly). **4000** = every other close (keeps the session resumable). Never pass a received code straight back into `close()`.

---

## 7. Testing

### 7.1 `test/mock-transport.ts`

```ts
export class MockTransport implements Transport {
  // drive
  emitOpen(): void
  emitPayload(payload: object): void        // JSON-encodes and delivers as a message
  emitRaw(data: string | ArrayBuffer): void
  emitClose(code: number, reason?: string, wasClean?: boolean): void
  emitError(error?: Error): void
  // observe
  readonly connects: string[]               // every URL, in attempt order
  readonly sent: GatewaySendPayload[]       // parsed outbound frames, in order
  readonly closes: { code: number; reason?: string }[]
  readonly destroys: number
  // behaviour switches
  failNextConnect(): void                   // error event then 1006/wasClean:false
  swallowClose(): void                      // never emit close after close() — the CLOSING hang
  swallowMessages(): void                   // silent peer, for the zombie path
}
export function mockTransportFactory(): { factory: TransportFactory; transports: MockTransport[] }
```

Every reconnect decision is a pure function of (close code, `wasClean`, whether we identified, whether we hold a session), so `emitClose(4014, '', true)` covers the entire fatal path with no socket at all. `connects[]` is what proves resume went to `resume_gateway_url` and fallback went to the base URL — the single most common real-world bug this suite exists to prevent. `swallowClose()` is what proves the shard never awaits a close event on the zombie path; without it the whole suite passes against a well-behaved fake and the worst bug in the design ships.

Paired with `Timers` (§4.13) and `node:test`'s `t.mock.timers.enable({ apis: ['setTimeout','setInterval','Date'] })`, the whole reconnect suite runs in milliseconds. **`Math.random` is not mockable by `t.mock.timers`** — jitter must come from the injected `Timers.random`, or the `heartbeat_interval * jitter` rule and the backoff jitter are untestable.

**Implementation note:** `SystemTimers` must dereference `globalThis.setTimeout` **at call time**, not capture it at module scope. A captured reference is not replaced by `t.mock.timers`, and every timing test silently runs in real time.

### 7.2 `test/mock-gateway.ts`

A real RFC 6455 server over `node:http` + `node:crypto` (SHA-1 + the RFC GUID handshake, frame encode/decode with client-mask handling), mirroring `packages/rest/test/mock-discord.ts` and its recorded rationale ("A real socket rather than a stubbed `fetch`"). ~120 lines, no dependency. Both layers are needed: the fake transport for state-machine logic, the real server for the undici-specific behaviours (1006 collapse, CLOSING hang, `binaryType`) that only appear against a socket.

### 7.3 Scenarios the suite must script

**Handshake** — H1 Hello → heartbeat scheduled at `interval * random()`, **not** sent immediately. H2 Identify is sent after `heartbeater.start()` and **without** waiting for the first beat. H3 Identify carries `shard`, `intents`, unprefixed `properties`, and **no** `compress`. H4 `large_threshold` omitted at the default. H5 READY caches `session_id` + `resume_gateway_url`; `SessionStore.set` called once.

**Heartbeats** — B1 subsequent beats at exactly `interval`, un-jittered. B2 `d` is the last non-null `s`; op 1/7/9/10/11 never overwrite it. B3 op 1 received → immediate beat. B4 op 11 clears the flag and records latency. B5 un-ACKed at the next due time → `destroys === 1`, `closes.length === 0`. B6 `swallowClose()` + zombie → the shard still reconnects (the CLOSING-hang regression). B7 a beat is never queued behind 119 user sends.

**Resume vs identify** — R1 1006 → connects to `resumeUrl` and sends op 6 with `seq` (not `s`), no Identify. R2 op 7 → close 4000 then resume. R3 op 7 in `Handshaking` with no session → base URL + Identify. R4 op 9 `d:true` → resume. R5 op 9 `d:false` → session cleared, base URL, Identify, and a delay inside `identifyRetryDelay`. R6 4007 and 4009 → re-identify, session cleared. R7 4004/4010/4011/4012/4013/4014 → `Fatal`, zero further `connects`. R8 4008 → resume with backoff starting at the cap. R9 resume connection fails to open `maxResumeAttempts` times → degrades to base URL + Identify. R10 replay: dispatches between Resume and RESUMED are flagged `replayed: true`; RESUMED flips it. R11 replayed dispatches advance `s`. R12 backoff resets on READY/RESUMED but **not** on socket open — script open-then-4014 and assert the delay grew.

**Per-connection reset** — C1 a new connection starts with `acked === true` (no instant zombie). C2 a fresh compression context per socket, including on resume. C3 late decompression output after `dispose()` is discarded and does not touch `sequence`.

**Send path** — S1 121st send in 60 s waits. S2 sliding window: 120 sends then idle 30 s → still throttled. S3 a 4097-byte payload throws `PayloadTooLargeError` and nothing reaches the transport. S4 `sendTimeout` set → rejects; `null` → waits.

**Throttler** — T1 shards 0..31 with `max_concurrency` 16 → 0–15 in wave 1, 16–31 in wave 2, five seconds apart. T2 non-contiguous {3, 19, 35} → serialised 5 s apart (all key 3). T3 resume never calls `waitForIdentify`. T4 preflight `remaining < shardCount` → `SessionLimitError` carrying `reset_after`, and **zero** connects.

**Readiness** — G1 pending set drains on `GUILD_CREATE`. G2 and on `GUILD_DELETE`. G3 idle timer fires with unresolved ids reported. G4 intents without GUILDS → completes at READY, no timer armed.

**Members** — M1 chunks reassemble by nonce, complete at `chunk_index === chunk_count - 1`. M2 nonce > 32 bytes throws at request time. M3 two interleaved requests do not cross-contaminate. M4 `RATE_LIMITED` with `retry_after: 30` produces a **30000 ms** wait, not 30. M5 second all-members request for the same guild within 30 s is gated locally. M6 pending requests reject on fresh identify and on TTL.

**Compression** — Z1 a payload split across three websocket messages reassembles (zlib). Z2 an interior `00 00 ff ff` inside compressed data is not treated as a boundary. Z3 accumulator cap breach closes with 4000. Z4 corrupt input raises `error` and does not crash the process. Z5 output-byte ceiling aborts a bomb. Z6 zstd: message 2 onward has no magic and still decodes through the shared context. Z7 golden-frame conformance vector (see §8-A7).

**Transport conformance, against the real server** — X1 close 4004 + reason delivered verbatim, `wasClean: true`. X2 abrupt destroy → 1006. X3 FIN without close frame → 1006. X4 handshake 401 → 1006. X5 fragmented message arrives as one. X6 24 MB message arrives whole. X7 `binaryType` is `'arraybuffer'`. X8 message order preserved across a single TCP write. X9 `close(1001)` throws — proving the guard is needed.

**CI matrix: 22.15.0, latest 22.x, 24, current.** Every local probe in this document ran on v25.8.1 only.

---

## 8. Must verify before implementing

Nothing in this section is settled. None of it is promoted to a confident rule anywhere above; each item is cross-referenced from the rule that depends on it.

### A. Protocol unknowns — need live-gateway measurement or a Discord answer

- **A1. Session timeout after a non-1000/1001 close.** The docs say only "timeout after a few minutes". This bounds how long a resume is worth attempting and how long a `SessionStore` entry stays valid across a restart. Interim: always try resume first and let op 9 `d:false` decide.
- **A2. Does a Discord-requested heartbeat (op 1 received) reset the periodic timer and/or the un-ACKed flag?** Docs say reply immediately, silent on both. §4.6 picks "resets neither the timer, shares the flag" as policy. Affects whether a burst of requested beats can starve or falsely trip the detector.
- **A3. On op 9 `d:true`, must the socket be closed first, or may Resume go out on the existing connection?** The Resuming procedure is written entirely in terms of a *new* connection, but `d:true` is listed as a trigger without saying to close. Row 11 takes the safe reading (close then reconnect); unverified.
- **A4. Close 4003.** Marked `Reconnect: true` but explained as "payload prior to identifying, **or this session has been invalidated**". §6 maps it to re-identify as policy. Resume-once-then-degrade is equally defensible.
- **A5. Can Discord send 1000/1001 *to* the client, and what does it imply for the session?** The docs describe only the client sending them. Also unaddressed: 1012/1013 from a fronted deployment.
- **A6. Discord's zstd window size.** If it exceeds Node's default `ZSTD_d_windowLogMax` the decompressor refuses to allocate. Settable via `params`; the required value is unknown and untested against live traffic. Blocks the zstd default (§4.4).
- **A7. Does node:zlib's zstd interoperate with Discord's encoder?** Every round-trip so far used Node's compressor on both ends — that proves Node is self-consistent, not that it matches Discord. Needs a golden-frame conformance test built from captured live traffic (test Z7). Also blocks §4.4.
- **A8. Cross-process resume.** Strong inference, not documented. Session lifetime is described in terms of the connection and close code, never the process.
- **A9. Does READY still enumerate guilds when GUILDS is not requested?** Determines whether the readiness tracker could rely on an empty array. §4.9 branches on the intent bit instead, which is safe either way.
- **A10. Is `d` false on the op 9 sent for a `max_concurrency` breach?** If it were true, a shard would attempt a resume it has no session for. Row 7 treats op 9 during identify as `d:false` regardless.
- **A11. Per-key or global identify concurrency?** The field description ("identify requests allowed per 5 seconds") reads global; the bucket formula and "you must start them by 'bucket' **in order**" read per-key. Discord never states the mechanism. §4.10 implements the strictly-safer per-key form, which is a subset of both readings. Also unknown: whether the 5 s window starts at the identify frame or at READY, and whether it is sliding or tumbling.
- **A12. Is there a formula behind `shards`?** Not documented. Use the returned value; do not derive one.
- **A13. Does a *failed* identify (4004, 4013/4014, or op 9) consume `session_start_limit.remaining`?** The warning counts "IDENTIFY calls", implying yes, but never says. Decides whether a misconfigured bot in a reconnect loop can reach the token-reset cliff.
- **A14. `session_start_limit` reset semantics.** Prose says "24-hour period"; the documented example shows `reset_after: 14400000` (4 hours). Fixed bucket, rolling window, or partial refill? A manager that sleeps for `reset_after` needs to know.
- **A15. What does `GET /gateway/bot` return when `remaining` is 0?** No JSON error code for session-start exhaustion appears in the opcodes-and-status-codes page.
- **A16. Is the op-8 30 s limit scoped per (guild, bot) or per (guild, session)?** The changelog says "per guild per bot", implying it is shared across shards *and processes* — meaning the op-8 gate, like the identify throttler, may need to be shareable. Not stated explicitly.
- **A17. Does Discord ever pack more than one gateway payload into a single websocket message?** Silent for both modes. The official Python example is only correct if it cannot happen. Interim: treat it as a protocol violation surfaced by `JSON.parse` failure, since scanning for interior sentinels is unsafe.
- **A18. Does Discord ever split a zstd-stream payload across websocket messages?** The docs assert 1:1, but the decoder cannot detect a violation and would emit truncated JSON.
- **A19. Does Discord's gateway fragment websocket messages, or split a zlib payload across messages, in practice?** The suffix-scanning instruction implies it can; unconfirmed against live traffic.
- **A20. How long may the `GUILD_CREATE` stream legitimately take for a full 2500-guild shard?** No timing guarantee is published, so any startup timeout is unverifiable against the protocol.
- **A21. Does the 120/60s budget count IDENTIFY and RESUME frames, and are heartbeats counted?** "Gateway events" is not defined narrowly enough. The heartbeat reserve assumes they count.
- **A22. Is `zstd-stream` available to all applications and API versions, or gated?** A rollout gate would change the default recommendation.

### B. Node-version unknowns — need the CI matrix, not a one-off check

Every probe in §0 ran on **v25.8.1**; the floor is **22.15.0**, and undici's WebSocket changed substantially across 22→25 (the `ErrorEvent` global only landed in v25). Re-verify on 22.15 before relying on: the shape of the error event; whether `close()` still hangs indefinitely against a silent peer; whether `bufferedAmount` is implemented; whether the `{ headers, dispatcher }` init is accepted; whether abandoned CLOSING sockets are ever reclaimed or leak an fd until process exit (they survived 45 s and held the event loop open, but long-run behaviour was not measured — if they never reclaim, the abandoned-socket cap is load-bearing rather than defensive).

Also version-fragile: the flush-free write-callback discipline rests on `processCallback` internals that are not a documented API contract. It held across 9 bytes to 300 KB here, but it wants a conformance test rather than a comment.

### C. Vestra policy numbers — invented here, must be documented as invented

- **C1. The 1–5 s re-identify delay.** Confirmed absent from the current docs (grepped all three files for `random`, `between 1 and 5`, `backoff`, `exponential` — the only `random` hit is the heartbeat jitter sentence). Keep the behaviour, because op 9 `d:false` is the documented response to exceeding `max_concurrency` and re-identifying instantly turns one throttled shard into a synchronised retry storm with a token reset at the end of it. Ship it as `identifyRetryDelay` and label it library policy. Worth an issue to re-check periodically, and worth asking discord-api-docs whether the 2022 removal was intentional.
- **C2. All backoff parameters** (base, cap, full-jitter shape, reset-on-Ready). Entirely undocumented.
- **C3. The 15 s guild-stream idle timeout.** Ecosystem convention (discord.js `waitGuildTimeout`), not protocol. The idle-vs-absolute design is sound; the number is a guess until A20 is measured.
- **C4. The heartbeat reserve size (4 of 120).** Undocumented anywhere. Configurable, and it should be benchmarked rather than asserted.
- **C5. `maxPayloadBytes`, `maxBufferedBytes`, `maxInflightMessages`, the abandoned-socket cap.** All invented ceilings. The largest realistic `GUILD_CREATE` was not measured.
- **C6. Send-queue exhaustion policy.** Mirroring REST's `rateLimitTimeout` is a shape choice; the failure characteristics differ because a blocked gateway send can starve heartbeats.
- **C7. Session-start headroom thresholds** (`remaining < shardCount` refuse, `< shardCount * 2` warn). The limit and its consequence are documented; the headroom policy is not.
- **C8. Proactive reshard threshold.** There is no "reshard at X% capacity" rule anywhere. Documented triggers are only 4011, crossing 2500 guilds, and the large-bot multiple. Any threshold Vestra offers must be labelled policy and be configurable — presenting an invented number as protocol is exactly the drift ADR 3 warns about.
- **C9. `chunkSize` at 64 KiB.** The 45,862 → 58,616 msg/s figures are a researcher's synthetic benchmark. Per CONTRIBUTING.md this belongs under `scripts/bench/` before any number is quoted in docs.

### D. Unresolved measurement

- **D1. Threadpool contention across many concurrent shard contexts** was reasoned about but never benchmarked; the ~40–50k msg/s figures are single-stream. Because no synchronous stateful inflate exists, every gateway event costs one threadpool round-trip, and a 50-shard process multiplexes 50 decompression streams over 4 default threads shared with all fs and dns work. Document it and recommend raising `UV_THREADPOOL_SIZE`; benchmark before claiming anything.
- **D2. The harvest-outside-callback corruption did not reproduce** (§0). The mandated pattern stands on its own argument, but the alternative is *unproven*, not *known broken*, and the spec must not claim otherwise.

---

## 9. Suggested issues to open before coding

Per the working agreement that GitHub is the record: (1) the seven `@vestra/types` gaps in §1, as one issue per §1 row or one grouped issue — item 7 (the TSDoc asserting a removed protocol rule) is a defect, not planned work; (2) the zstd-default decision as ADR 7 plus a tracking issue for A6/A7; (3) the Node CI matrix (§8-B); (4) a "verify against live gateway before 1.0" issue enumerating §8-A.
