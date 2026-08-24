Five facets were designed independently — the client surface, structures and conversion, the
cache, event handling, and layout/testing. Where two of them disagreed I have picked one, said
so, and recorded what was rejected and why (§6). Here is the specification.

---

# Phase 4 — `@vestra/core` implementation specification

## 0. Verification ledger

Everything below is tagged. **Verified** means somebody read it in this repository or ran it
today. **Assumed** means it follows from something verified but was not itself checked.
**Policy** means Vestra is inventing it and neither Discord's protocol nor the ADRs decide it.

### 0.1 Verified by reading the repository on `phase-3-gateway`

| Claim                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Where                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/core/src/index.ts` is nine lines of star re-exports and nothing else. Every file below is greenfield                                                                                                                                                                                                                                                                                                                                                                      | `packages/core/src/index.ts`                                              |
| `GatewayDispatchEvents` is an `as const` object of PascalCase key to SCREAMING_SNAKE value covering all 76 events; `GatewayDispatchEventMap` is a declaration-mergeable `interface`                                                                                                                                                                                                                                                                                                 | `types/src/enums/dispatch-events.ts`, `types/src/gateway/dispatch.ts`     |
| `GatewayDispatchPayload` is a discriminated union, so `payload.t === 'MESSAGE_CREATE'` narrows `payload.d`                                                                                                                                                                                                                                                                                                                                                                          | `types/src/gateway/dispatch.ts`                                           |
| `ShardManagerOptions extends Omit<ShardOptions, 'gatewayUrl' \| 'shardCount' \| 'shardId'>` and adds a **required** `fetchGatewayBot`                                                                                                                                                                                                                                                                                                                                               | `gateway/src/ShardManager.ts`                                             |
| `ShardManager.connect()` resolves after `shard.connect()` returns for every shard — after the socket is _opened_, not after READY                                                                                                                                                                                                                                                                                                                                                   | `ShardManager.connect`, `Shard.connect`                                   |
| `allReady` is emitted from a `shard.once('ready')` counter deferred by `queueMicrotask`, with a source comment stating the deferral exists so consumer `ready` handlers run first                                                                                                                                                                                                                                                                                                   | `ShardManager.connect`                                                    |
| `ShardManager` forwards only `error`. It does **not** forward `dispatch`, `closed`, `zombie`, `backpressure` or `heartbeatDrift`                                                                                                                                                                                                                                                                                                                                                    | `ShardManagerEvents`, `#createShard`                                      |
| On `shardSpawn`, `manager.shards.get(id)` is already populated and `shard.connect()` has not yet been called                                                                                                                                                                                                                                                                                                                                                                        | `#createShard`                                                            |
| **`Shard` wires neither `GuildReadyTracker` nor `MemberChunker`.** Both are exported from the gateway barrel, unit-tested, and constructed by nobody                                                                                                                                                                                                                                                                                                                                | grep over `gateway/src`: only `index.ts` and their own files              |
| `Shard.#onDispatch` calls `session.advance(payload.s)` **before** emitting `dispatch`. The sequence advances whether or not a handler succeeds                                                                                                                                                                                                                                                                                                                                      | `gateway/src/Shard.ts`                                                    |
| `sendIdentify` never sends `presence`; `ShardOptions` has no `presence` field, though `GatewayIdentifyData.presence?` exists in `@vestra/types`                                                                                                                                                                                                                                                                                                                                     | `ShardHandshake.ts`, `GatewayOptions.ts`, `types/src/gateway/payloads.ts` |
| `userAgent` and `version` are each declared twice — on `RESTOptions` and on `ShardOptions` — with identical defaults                                                                                                                                                                                                                                                                                                                                                                | `RESTOptions.ts`, `GatewayOptions.ts`                                     |
| `REST` has `setToken()` and no way to read back whether a token is set; `#token` is private with no getter                                                                                                                                                                                                                                                                                                                                                                          | `rest/src/REST.ts`                                                        |
| `RESTOptions.fetch?: typeof globalThis.fetch` exists, documented "for testing or for routing through a proxy". `DefaultRESTOptions.fetch` captures `globalThis.fetch` **at module load**                                                                                                                                                                                                                                                                                            | `rest/src/RESTOptions.ts`                                                 |
| REST routes that exist today: `channels` (get, edit, delete, getMessages, getMessage, createMessage, editMessage, deleteMessage, bulkDeleteMessages, addReaction, triggerTyping); `guilds` (get, getMember, getMembers, editMember, removeMember, createBan, removeBan, getBan, getRoles, createRole, addMemberRole, removeMemberRole); `users` (getCurrent, get, editCurrent, createDM); `gateway` (get, getBot). **No interaction, webhook, invite, thread, pin or emoji routes** | `rest/src/routes/*.ts`                                                    |
| `Timers` (exported from `@vestra/gateway`) has `setTimeout`, `clearTimeout`, `now`, `random` — and no `setInterval`, no `unref`                                                                                                                                                                                                                                                                                                                                                     | `gateway/src/util/Timers.ts`                                              |
| `tsconfig.base.json` sets `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`                                                                                                                                                                                                                                                                                                                                                    | `tsconfig.base.json`                                                      |
| ESLint bans the `delete` **operator** globally via `no-restricted-syntax`; `Map.prototype.delete` is a `CallExpression` and unaffected. The `Object.assign` rule matches the literal call only                                                                                                                                                                                                                                                                                      | `eslint.config.js`                                                        |
| `max-lines` is configured as **warn**, not error                                                                                                                                                                                                                                                                                                                                                                                                                                    | `eslint.config.js`                                                        |
| `@typescript-eslint/consistent-type-imports` is on with `fixStyle: 'separate-type-imports'`, so `import type` erases entirely                                                                                                                                                                                                                                                                                                                                                       | `eslint.config.js`                                                        |
| **`packages/core/test` is absent from the root solution `tsconfig.json`.** `packages/{types,rest,gateway}/test` are all present                                                                                                                                                                                                                                                                                                                                                     | root `tsconfig.json`                                                      |
| Tests run under `node --experimental-strip-types`, so types erase at test time. Every type-level assertion is checked by `tsc --build` and never by the runner                                                                                                                                                                                                                                                                                                                      | root `package.json`                                                       |
| The repo's compile-time-guard idiom is `type X = … extends never ? true : false` with `const x: X = true` inside a `node:test` case                                                                                                                                                                                                                                                                                                                                                 | `types/test/gateway.test.ts`                                              |
| `packages/gateway/test/mock-transport.ts` exists (162 lines) and its cross-package imports are all `import type`                                                                                                                                                                                                                                                                                                                                                                    | that file                                                                 |
| `ManualTimers` is defined **inside** `packages/gateway/test/fleet.test.ts` and is not exported from a module                                                                                                                                                                                                                                                                                                                                                                        | that file                                                                 |
| `README.md` line 50 commits to `await message.channel.createMessage({ content: 'pong' })` with no optional chaining                                                                                                                                                                                                                                                                                                                                                                 | `README.md`                                                               |

### 0.2 Verified by compiling, TypeScript 6.0.3, `tsconfig.base.json` inherited verbatim

| Claim                                                                                                                                             | Result                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registry[name]` where `name: Event extends GatewayDispatchEvents` resolves to `EventHandler<Event> \| undefined`                                 | Compiles, no cast; TS instantiates the mapped type's template                                                                                                                                                   |
| `handlerFor(handlers, payload.t)` then `handler?.handle(client, payload.d, shard)` against the **un-narrowed 76-member** `GatewayDispatchPayload` | Compiles; no "union too complex", no instantiation-depth error                                                                                                                                                  |
| Inline `handlers[payload.t]` (no generic helper) on a `satisfies`-typed registry                                                                  | **Fails**, `TS7053`. This is the entire reason `handlerFor` exists                                                                                                                                              |
| Mis-registering a handler under the wrong key when two events share a data type (`CHANNEL_CREATE: channelDelete`, both `APIChannel`)              | Caught — **only** when the handler carries a `name` field or is authored with a type annotation                                                                                                                 |
| The same mis-registration with a `satisfies`-at-definition handler and **no** `name` field                                                        | **Compiles silently.** `name` is load-bearing, not redundant with the registry key                                                                                                                              |
| `data.unavailable === true` narrowing `GatewayGuildCreateDispatchData`                                                                            | **Does not narrow** — `GatewayGuildCreateExtraFields` also declares `unavailable?: boolean`                                                                                                                     |
| `'name' in data` narrowing the same union                                                                                                         | Narrows to `APIGuild & GatewayGuildCreateExtraFields`                                                                                                                                                           |
| Type-level coverage assertion `[Exclude<Events, Handled \| Unhandled>] extends [never]`                                                           | Works, but the failure reads `Type 'true' is not assignable to type 'false'` and **names no event**                                                                                                             |
| A class field without `declare`                                                                                                                   | Emits a field declaration. `target: es2023` implies `useDefineForClassFields`, so `id: string` emits `id;` and every field is defined to `undefined` before the constructor. `declare id: string` emits nothing |
| `exactOptionalPropertyTypes` and optional structure fields                                                                                        | `field?: T` cannot be assigned `T \| undefined` — `TS2412`. Structure fields must be `field: T \| undefined`, never `field?: T`                                                                                 |
| `isComplete(): this is CompleteMessage` — an interface narrowing a class                                                                          | Compiles and narrows `content` from `string \| undefined` to `string`, no cast, under every strict flag this repo sets                                                                                          |
| Two star exports that collide                                                                                                                     | **TS2308, a compile error.** But an **explicit** re-export silently shadows a star export with no diagnostic at all (exit 0)                                                                                    |
| `import … from '@vestra/gateway/test/mock-transport.js'`                                                                                          | Unresolvable; `exports` has a single `"."` entry and `files` is `["dist"]`                                                                                                                                      |
| `references: [{ path: '../../gateway/test' }]`                                                                                                    | **TS6310** — a referenced project may not disable emit, and every test project sets `noEmit`                                                                                                                    |
| relative `'../../gateway/test/mock-transport.ts'` with `rootDir: "."`                                                                             | **TS6059** plus **TS6307**                                                                                                                                                                                      |
| the same import with `rootDir: "../.."` **and** the file added to `include`                                                                       | **Compiles, exit 0**                                                                                                                                                                                            |

### 0.3 Verified by probe, Node v25.8.1

The floor is **22.15.0** and none of these were re-run there. See §8-B1.

| Claim                                                                                           | Result                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A listener throw propagates **synchronously** out of `emitter.emit()`                           | Confirmed                                                                                                                                                                                                                                                                                                        |
| `emit('error', err)` with no `error` listener                                                   | Throws `err` itself, synchronously                                                                                                                                                                                                                                                                               |
| A throw escaping a `zlib` write callback                                                        | Becomes an `uncaughtException` — process death by default. Whether the inflate context also corrupts was not isolated                                                                                                                                                                                            |
| A generic `for (const k in d) this[camel(k)] = d[k]` transform produces dictionary-mode objects | **Refuted.** Instances stay in fast-properties mode and share a map _when the source key order is identical_. The folk justification for banning a generic transform is the wrong argument                                                                                                                       |
| A generic transform over _differently shaped_ payloads                                          | Divergent: a full `MESSAGE_CREATE` and a subset `MESSAGE_UPDATE` give `%HaveSameMap === false`, and two different subsets differ from each other. A fixed-order constructor gives `true` for all three, because absent fields are assigned `undefined` rather than skipped                                       |
| Conditional field assignment in a constructor                                                   | Produces divergent hidden classes. CONTRIBUTING's claim holds                                                                                                                                                                                                                                                    |
| Conditional assignment inside `patch()` **after** a full constructor                            | Safe. Writing an already-present property is a store to a known offset, not a map transition: same-map and fast-properties across one-field and three-field patches                                                                                                                                              |
| Cost of a generic transform, 17 fields, no nesting                                              | Committed as `scripts/bench/structure-construction.ts`. Hand-written 95ns; naive generic **~26x**; generic with a precomputed key map and zero string work **~5.6x**. The scratch bench's magnitude held at the low end and its _attribution_ did not: most of the 26x was string work, not keyed stores — §8-D1 |
| Holding the client in a `#client` private field behind a public prototype getter                | `JSON.stringify` returns `{"id":"1"}` and does not throw on a cyclic client; `Object.keys` and `util.inspect` omit it; instances stay same-map. A plain `this.client = client` makes `JSON.stringify` throw                                                                                                      |
| `Object.create(Proto)`-based cloning                                                            | **Broken twice over.** With `#client` it throws `TypeError` on the first `this.client` read, because private fields are installed only by the constructor. With a `defineProperty` client instead, the clone's map still differs from the constructor's even after assigning every field in constructor order    |
| `%HaveSameMap` without `--allow-natives-syntax`                                                 | `SyntaxError` at parse time — but a dynamic `import()` catches it, so a shape suite can skip itself without spawning a child process                                                                                                                                                                             |

### 0.4 What was not verified

Everything about how TypeScript 6.0.3 behaves on the `ClientEvents` map; everything about V8
on Node 22.15.0; every line-count estimate; every number this document invents; and every
claim about what Discord does on the wire that Phase 3's live runs did not already settle.
§8 enumerates each one. None is asserted as fact above.

---

## 1. Prerequisites: what blocks Phase 4 and what does not

### 1.1 Nothing in `@vestra/gateway` blocks Phase 4

`GuildReadyTracker` and `MemberChunker` are exported, documented, unit-tested and unreachable
from the gateway's own code paths (verified, §0.1). The tidier fix is to wire them inside
`Shard` and add `guildsReady: [unresolved: string[]]` to `ShardEvents` — and Phase 3 §4.9's own
reasoning, that the tracker "touches only ids and event names", implies that was the intent.

**Decision: `@vestra/core` owns and feeds both, from `ShardBridge` (§4.3).** Both constructors
take only a `send` callback, `Timers`, intents and event data, all of which core has. Making
Phase 4 depend on a Phase 3 amendment buys nothing core cannot do today, and a phase that
cannot start until another phase is edited is a phase that starts late.

Two costs, stated rather than hidden:

- A gateway-only consumer still has no signal that their guild stream settled. That is a gap
  in `@vestra/gateway` and it deserves an issue against Phase 3 (§9), not silent absorption
  into Phase 4.
- The op-8 30-second per-guild gate now lives in core. Phase 3 §8-A16 leaves it unresolved
  whether that limit is scoped per bot or per session; if it is per bot, the gate must be
  shareable across processes exactly like `IdentifyThrottler`, and core is the wrong side of
  the boundary to share it from. Recorded as §8-A6.

### 1.2 Non-blocking gateway and REST improvements worth issues

| #   | Change                                                                           | Why it matters                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `presence?: GatewayPresenceUpdateData` on `ShardOptions`, sent in `sendIdentify` | The type already exists in `@vestra/types`. Without it the only way to set a bot's status is an op 3 after READY, so every restart shows the bot online with no activity for one round trip. `ClientOptions.presence` (§4.1) **degrades to a post-READY op 3** until this lands, and its TSDoc must say so |
| 2   | `properties?: GatewayIdentifyProperties` on `ShardOptions`                       | Cosmetic; the hard-coded values are correct                                                                                                                                                                                                                                                                |
| 3   | `shardSpawn: [shard: Shard]` instead of `[shardId: number]`                      | Core otherwise does `manager.shards.get(id)` and satisfies `noUncheckedIndexedAccess` for a value the manager had in hand                                                                                                                                                                                  |
| 4   | `get token()` or `get authenticated()` on `REST`                                 | A `Client` handed a pre-built `REST` cannot tell whether it is authenticated; a missing token surfaces as a 401 on the first request rather than as a constructor error                                                                                                                                    |
| 5   | `unref` on the `Timers` seam                                                     | §4.13. The cache sweeper wants it and works without it                                                                                                                                                                                                                                                     |

### 1.3 The REST gap, and the interaction decision

These structure methods are specified nowhere below because they **cannot be implemented**
against `@vestra/rest` as it stands:

| Blocked                                                                 | Needs                                                                                                                                               |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Interaction` entirely — `reply`, `deferReply`, `editReply`, `followUp` | `POST /interactions/{id}/{token}/callback`; `GET`/`PATCH`/`DELETE /webhooks/{app_id}/{token}/messages/@original`; `POST /webhooks/{app_id}/{token}` |
| `Message#pin` / `#unpin`                                                | `PUT`/`DELETE /channels/{id}/pins/{message_id}`                                                                                                     |
| `Message#removeReaction`, `#clearReactions`                             | the `DELETE` reaction routes; only `addReaction` exists                                                                                             |
| `Message#startThread`                                                   | `POST /channels/{id}/messages/{id}/threads`                                                                                                         |
| `Role#edit` / `#delete`                                                 | `PATCH`/`DELETE /guilds/{id}/roles/{role_id}`                                                                                                       |
| `Guild#createChannel`                                                   | `POST /guilds/{id}/channels`                                                                                                                        |
| `Guild#leave`                                                           | `DELETE /users/@me/guilds/{id}`                                                                                                                     |

**`INTERACTION_CREATE` is therefore listed in `unhandled.ts` for Phase 4** and is reachable
only through `client.on('raw', …)`.

This is the largest scope decision in the document and it belongs to the phase owner, not to
this specification. An `Interaction` structure whose `reply()` throws at runtime is worse than
no `Interaction` structure; a 1.0 with no interaction support is arguably not a 1.0. The
recommendation is that Phase 4 grows a **bounded REST prerequisite** covering the interaction
callback route set — it is small and well specified — and that `interactionCreate` moves from
`unhandled.ts` to a handler in the same commit. Until that is signed off, the position above is
the honest one.

---

## 2. File layout

### 2.1 `packages/core/src/`

```
packages/core/src/
├── index.ts                              ~110  barrel; keeps the three pass-through star exports
├── Client.ts                             ~250  subsystem handles, login, destroy, the emit seam
├── ClientOptions.ts                      ~210  options, defaults, resolution, composition
├── ClientReadiness.ts                    ~120  per-shard settle tracking, the ready gate, whenReady
├── ClientPresence.ts                      ~90  op 3 fan-out, op 4 routed by guild
├── gateway/
│   ├── ShardBridge.ts                    ~190  one shard: listeners, tracker, chunker, teardown
│   └── PresencePayload.ts                 ~80  builds op 3 from a friendlier options shape
├── events/
│   ├── ClientEvents.ts                   ~230  the event map. Hand-written, types only
│   ├── ClientEventNames.ts                ~90  the mechanical rule + deviation table; test-only
│   ├── EventHandler.ts                    ~85  EventHandler, EventContext, DispatchShard
│   ├── registry.ts                       ~110  26 imports, 26 entries, handlerFor()
│   ├── unhandled.ts                       ~95  the 50 reasoned opt-outs
│   ├── EventRouter.ts                     ~95  raw emit, lookup, error containment
│   ├── DispatchQueue.ts                  ~150  opt-in serial mode, one per shard
│   └── handlers/                    (26 files) one per handled event, 15–110 each   ~1,150
├── cache/
│   ├── index.ts                           ~40  barrel
│   ├── CacheScopes.ts                     ~90  scope union, key derivation, group keys
│   ├── CachePolicy.ts                    ~150  option union, resolution, the default table
│   ├── CacheAdapter.ts                   ~120  the pluggable interface, scope context, codec
│   ├── MemoryCacheAdapter.ts             ~210  two Maps, write-order eviction, early-exit sweep
│   ├── NullCacheAdapter.ts                ~70  the disabled-scope no-op
│   ├── CacheStore.ts                     ~180  facade: filter, key derivation, index upkeep
│   ├── CacheIndex.ts                     ~120  group indexes, tolerant reads, lazy pruning
│   ├── CacheKeys.ts                       ~60  composite keys and the separator argument
│   ├── CacheRegistry.ts                  ~170  client.cache: one store per scope, clear, stats
│   ├── CacheSweeper.ts                    ~90  the single re-armed timer
│   └── CacheReconciler.ts                ~140  post-identify generation reconciliation
├── structures/
│   ├── index.ts                           ~40  barrel — consumers only, never handlers
│   ├── Base.ts                            ~80  #client, the client accessor, nothing else
│   ├── Changes.ts                         ~60  Changes<T> and the lazy accumulator
│   ├── User.ts                           ~150
│   ├── ClientUser.ts                     ~100  extends User; editCurrent, setPresence
│   ├── GuildMember.ts                    ~190
│   ├── Guild.ts                          ~300  at the limit — §2.3
│   ├── Role.ts                           ~130
│   ├── Message.ts                        ~300  at the limit — §2.3
│   ├── guild/
│   │   ├── permissions.ts                ~160  computed permissions; BigInt lives here
│   │   └── icons.ts                       ~70  CDN URL builders
│   ├── message/
│   │   └── links.ts                       ~60  jump links, message references
│   ├── channels/
│   │   ├── Channel.ts                    ~100  abstract; id, type, toString, predicates
│   │   ├── GuildChannel.ts               ~150  overwrites, parentId, position
│   │   ├── GuildTextBasedChannel.ts       ~80  BUILT, not in the original list — below
│   │   ├── ThreadOnlyChannel.ts           ~90  BUILT, not in the original list — below
│   │   ├── TextChannel.ts                ~180  createMessage, getMessages, typing
│   │   ├── AnnouncementChannel.ts         ~60
│   │   ├── VoiceChannel.ts               ~140
│   │   ├── StageChannel.ts                ~50
│   │   ├── CategoryChannel.ts             ~60
│   │   ├── ThreadChannel.ts              ~190
│   │   ├── ForumChannel.ts               ~150
│   │   ├── MediaChannel.ts                ~60
│   │   ├── DMChannel.ts                  ~110
│   │   ├── GroupDMChannel.ts              ~80
│   │   └── createChannel.ts               ~90  the only ChannelType switch

Two abstract classes were added that this list did not have, both mirroring a shared base
`@vestra/types` already declares. `GuildTextBasedChannel` holds the four message fields that
text, announcement, voice, stage and thread channels all carry — written once rather than five
times, which is also what stops the five drifting. `ThreadOnlyChannel` holds what forum and
media channels share, and is deliberately **not** a text-based channel: it has
`last_message_id`, `topic` and `rate_limit_per_user` like one and all three mean something
else, so inheriting the text base would have named them wrongly and made `isTextBased()` true
of a channel that cannot receive a message.

`TextBased` is an interface, not a class. The set of message-carrying channels cuts across the
hierarchy — a DM carries messages and has no guild — so `Channel.isTextBased()` narrows to
`this & TextBased` rather than to a class nothing could sensibly extend twice.

The REST methods this list puts on `TextChannel` (`createMessage`, `getMessages`, typing) are
**not built**. They need a structure to reach `client.rest`, and `Base` is generic over the
client precisely so structures do not import it — the same unresolved tension recorded for
`Guild#roles` and `CategoryChannel#children`. The data structures ship without them; §8-E is
where that gets settled.
│   └── util/
│       ├── snowflake.ts                   ~60  snowflakeTimestamp(id)
│       └── emoji.ts                       ~50  emojiIdentifier(emoji)
├── permissions/
│   └── PermissionsBitField.ts            ~140
└── errors/
    ├── CoreError.ts                       ~40  base class
    ├── ClientError.ts                     ~60  invalid options, use-after-destroy, login failures
    └── EventHandlerError.ts               ~45
```

**~83 files, ~8,000 lines** — roughly twice `@vestra/gateway` (33 files, 3,828 lines).

**Calibrate these numbers down, not up.** Phase 3's §2 tree listed 26 files; the package
shipped 33, because `Shard.ts` alone became five files. Its largest estimate (`Shard.ts` ~300)
landed at 445 — 48% over — and `CloseCodes.ts` came in at 220 against ~120. The numbers above
are the size at which a split conversation is due, not a prediction. Expect `Guild.ts`,
`Message.ts`, `CacheReconciler.ts` and `Client.ts` to be the four that overshoot, and expect
`Client.ts` to want a `ClientLifecycle.ts` split out of it the moment `destroy()` grows a
second recovery mode.

### 2.2 `packages/core/test/`

```
packages/core/test/
├── tsconfig.json               rootDir "../..", widened include; add to the ROOT solution too
├── harness.ts            ~150  a Client wired to mock transport + manual timers + recording fetch
├── fixtures.ts           ~200  minimal-but-valid API payloads, each with an overrides parameter
├── partials.ts            ~70  deliberately incomplete payloads; the only place a cast is allowed
├── fake-rest.ts           ~80  recordingFetch: canned Responses plus a request log
├── recording-cache.ts     ~90  a CacheAdapter that counts every call
├── adapter-conformance.ts ~180 the exported suite third-party adapters run
├── shape-helper.ts        ~80  the %HaveSameMap calls, behind a dynamic import
├── cache.test.ts         ~300
├── structures.test.ts    ~300
├── shape.test.ts         ~120
├── naming.test.ts        ~150
├── events.test.ts        ~260
├── event-coverage.test.ts ~110
├── replay.test.ts        ~180
├── lifecycle.test.ts     ~220
├── client-options.test.ts ~160
└── wiring.test.ts        ~200
```

`packages/core/test/tsconfig.json` **must be added to the root solution `tsconfig.json`**.
ADR 5's consequences section warns about exactly this — "forgetting the former means it is
silently never typechecked" — and because core's tests are where the type-level guards live
(§7), forgetting it means the guards never run at all, in a way no test failure would reveal.
This is a repository gap today, not a Phase 4 choice.

### 2.3 Judgement calls in the layout, and what was rejected

**No `managers/` directory, and no manager layer on the client.** discord.js pairs every cached
type with a manager class. Under ADR 4 a manager is a second name for a cache store, and every
accessor on it repeats the same `T | undefined` honesty the store already enforces.
`client.cache.guilds.get(id)` is one concept; `client.guilds.cache.get(id)` is two objects for
it. Rejected at the client level too: `client.channels.send(id, …)` would be a hand-copied twin
of every `rest.*` method whose only differences are that it returns a structure and has to
decide whether to cache what it returned — a second list maintained in parallel, of exactly the
kind this design refuses everywhere else, and `routes/channels.ts` already records the repo's
preference for a readable hand-written surface over a derived one.

The trade-off is real and should be stated rather than sold: **the consumer learns two
vocabularies.** `client.rest.channels.createMessage(id, { body })` returns `APIMessage`;
`channel.send(…)` returns `Message`. Keeping them visibly different is deliberate — it is what
stops "I fetched it through REST, why is my cache stale". If a manager layer is ever added, the
constraint is: additive, and generated from the route classes rather than transcribed.

**No shared `patch.ts` helper.** An earlier layout put one in `util/`. Rejected for the same
reason a generic snake-to-camel transform is rejected (§4.15): a shared helper writing
`this[key] = value` is a keyed store that cannot be inline-cached to an offset. Measured at
**~5.6x** a hand-written constructor with every trace of string work removed — less than the
26x a naive transform costs, and still not recoverable. Each structure's `patch` is
hand-written to the same fixed-order rule.
`Changes.ts` holds only the `Changes<T>` type and the lazy accumulator, which are data.

**No `UncachedError`.** An earlier layout had one, "thrown only by explicitly-asserting
helpers". There are no explicitly-asserting helpers: ADR 4 says cache-backed accessors return
`T | undefined` and never lie by asserting, and §7 **CU2** enumerates every accessor
reflectively and asserts none throws on a miss. Shipping an asserting variant now would create
the exact thing that test exists to forbid.

**Core does not define its own `Timers`.** It imports `type Timers` from `@vestra/gateway`,
which is a legal direction and already re-exported from core's barrel. Rejected a core-local
copy: structural typing means both work, but two identically shaped interfaces with different
names in one public API is a documentation problem forever. Cost: `cache/CacheSweeper.ts`
imports a clock from the gateway package, which reads oddly. Still better than the alternative.

**Cache keys are flat strings.** `members` is keyed `guildId:userId`, `roles` likewise.
Rejected the nested `Map<guildId, Map<id, T>>` shape because `max` and `ttl` are per-store
budgets in ADR 4's option shape, and a nested map makes "at most 1000 members total" require
walking every guild to evict one entry. It also makes a Redis or SQLite adapter — the thing
ADR 4 exists to enable — a one-key-one-row mapping instead of a serialisation problem. Cost:
`guild.members` is an index scan, documented as such, and "at most 200 members per guild" is
inexpressible (§8-A11).

**Handlers import concrete structure files, never `structures/index.ts`.** A handler importing
the barrel drags every structure into the module graph in an order the barrel decides, which is
how discord.js acquired its circular-import lore. Worth a `no-restricted-imports` lint rule
rather than a comment, in the spirit of ADR 5.

**The barrel must not name a symbol the lower packages already export.** Verified: two
colliding star exports are TS2308, but an explicit re-export silently shadows a star export
with no diagnostic. `Timers`, `SystemTimers`, `Shard`, `REST` and friends are all already
public through core. §7 **PK3** guards this by identity, not by name.

**The module cycle is already solved by tooling the repo has.** `Client` imports `Message`;
`Message` needs `Client` for its type. Because `verbatimModuleSyntax` is on and
`consistent-type-imports` is configured with `separate-type-imports`,
`import type { Client } from '../Client.js'` erases entirely and creates no runtime edge. The
cross-cutting rule: **a file may `import type` anything in `@vestra/core`, and may runtime-
`import` only files strictly below it.** `TextChannel.ts` runtime-imports `Message.ts` because
`createMessage()` constructs one; `Message.ts` type-imports `TextChannel` and never at runtime.

### 2.4 The spine — who owns what

Phase 3's equivalent table is why its reconnect bugs are structurally impossible. The same
discipline, one layer up:

| Owned by `Client` (process lifetime)                | Owned by `ShardBridge` (one per shard)      | Owned by the `CacheAdapter`                    |
| --------------------------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| `REST`, `ShardManager`, `CacheRegistry`, the router | the shard's listener set and its removal    | every entry, its expiry stamp, its write order |
| resolved `ClientOptions`, intents, `CacheSweeper`   | its `GuildReadyTracker` and `MemberChunker` | nothing that must survive a `destroy()`        |
| `client.user`, `readyAt`, the ready gate            | its `DispatchQueue`, when serial mode is on |                                                |
| the user-facing `EventEmitter` and its `emit` seam  | nothing that must survive a reconnect       |                                                |

**Structures hold the client, never a cache entry.** A `Message` that captured its `Guild`
would keep an evicted guild alive and silently defeat the `max` policy — the single most likely
way ADR 4's memory promise gets broken in practice, and the reason `Base.ts` exposes `client`
and nothing else.

---

## 3. Cross-cutting rules every file obeys

- **No top-level `await`** (ADR 2, `tests/cjs-interop.test.ts`). In particular the cache
  sweeper's timer is armed in `login()`, never at module scope.
- **No `enum`** (`erasableSyntaxOnly`). `CacheScope` and every other closed set is an `as const`
  object plus a derived union.
- **No runtime dependencies.** `node:events`, timers through the injected seam, and the
  `@vestra/*` packages. Nothing else.
- **`exactOptionalPropertyTypes` forbids optional structure fields.** Verified: `field?: T`
  cannot be assigned `T | undefined` (TS2412). Every mirrored field is declared
  `field: T | undefined`. This agrees with the hot-path rule rather than fighting it — it is
  what guarantees every instance carries every property, which is what gives one hidden class.
- **`declare` on every structure field.** Verified as load-bearing, not cosmetic: without it
  TypeScript emits a field declaration that defines the property to `undefined` before the
  constructor assigns it, so every field is paid for twice. Nothing in the repo uses `declare`
  yet; Phase 4 is the first place it appears, so it wants a line in CONTRIBUTING's example
  rather than only in prose.
- **Fixed field order.** Declaration order and assignment order identical, in every constructor
  that can produce the same class. A reviewer can diff the two lists by eye; §7 **SH1** tests
  the consequence rather than the rule.
- **Never `delete`.** Assign `undefined`. Lint-enforced for the operator;
  `Map.prototype.delete` is unaffected and is what `MemoryCacheAdapter` relies on.
- **Snowflakes stay `string`.** The only `BigInt` in `@vestra/core` is in
  `structures/util/snowflake.ts` and `structures/guild/permissions.ts`, both reached lazily on
  access. A `BigInt` conversion inside a constructor is a bug.
- **Absent, `null` and unchanged are three different things.** ADR 3's convention makes this
  expressible and structures must not collapse it: `edited_timestamp: null` means never edited;
  `edited_timestamp` absent from a `MESSAGE_UPDATE` means unchanged, do not touch it. `patch`
  discriminates with `!== undefined`, which is correct because `null !== undefined`. Collapsing
  null into undefined is the subtle bug §4.16 exists to prevent.
- **TSDoc on every exported symbol**, and every invented number's TSDoc says it is invented.
- **No floating promises.** Lint-enforced, and it is the reason `EventHandler.handle` returns
  `void` (§4.5).

---

## 4. Per-file specification

### 4.1 `ClientOptions.ts`

```ts
/** Gateway configuration, minus what the client owns. */
export type ClientGatewayOptions = Omit<
  ShardManagerOptions,
  'token' | 'intents' | 'userAgent' | 'timers' | 'fetchGatewayBot'
> & {
  /**
   * Overrides how gateway connection information is fetched.
   *
   * @remarks
   * Defaults to `client.rest.gateway.getBot()`. Override it to serve `/gateway/bot` from a
   * cache shared across processes, or to drive a client in tests with no REST layer.
   */
  fetchGatewayBot?: GatewayBotFetcher
}

/** Configuration for a {@link Client}. */
export interface ClientOptions {
  /** The bot token, without a scheme prefix. */
  token: string
  /** The intents to identify with: a bit set, or the bits to combine. */
  intents: number | readonly GatewayIntentBits[]
  /** The `User-Agent` presented on both REST and gateway traffic. */
  userAgent?: string
  /** The presence to identify with. Degrades to a post-READY op 3 — see 1.2 item 1. */
  presence?: GatewayPresenceUpdateData
  /** Cache policy, adapter and sweep cadence. See 4.9. */
  cache?: CacheOptions
  /** REST configuration, or an already-configured client to share. */
  rest?: RESTOptions | REST
  /** Gateway configuration, passed through untouched. */
  gateway?: ClientGatewayOptions
  /** Timer and randomness sources, used by the gateway and by cache sweeps alike. */
  timers?: Timers
  /** Delivers dispatches to listeners one at a time, per shard. See 4.8. */
  serialDispatch?: boolean | { maxQueued?: number }
  /**
   * How long {@link Client.login} may wait for the first shard to reach READY.
   *
   * @remarks
   * `null` waits indefinitely. Library policy, not protocol.
   */
  loginTimeout?: number | null
}
```

**Which options are hoisted, hidden or passed through.**

| Class                               | Options                                                                                                                                                                                                                                                                                                                                          | Rule                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hoisted** (top level, fanned out) | `token`, `intents`, `userAgent`, `timers`                                                                                                                                                                                                                                                                                                        | Each is needed by more than one subsystem. `token` feeds `rest.setToken()` and `ShardOptions.token`. `userAgent` exists identically on `RESTOptions` and `ShardOptions`, so leaving it nested means a user who sets it once has set it for half their traffic — a silent, untestable half-fix. `timers` is needed by the gateway _and_ by the cache sweeper, and a test that mocks time must mock it once         |
| **Hidden** (client-owned)           | `fetchGatewayBot` (defaulted, overridable), `gatewayUrl`, `shardId`, `shardCount` per shard                                                                                                                                                                                                                                                      | `fetchGatewayBot` is the one wire the Client exists to solder: `() => this.rest.gateway.getBot()`. The other three are already `Omit`ted by `ShardManagerOptions`                                                                                                                                                                                                                                                 |
| **Passed through untouched**        | every remaining `ShardManagerOptions` field: `shardCount`, `shardIds`, `throttler`, `sessionStore`, `sessionStartHeadroom`, `compression`, `compressionLimits`, `largeThreshold`, `capabilities`, `handshakeTimeout`, `maxResumeAttempts`, `backoff`, `heartbeat`, `sendQueue`, `backpressure`, `encoding`, `transport`, `dispatcher`, `version` | ADR 1's pluggability rule is only real if the plugs reach the top-level API. `throttler` and `sessionStore` in particular are what make a multi-process deployment correct, and a Client that hid them would be a Client nobody could scale out with                                                                                                                                                              |
| **Left nested deliberately**        | `version` on both; `dispatcher` (gateway) vs `fetch` (REST)                                                                                                                                                                                                                                                                                      | REST and gateway versions are genuinely independent, and hoisting one `version` would imply a coupling that does not exist. A mismatch is almost always a mistake, so `Client` compares the two after resolution and emits `debug`. `dispatcher` and `fetch` solve the same proxying problem by different mechanisms; unifying them would mean inventing an abstraction over two things neither package abstracts |

**Rejected: flattening the gateway and REST options onto `ClientOptions`.** It reads better in a
one-shard example and is wrong everywhere else. There are roughly twenty gateway knobs and
eleven REST knobs, of which `userAgent` and `version` collide outright and `timeout` (REST,
per-attempt) would sit next to `handshakeTimeout` (gateway) with no way to tell them apart.
Worse, it makes every future gateway option a change to core's public types. Because
`ClientGatewayOptions` is `Omit`-derived, a new gateway option appears on the client
automatically, with no edit and no chance of drift.

**Rejected: `new Client(token, options)`.** Token-in-options keeps configuration a single
serialisable object, which is what a process reading its config from the environment or a file
actually wants. `REST.setToken()` stays separate because a `REST` may legitimately outlive or
precede a `Client`.

**`intents` accepting an array** is folded with `|` during resolution. It costs one `reduce` at
startup and removes the most common beginner error in the ecosystem, which is writing `,` where
`|` was meant and silently getting intent 1.

**`exactOptionalPropertyTypes` shapes the implementation.** `resolveClientOptions` cannot spread
`options.gateway` and then assign possibly-`undefined` fields — under this flag,
`{ shardCount: undefined }` is not assignable to `{ shardCount?: number }`. Every optional
pass-through is a conditional spread:

```ts
...(options.gateway?.shardCount !== undefined && { shardCount: options.gateway.shardCount }),
```

This is tedious, and it is also why the option surface is `Omit`-derived rather than
re-declared: a re-declared field would have to repeat the exact optionality, and getting it
wrong produces a type error at the composition site rather than at the declaration, which is a
bad place to read the mistake. §7 **O8** asserts the runtime consequence.

**Sharing a `REST`.** `rest` accepts either options or an instance. When `Client` constructs it,
`Client` calls `setToken(token)`. When given an instance, `Client` does **not** call `setToken`
— it is the caller's client and may be authorised as a Bearer for a different purpose — and it
cannot verify the instance is authenticated, because `REST` exposes no way to ask (§1.2 item
4). Until that lands the documented rule is: _if you pass a `REST`, you set its token._

**Testability is public API here, and it is the only argument for it.** `ClientOptions` must
expose a REST seam (`rest`) and a gateway seam carrying at minimum `transport` and
`fetchGatewayBot` through to `ShardManagerOptions`. If the client hides either, core's entire
test suite needs a live token, and there is no suite. That is a weak reason to shape a public
API and it is recorded as such (§8-C15).

---

### 4.2 `Client.ts` — surface and lifecycle

```ts
export class Client extends EventEmitter<ClientEvents> {
  constructor(options: ClientOptions)

  /** Raw REST access. Returns API objects; never touches the cache. */
  readonly rest: REST
  /** The shard fleet. */
  readonly gateway: ShardManager
  /** The cache, per ADR 4. */
  readonly cache: CacheRegistry
  /** The resolved options in use. */
  readonly options: Readonly<ResolvedClientOptions>

  /** The shards this process owns. */
  get shards(): ReadonlyMap<number, Shard>
  /** The bot's own user, once READY has arrived. */
  get user(): ClientUser | undefined
  /** When `ready` fired, or `undefined`. */
  get readyAt(): number | undefined
  /** Whether `ready` has fired. */
  get isReady(): boolean
  /** Mean heartbeat latency across ready shards, or `-1`. */
  get ping(): number

  /** Connects the fleet. Resolves when the first owned shard reaches READY. */
  login(): Promise<void>
  /** Resolves when `ready` has fired, immediately if it already has. */
  whenReady(options?: { signal?: AbortSignal }): Promise<ClientUser>
  /** Stops the client. Terminal. */
  destroy(options?: { resumable?: boolean }): Promise<void>
}
```

**`login()` resolves on the first shard's READY, or rejects on the first fatal error.**

This needs justifying, because the obvious alternative is what a naive reading of the gateway
package produces. Verified: `ShardManager.connect()` resolves when every owned shard has had
`connect()` _called_, and `Shard.connect()` returns after a socket is opened and a handshake
timer armed. Nothing has been authenticated at that point. If `login()` simply awaited
`manager.connect()`, then **`await client.login()` would succeed with an invalid token**, and
the failure would arrive later as an `error` event. The word "login" promises authentication;
resolving on "socket opened" is a lie the API would tell on its very first call.

So `login()`:

1. **Arm the readiness promise first**, before anything opens a socket. `ShardManager.connect()`
   emits `shardSpawn` synchronously and then `await shard.connect()` opens the socket **inside
   the same await**, so a fast shard can reach READY before `manager.connect()` resolves. A
   `login()` that awaited the connect and only then attached its READY listener would miss the
   event it is waiting for and hang until `loginTimeout` — forever, on the default. The listener
   is attached from the `shardSpawn` handler, which is registered before `connect()` is called,
   and resolution is recorded on a promise that `login()` awaits afterwards.
2. `await manager.connect()` — this performs preflight (`GET /gateway/bot`), enforces the
   session-start budget (throwing `SessionLimitError`, which propagates out of `login()`
   unchanged), and spawns shards.
3. Arm the cache sweeper, if any scope has a TTL (§4.13).
4. Await the promise from step 1: the first owned shard emitting `ready`, any shard emitting a
   fleet-fatal `FatalGatewayError` (one carrying a close code — see the branch above), or
   `loginTimeout` elapsing.
5. On fatal: reject with that error, after the fleet teardown below has run.
6. On timeout: reject with a `ClientError`, and **do not** tear the fleet down. The shards are
   still trying, and Phase 3 §4.9 established that there is no protocol-sanctioned reason to
   close a socket that is still ACKing heartbeats.

READY is the handshake response, not the guild stream, so step 4 costs one round trip in the
healthy case. `ready` (the event, §4.4) remains the separate, later thing.

`loginTimeout` defaults to **`null` — wait forever**. This is policy, chosen to match
`RESTOptions.rateLimitTimeout`, whose recorded reasoning is that this is right for a bot that
should be slow rather than lossy. Following an existing recorded decision beats inventing a
second number with a different shape. The consequence must be documented: with the default, a
bot pointed at a gateway that opens sockets and never sends Hello hangs in `login()` rather than
crashing. `handshakeTimeout` (gateway, 30 s) covers socket-open to Hello and surfaces an
`error`, so the hang is at least noisy.

**Rejected: `login()` resolving when every shard is ready.** For a 200-shard bot with
`max_concurrency: 16`, that is at least 65 seconds of identify pacing before the promise
resolves, plus the guild stream. `whenReady()` exists for people who want that, and it takes a
signal.

**Rejected: naming it `connect()`.** It mirrors `ShardManager.connect()`, which is exactly the
problem — the two would resolve at different points under the same name.

**`destroy()` is terminal.**

- `resumable: false` (default) — `manager.destroy(false)`, each shard closes with **1000**,
  sessions forgotten, the bot appears offline promptly.
- `resumable: true` — close with **4000**, sessions persisted to the `sessionStore`. Only useful
  for a fast restart: Phase 3 §8-A1 measured the resumable window at 90–120 seconds against a
  live token, so a restart slower than that will identify anyway.
- Detaches every `ShardBridge` and the client's own manager listeners. It does **not** call
  `removeAllListeners()` on itself — that would drop the user's `error` handler mid-teardown,
  which is exactly when they need it.
- Rejects every pending `whenReady()` with a `ClientError`, and rejects pending member-chunk
  requests through each bridge's `MemberChunker.reset()`.
- Clears the sweeper timer and clears the cache.
- Idempotent; a second call resolves immediately. Any method needing a live fleet throws
  `ClientError` afterwards.

**Rejected: a restartable client.** `ShardManager.connect()` would in fact work again. But the
bridges would be stale and, more seriously, the cache would have survived a period of unknown
length with no event stream feeding it. A cache that is silently arbitrarily stale is worse than
no cache and contradicts ADR 4's promise that structures never lie. Restarting is
`new Client({ …, gateway: { sessionStore } })`; sharing the store is what makes that cheap.

**A `FatalGatewayError` carrying a close code is fatal for the client. One without a code is
not.** `Shard` transitions to `Fatal` and emits `error(FatalGatewayError)`; `ShardManager`
re-emits it as `error(err, shardId)`. The distinction matters because the error has three
sources in `Shard`, not one, and only the first is fleet-wide:

| Source                                                            | `code` | Fleet-wide? |
| ----------------------------------------------------------------- | ------ | ----------- |
| An unrecoverable close code (`Shard.ts` `#onClose`)               | set    | yes         |
| Backoff exhaustion, "gave up reconnecting" (`#scheduleReconnect`) | absent | **no**      |
| `connect()` called on an already-`Fatal` shard                    | absent | no          |

Every close code that produces `Fatal` — 4004, 4010, 4011, 4012, 4013, 4014 — is a
_configuration_ fault, and configuration is fleet-wide by construction: a token that is wrong on
shard 7 is wrong on all of them. Backoff exhaustion is the opposite: one shard losing its
network for long enough to spend `maxAttempts` says nothing about the other nineteen, and tearing
the client down for it converts a transient fault on one connection into a total outage. Branch
on `error.code === undefined` and treat the codeless form as a shard-level failure that emits
`error(err, shardId)` and leaves the fleet running.

Note that `DefaultBackoffOptions.maxAttempts` is `null`, so backoff exhaustion cannot occur on
the default configuration — this only bites a consumer who sets a finite cap, which is exactly
the consumer least expecting a whole-client shutdown. Client emits `error(err, shardId)` first so the cause is visible, then
runs `destroy({ resumable: false })`, then emits `invalidated`. It does not call `process.exit`;
a library that exits the host process is a library nobody can embed. Keeping nineteen doomed
shards alive after the twentieth reported 4014 buys nothing and produces nineteen more identical
errors, each spending a session start — and Phase 3 §8-A13 leaves it unresolved whether a
_failed_ identify consumes the budget, so the conservative reading is that it does. The one soft
spot in the argument is 4010 during a rolling reshard, recorded as §8-A7.

**Node's `EventEmitter` throws on an unhandled `'error'`, and Vestra does not deviate.** A
consumer with no `error` listener gets an uncaught exception on the first transient gateway
hiccup. Deviating — by renaming the event, or attaching an internal no-op listener — would mean
a bot silently swallowing every gateway error it ever hits, which is worse. It must appear in
the README's first example, not only in TSDoc.

**`client.rest` is the only REST entry point on the client**, with `rest.channels`,
`rest.guilds`, `rest.users` and `rest.gateway` exactly as `@vestra/rest` ships them.
`RESTEvents` (`rateLimited`, `response`) are **not** forwarded: `client.rest.on(…)` is one
property away, re-emitting would double the surface and invent two names, and `rateLimited` on a
`Client` would be read as a REST rate limit by everyone — which is precisely the collision
§4.4's deviation table has to work around for the gateway's own `RATE_LIMITED`.

---

### 4.3 `gateway/ShardBridge.ts`

One per shard, constructed from the `shardSpawn` listener before `shard.connect()` is called,
destroyed on `destroy()`. It owns everything that must not survive a reconnect.

```ts
export class ShardBridge {
  constructor(client: Client, shard: Shard, options: ResolvedClientOptions)
  /** The narrowed view handlers receive. */
  readonly view: DispatchShard
  /** Rejects pending chunk requests and detaches every listener. */
  destroy(reason: Error): void
}
```

On each `dispatch` it runs exactly three things, in this order:

1. **Session companions.** `GUILD_CREATE` / `GUILD_DELETE` to `GuildReadyTracker.resolve(id)`;
   `GUILD_MEMBERS_CHUNK` to `MemberChunker.handleChunk`; `RATE_LIMITED` to
   `MemberChunker.handleRateLimited`.
2. `routeDispatch(...)`, or `queue.push(...)` in serial mode.
3. Nothing else.

These are deliberately **not** handlers. They are gateway-session mechanics with no cache effect
and no client event; they must run before any consumer sees the dispatch; and — decisively —
they must keep working if the corresponding event is ever moved to `unhandled.ts`. Putting
`chunker.handleChunk` inside a handler makes the opt-out list capable of breaking
`guild.members.fetch()`. Keeping them out is also what lets every one of the 26 handler files be
honestly described as "cache, then emit, and nothing else".

The bridge also translates shard events into client events: `ready` to `shardReady` (seeding
`client.user` and the tracker from the READY payload), `resumed` to `shardResumed`, `closed` to
`shardDisconnect`, and the tracker's completion callback to `shardGuildsReady`. It exposes
`guildsPending` on `view` so a handler can tell an initial-stream `GUILD_CREATE` from a join
(§4.6).

**`GuildReadyTracker` is constructed per connection, not re-seeded.** The tracker is
**one-shot**: `#complete()` sets a `#done` flag that is never cleared, and `resolve()` returns
early once it is set. Calling `seed()` again on a completed instance therefore does nothing at
all — the pending set fills and never drains, and no completion signal ever fires again.

So on a fresh identify `ShardBridge` **discards the tracker and constructs a new one** from the
READY payload's `guilds`; on a resume it is left alone, because the guild stream does not
restart. An earlier draft of this section said "re-seeded", which would have silently produced a
client whose `ready` never fired after the first reconnect. `enabled` is `false` when `(intents & Guilds) === 0`, which the
tracker already encodes — without that intent `GUILD_CREATE` never arrives and the pending set
could never drain.

**`MemberChunker.reset(error)` is called on every fresh identify**, so a member request
outstanding across a reconnect rejects rather than hanging forever. §7 **W4**.

---

### 4.4 Event names and `ClientEvents.ts`

Discord sends `MESSAGE_CREATE`; Vestra emits `messageCreate`. **Client event names are the
camelCase of the wire name, with a short declared deviation table, and `ClientEvents` is
hand-written.**

The map is one interface. Lifecycle events first, then one row per handled dispatch event:

```ts
export interface ClientEvents {
  /** Every owned shard has reached READY and settled its guild stream. Fires once. */
  ready: [user: ClientUser]
  /** A shard completed its handshake. */
  shardReady: [shardId: number, data: GatewayReadyDispatchData]
  /** A shard replayed its missed events and is live again. */
  shardResumed: [shardId: number]
  /** A shard's socket closed. `willReconnect` is false only for a terminal failure. */
  shardDisconnect: [shardId: number, code: number, reason: string, willReconnect: boolean]
  /** A shard's guild stream settled. `unresolved` names guilds that never arrived. */
  shardGuildsReady: [shardId: number, unresolved: readonly string[]]
  /** The fleet failed terminally and has been torn down. */
  invalidated: []
  /** Something went wrong. Attach a listener: Node throws on an unhandled `error`. */
  error: [error: Error, shardId?: number]
  /** Lifecycle diagnostics. Never per-dispatch. */
  debug: [message: string]
  /** Every dispatch, before any handler runs. The only place `replayed` is surfaced. */
  raw: [payload: GatewayDispatchPayload, shardId: number, replayed: boolean]
  /** A payload was discarded because the serial dispatch queue overflowed. */
  dispatchDropped: [payload: GatewayDispatchPayload, depth: number]

  messageCreate: [message: Message]
  messageUpdate: [message: Message, changes: Changes<Message> | null]
  guildCreate: [guild: Guild]
  guildAvailable: [guild: Guild]
  guildUnavailable: [guildId: Snowflake, shardId: number]
  // …one row per handled event
}
```

**Rejected: deriving the map from `GatewayDispatchEvents` with `Uncapitalize` and a key-remapped
inversion.** This was the more elegant proposal and it lost on four counts, three of which its
own author flagged as unmeasured. (a) It cannot express a split — `GUILD_CREATE` produces
`guildCreate` _or_ `guildAvailable` depending on the payload and the stream state, and
`GUILD_DELETE` likewise — so the derivation is partial from the first interesting event onward.
(b) The compile-time cost of `Uncapitalize` over 76 union members plus an inversion, evaluated
at every `client.on` call site, is unmeasured. (c) Diagnostic quality when a listener signature
is wrong (`client.on('messageCreate', (m: string) => …)`) comes from a mapped type over ~85 keys
and was never checked for readability. (d) Whether Node's
`EventEmitter<T extends Record<keyof T, any[]>>` accepts an intersection of a hand-written
interface and a mapped type was never compiled. Four unknowns to avoid a hand-written list is a
bad trade for a public API.

**The mechanical rule survives as a guard, not as a mechanism.** `ClientEventNames.ts` exports
the camelCase function and the deviation table and is imported **only by
`packages/core/test/naming.test.ts`**. The test asserts that every emitted client event name is
the mechanical camelCase of its wire name unless it appears in the deviation table with a
reason, and that the full sorted list of emitted names matches a literal array checked into the
test file. That buys the derivation's drift-safety — a PascalCase key rename in `@vestra/types`
shows up as a reviewable diff in a file whose whole purpose is to be reviewed — with none of its
type-level unknowns.

**The deviation table.**

| Wire name      | Client surface                          | Why                                                                                                                                                                                                                                                                                           |
| -------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `READY`        | `shardReady`                            | `ready` is the aggregate event every bot listens for. If `READY` derived to `ready`, a 20-shard bot would fire `client.on('ready')` twenty times, and the code inside — register commands, start a scheduler — would run twenty times. The single most damaging name collision available here |
| `RESUMED`      | `shardResumed`                          | Same reason, and it pairs with `shardReady`                                                                                                                                                                                                                                                   |
| `GUILD_CREATE` | `guildCreate` **or** `guildAvailable`   | A guild arriving during the initial stream, or returning from an outage, is not a join. §4.6                                                                                                                                                                                                  |
| `GUILD_DELETE` | `guildDelete` **or** `guildUnavailable` | The outage-versus-kicked distinction, which is why Phase 3 §1 item 6 split `GatewayGuildCreateDispatchData` in the first place                                                                                                                                                                |
| `RATE_LIMITED` | not emitted                             | Consumed by `MemberChunker` in `ShardBridge`; the correlated caller receives a rejection. A client event would surface a failure the caller already has                                                                                                                                       |

**Unhandled events emit nothing.** All 50 events in `unhandled.ts` reach consumers through
`client.on('raw', …)` and nowhere else.

**Rejected: emitting raw payload data under a derived name for every unhandled event**, so that
all 76 events exist on day one and a handler is an upgrade rather than the moment an event
begins existing. It is attractive, and it was rejected because of what it does after 1.0:
`entitlementCreate` would deliver `APIEntitlement` today and `Entitlement` once a handler lands,
which is a major-version change for an event nobody asked for. Emitting nothing makes adding a
handler purely additive. The cost, stated: `client.on('entitlementCreate', …)` is a type error
until someone writes the handler, and the answer today is `client.on('raw')` plus
`payload.t === 'ENTITLEMENT_CREATE'`, which narrows exactly, because `GatewayDispatchPayload` is
a discriminated union.

**Four handled events emit a raw payload rather than a structure**, because §4.17's cut ships no
structure for them: `presenceUpdate`, `voiceStateUpdate`, `typingStart` and `channelPinsUpdate`.
They are handled because they do cache work. They are enumerated here, in one table, and in
`docs/events.md`, so the "which events give me camelCase" question has a written answer rather
than a runtime one — and so that the set which could break on a future structure upgrade is four
events, not forty-seven.

**Rejected: trailing `(shardId, replayed)` arguments on every dispatch-derived event.** The
argument for it is real: `replayed` cannot be reconstructed by a consumer, and `shardId` is
unrecoverable for a DM event. It loses to a structural incompatibility rather than to taste.
Handlers own their own `emit` calls — that is what lets `GUILD_CREATE` produce two different
events — and handlers are deliberately **not** told whether a dispatch was replayed (§5),
because that restriction is what makes "handlers are pure functions of (cache, data)"
unforgeable rather than a convention that erodes the first time somebody has a plausible reason.
You cannot have both. The resolution keeps the stronger invariant and surfaces both values on
`raw`, which fires for every dispatch; `shardId` for guild events is also reachable as
`client.gateway.shardIdForGuild(id)`.

The loss is genuine and must be documented: **a `messageCreate` listener for a DM cannot tell
which shard delivered it without also listening to `raw`.**

**Rejected: naming the raw event `dispatch`.** It matches the shard's own event name, which is
an argument both for and against — the client's version carries an extra `shardId` and fires
after `ShardBridge`'s companions have run, so the same name would describe two subtly different
things. `raw` is also what the ecosystem has taught people to look for.

**`debug` is restricted to lifecycle granularity and is never emitted per dispatch.** String
construction is guarded by `listenerCount('debug')`. Whether per-dispatch debug is ever added is
open (§8-A13); any claim about its cost needs a `scripts/bench/` entry, not an assertion.

---

### 4.5 `events/EventHandler.ts`

```ts
/**
 * The surface a dispatch handler is allowed to touch.
 *
 * @remarks
 * Narrower than `Client` on purpose. A handler that reaches for the shard manager, the socket
 * or `destroy()` is a design error, and this makes it a compile error instead of a review
 * comment. `Client` satisfies it structurally, so nothing is allocated to build it.
 */
export interface EventContext {
  readonly cache: CacheRegistry
  readonly rest: REST
  readonly options: ResolvedClientOptions
  /** The current user. `undefined` until the first READY. */
  user: ClientUser | undefined
  emit<Event extends keyof ClientEvents>(event: Event, ...args: ClientEvents[Event]): boolean
  listenerCount(event: keyof ClientEvents): number
}

/** The shard a dispatch arrived on, as much of it as a handler may see. */
export interface DispatchShard {
  readonly id: number
  readonly state: ShardState
  /** Whether the initial guild stream for this connection is still draining. */
  readonly guildsPending: boolean
}

/**
 * One gateway event, handled.
 *
 * @typeParam Event - The dispatch event name. Fixes the type of `data`.
 */
export interface EventHandler<Event extends GatewayDispatchEvents> {
  /**
   * The event name.
   *
   * @remarks
   * Redundant with the registry key, and kept anyway. Verified: without it, a handler authored
   * as `{ … } satisfies EventHandler<'CHANNEL_DELETE'>` registers cleanly under
   * `CHANNEL_CREATE`, because both carry `APIChannel` and the check is purely structural.
   */
  readonly name: Event
  /**
   * Applies the event to the cache and emits the client event.
   *
   * @remarks
   * Synchronous, and returns nothing. This runs inside the socket read path — see 4.8 for why
   * an `await` here is a reconnect loop rather than a slow bot.
   *
   * A property rather than a method so `strictFunctionTypes` applies to its parameters.
   */
  readonly handle: (
    client: EventContext,
    data: GatewayDispatchData<Event>,
    shard: DispatchShard,
  ) => void
}
```

The parameter is named `client` so CONTRIBUTING.md's published three-argument example stays
literally correct while the type stays narrow. **No fourth `replayed` parameter** — see §5.

`DispatchShard` is a view, not `Shard`, for the same reason `EventContext` is a view: a handler
must not be able to `send()` on the connection. It is **not** structurally satisfied by `Shard`
— `guildsPending` does not exist there — so `ShardBridge` supplies it. One allocation per shard
per connection; nothing allocated per dispatch.

`EventContext.cache` is the whole `CacheRegistry`, not a single store. An earlier draft named
this member `CacheStore`, which collides with the per-scope facade in §4.12; the registry is the
thing `client.cache.messages.add(…)` reads from.

Rules every handler file obeys, and the failure each one exists for:

- **Cache first, emit second.** A listener's first act is a lookup; emitting first shows it a
  cache that does not yet contain the entity the event is about.
- **Delete handlers read before they delete.** `const channel = cache.channels.get(data.id)`,
  then delete, then `emit('channelDelete', channel)`. Otherwise the listener gets an id and
  nothing else, permanently — the object is gone and no REST route returns a deleted channel.
- **Update handlers emit `(current, changes)` and `changes` may be `null`.** ADR 4 forbids
  fabricating a previous object; §4.16 explains why a full `old` cannot be produced at all.
- **Absolute writes only. Never read-modify-increment.** §5.
- **Annotate the handler, do not `satisfies` it.** `const x: EventHandler<'E'> = {…}` — verified
  as the form the compiler checks by type argument rather than structurally.
- **No `await`, no promise returned, no floating promise.** `handle` returns `void`, and
  `no-floating-promises` is already an error here, so a handler that starts a REST call and
  forgets it does not compile.
- **File name is the camelCase of the wire name**, and the exported const matches the file name.

**Rejected: an `emitOnly(name, clientEvent, wrap)` factory** for the handlers that only construct
and emit. It would cut those files to three lines each. It also produces two shapes of handler
file, and "one file per event, one uniform shape" is the property that makes the directory
reviewable at a glance.

---

### 4.6 `events/registry.ts` and `events/unhandled.ts`

```ts
/**
 * A handler per dispatch event, correlated by key.
 *
 * @remarks
 * A mapped type, not `Record<GatewayDispatchEvents, EventHandler<GatewayDispatchEvents>>`. The
 * `Record` form loses the correlation: every handler's `data` widens to a 76-member union and
 * `MESSAGE_CREATE` stops meaning `GatewayMessageCreateDispatchData`.
 */
export type HandlerRegistry = {
  readonly [Event in GatewayDispatchEvents]?: EventHandler<Event>
}

/** Every handled dispatch event. One line per event; the file it points at holds the logic. */
export const handlers = {
  CHANNEL_CREATE: channelCreate,
  MESSAGE_CREATE: messageCreate,
  // …
} satisfies HandlerRegistry

/** Every event this build handles. Derived, never written out by hand. */
export type HandledDispatchEvents = keyof typeof handlers

/**
 * Looks up the handler for one event.
 *
 * @remarks
 * This exists because `satisfies` keeps the literal type, and a literal type cannot be indexed
 * by an arbitrary event name — verified: `TS7053`. Widening to `HandlerRegistry` at this
 * parameter is what makes the router compile, and the generic is what stops it widening `data`
 * to a union at the same time.
 */
export function handlerFor<Event extends GatewayDispatchEvents>(
  registry: HandlerRegistry,
  name: Event,
): EventHandler<Event> | undefined {
  return registry[name]
}
```

`satisfies` rather than a `: HandlerRegistry` annotation, deliberately: the annotation makes
every property optional, so `keyof typeof handlers` collapses to all 76 names, which destroys
the coverage test's ability to tell handled from unhandled.

**Why the union call type-checks, and where it is unsound.** At the dispatch site `payload.t` is
the full 76-member union, so `Event` infers as that union and `handle` accepts
`GatewayDispatchData<Event>`. That conditional type is distributive over a naked type parameter,
so it expands to the union of all 76 data types — exactly what `payload.d` is on the un-narrowed
payload. The two unions match and the call compiles (verified). What the compiler does **not**
verify is that the handler found under key `t` is being handed the `d` from the _same_ payload.
It always is, because both come from the same expression, but that is an invariant of five lines
of code rather than a type-system guarantee. Those five lines are the only place in
`@vestra/core` where this holds, and the runtime `handlers[k].name === k` assertion (§7 **EC4**)
is what keeps the other half honest. **No `as` cast is required anywhere** — that was an open
question and compiling settled it.

**Rejected: a `switch (payload.t)` in the router.** It narrows perfectly with no correlation gap
and needs no `handlerFor`. It is rejected because CLAUDE.md's contract is "one file plus one
registry line", and a switch makes it "one file plus a case plus an import plus a `break`" in a
file that grows to 400 lines. It also invites `default: assertNever(payload.t)`, which is
actively dangerous — §8-A2.

**The 26 handled events.** `READY`, `RESUMED`, `GUILD_CREATE`, `GUILD_UPDATE`, `GUILD_DELETE`,
`CHANNEL_CREATE`, `CHANNEL_UPDATE`, `CHANNEL_DELETE`, `CHANNEL_PINS_UPDATE`, `THREAD_CREATE`,
`THREAD_UPDATE`, `THREAD_DELETE`, `MESSAGE_CREATE`, `MESSAGE_UPDATE`, `MESSAGE_DELETE`,
`MESSAGE_DELETE_BULK`, `GUILD_MEMBER_ADD`, `GUILD_MEMBER_UPDATE`, `GUILD_MEMBER_REMOVE`,
`GUILD_ROLE_CREATE`, `GUILD_ROLE_UPDATE`, `GUILD_ROLE_DELETE`, `USER_UPDATE`, `PRESENCE_UPDATE`,
`VOICE_STATE_UPDATE`, `TYPING_START`. The other **50** are in `unhandled.ts`. Nothing decides
which events are "core" except judgement; this set is the one that touches the cache or the
client's own identity, and it is policy (§8-C4).

```ts
/**
 * Dispatch events `@vestra/core` deliberately does not handle, and why.
 *
 * @remarks
 * An entry here is a decision on the record. The event still reaches consumers through the
 * client's `raw` event, so listing one costs convenience, never capability.
 */
export const unhandledDispatchEvents = {
  GUILD_MEMBERS_CHUNK:
    'Correlated by MemberChunker in ShardBridge, which resolves the caller of ' +
    'guild.members.fetch(). A second client-level event would deliver the same chunks twice.',
  RATE_LIMITED:
    'Consumed by MemberChunker, which rejects the correlated request. A client event would ' +
    'surface a failure the caller already received as a rejection.',
  INTERACTION_CREATE:
    '@vestra/rest has no interaction callback routes, so an Interaction structure could not ' +
    'implement reply(). See 1.3 — this is a scope decision, not a permanent cut.',
  // …47 more
} as const satisfies Partial<Record<GatewayDispatchEvents, string>>
```

**Every entry carries a reason string**, enforced only by that type and by review (§8-C5).

**One handler worth specifying in full**, because it carries two traps that were verified rather
than assumed:

```ts
export const guildCreate: EventHandler<'GUILD_CREATE'> = {
  name: 'GUILD_CREATE',
  handle(client, data, shard) {
    // Verified: `data.unavailable === true` does NOT narrow this union — the available branch
    // declares `unavailable?: boolean` too. `'name' in data` does.
    if (!('name' in data)) {
      client.emit('guildUnavailable', data.id, shard.id)
      return
    }

    const existing = client.cache.guilds.get(data.id)
    const guild = client.cache.guilds.add(new Guild(data, client))

    // A guild arriving during the initial stream, or returning from an outage, is not a join.
    // Emitting `guildCreate` for all 2,500 guilds on every restart is the single most common
    // source of duplicated join-side effects in Discord bots.
    if (shard.guildsPending || existing !== undefined) client.emit('guildAvailable', guild)
    else client.emit('guildCreate', guild)
  },
}
```

---

### 4.7 `events/EventRouter.ts`

Verified: a listener throw propagates synchronously out of `emit()`, and a throw escaping a
`zlib` write callback becomes an `uncaughtException`. The unwinding path here is `handle` to
`shard.emit('dispatch')` to `Shard.#onDispatch` to the compression hook to the inflate write
callback. **A user's typo in a `messageCreate` listener kills the process** unless the router
stops it. Containment is load-bearing, not politeness.

```ts
export function routeDispatch(
  client: EventContext,
  payload: GatewayDispatchPayload,
  shard: DispatchShard,
  replayed: boolean,
): void {
  // Raw first: a consumer relying on it sees the payload in wire order even when the handler
  // below throws, and events listed in unhandled.ts are reachable here.
  client.emit('raw', payload, shard.id, replayed)

  const handler = handlerFor(handlers, payload.t)
  if (handler === undefined) return

  try {
    handler.handle(client, payload.d, shard)
  } catch (cause) {
    reportHandlerError(client, payload.t, cause)
  }
}
```

One `try` covers a handler bug, a user listener bug **and** a throwing cache `filter`, because
all three run inside `handle`. That resolves an open question the cache facet deliberately left
to this one: `filter` is user code on the dispatch path and it is guarded here, uniformly, rather
than by an inconsistent local `try` that would hide a bug in one place and not two lines away.

`reportHandlerError` must never throw synchronously, and the no-listener case is the trap —
verified: `emit('error', err)` with no `error` listener throws `err` itself, straight back into
the path we are protecting.

```ts
function reportHandlerError(client: EventContext, event: string, cause: unknown): void {
  const error = new EventHandlerError(event, cause)
  if (client.listenerCount('error') === 0) {
    // Surface it as an uncaughtException with a stack, on a clean tick, rather than unwinding
    // into the socket read path. Loud is correct here; silent is not.
    setImmediate(() => {
      throw error
    })
    return
  }
  try {
    client.emit('error', error)
  } catch (secondary) {
    setImmediate(() => {
      throw secondary
    })
  }
}
```

Known cost, stated rather than hidden: a throw from a _user's_ listener is reported as an
`EventHandlerError` naming the gateway event, which reads as though Vestra's handler failed.
Distinguishing them means splitting the emit out of the handler, which costs the uniform handler
shape. §8-A4.

**`payload.t` may at runtime be a string outside the closed 76-member union**, because Discord
ships new events without warning and the gateway hands them straight through. The router must
therefore never `assertNever` on it; a throwing `default` turns a new Discord event into a crash
on every occurrence, which is a crash loop. §7 **EV3** asserts it.

---

### 4.8 Ordering, and `events/DispatchQueue.ts`

The shard does not await listener return values, and `ShardEvents`' TSDoc explains why: doing so
puts every user handler on the critical path between the socket and the heartbeat, so one slow
handler becomes a zombie reconnect. Core inherits that constraint exactly. Three ordering
questions fall out of it with three different answers.

**1. Handler execution order — guaranteed, no machinery.** `routeDispatch` is called
synchronously from the shard's `dispatch` listener, which is called synchronously from the frame
decode path, and handlers are synchronous by contract. Handler _N_ completes before handler
_N+1_ begins, in gateway sequence order. This costs nothing and is the main reason `handle`
returns `void`.

**2. A handler that needs to await something — not allowed, and the alternatives are real.**

- _"I need an entity the cache does not have."_ Emit `T | undefined` and let the consumer fetch.
  That is ADR 4's documented consequence, not a workaround.
- _"I want to fetch it eagerly anyway."_ A consumer decision, in a consumer's `async` listener,
  on the consumer's error budget. Core does not make it on their behalf and does not put it
  between the socket and the heartbeat.
- _"The cache adapter is async."_ It is not — §4.10 settles that, and it is what makes this
  whole section possible.

**3. User listener completion order — not guaranteed by default; opt-in serial mode.**
`client.emit('messageCreate', m)` returns as soon as every listener has been _entered_. An
`async` listener that awaits yields, and the next dispatch is routed before it finishes. Core
publishes exactly the guarantee the gateway publishes, in the same words, and offers the same
opt-in escape.

```ts
export class DispatchQueue {
  constructor(client: EventContext, options: { maxQueued: number })
  push(payload: GatewayDispatchPayload, shard: DispatchShard, replayed: boolean): void
  /** Drops everything queued. Returns how many were discarded. */
  clear(reason: 'identify' | 'destroy'): number
  readonly depth: number
}
```

- **One queue per shard, never one globally.** Sequence ordering is only defined within a
  session; a global queue would serialise 40 shards behind one consumer's slow listener and turn
  an unrelated shard's heartbeat into collateral damage.
- **Serial mode changes `emit`, not `handle`.** The Client's `emit` invokes each listener from
  `rawListeners(name)` in registration order and awaits each in turn; the queue awaits that
  before dequeuing the next payload. Sync listeners are unaffected. This is a requirement on
  `Client`, which is why §2.4 lists "the emit seam" as something the Client owns.
- **Cleared on identify, kept on resume.** A backlog belonging to a dead session carries
  sequence numbers that no longer mean anything. A resumed session's backlog is still in order
  and still wanted.
- **Overflow: drop the newest, emit `dispatchDropped(payload, shardId, depth)`.** Built with a
  `shardId` the original two-argument form did not have: there is one queue per shard, so an
  event that cannot say which one is backed up cannot be acted on — the consumer's answer is
  either to speed up a listener on that shard or to raise `maxQueued`, and both need the id.
  `raw` already carries it for the same reason. Rejected _drop-oldest_,
  which silently reorders causality — a `MESSAGE_DELETE` surviving while its `MESSAGE_CREATE` is
  discarded is worse than a contiguous gap. Rejected _close the shard and resume_, symmetric
  though it looks with the gateway's back-pressure handling: the replay lands in the same queue
  behind the same slow listener, converting a backlog into a reconnect loop.
- **Off by default**, and when it is off no queue object is constructed and `ShardBridge` calls
  `routeDispatch` directly. ~~The serial path costs a microtask per dispatch even with no async
  listeners~~ — **wrong, and measured.** The batch a dispatch's listeners return is empty when
  none of them is `async`, the `await` is skipped, and the drain runs to completion inside
  `push`. `scripts/bench/dispatch-queue.ts` puts the real cost at about **65ns per dispatch**
  over the direct path with a synchronous listener and about **300ns** with an `async` one, on
  Node 25, taking the best of five passes. The benchmark also found the queue's first implementation to be quadratic in backlog
  depth — `Array.prototype.shift` at 40µs per dispatch on a 50,000-deep queue — which a moving
  head index fixed, and showed `Promise.allSettled` costing 2.5× a bare `await` for the
  overwhelmingly common single-listener case.
- `maxQueued` defaults to **1024 payloads per shard**. No basis; sized so a several-second
  listener stall does not drop anything on a busy shard. §8-C6.

---

### 4.9 `cache/CacheScopes.ts` and `cache/CachePolicy.ts`

ADR 4 settled the shape: a `CacheAdapter` interface, per-type policies of `{ max, ttl, filter }`,
a default in-memory adapter that caches guilds, channels and the current user, and structures
that return `T | undefined` rather than asserting. Everything here is design _inside_ that
decision. Where it goes beyond ADR 4 — roles cached by default, threads as their own scope, the
current user as a field — it is called out and needs sign-off rather than being smuggled in.

A scope is one cached entity type. `as const` object plus derived union, per `erasableSyntaxOnly`.

```ts
export const CacheScope = {
  Guilds: 'guilds',
  Channels: 'channels',
  Threads: 'threads',
  Roles: 'roles',
  Members: 'members',
  Users: 'users',
  Messages: 'messages',
  Presences: 'presences',
  VoiceStates: 'voiceStates',
  Emojis: 'emojis',
  Stickers: 'stickers',
} as const
export type CacheScope = (typeof CacheScope)[keyof typeof CacheScope]
```

| Scope         | Key              | Group key         | Default       | Why                                                         |
| ------------- | ---------------- | ----------------- | ------------- | ----------------------------------------------------------- |
| `guilds`      | guild id         | —                 | on, unbounded | ADR 4. Bounded by reality: at most 2,500 per shard          |
| `channels`    | channel id       | guild id          | on, unbounded | ADR 4. Guild channels and DM channels only, **not** threads |
| `roles`       | role id          | guild id          | on, unbounded | **Deviation from ADR 4 — needs sign-off.** Below            |
| `threads`     | channel id       | parent channel id | **off**       | Split out because the bound is bad. Below                   |
| `members`     | `guildId:userId` | guild id          | off           | The scope ADR 4 exists to keep off                          |
| `users`       | user id          | —                 | off           |                                                             |
| `messages`    | message id       | channel id        | off           |                                                             |
| `presences`   | `guildId:userId` | guild id          | off           | One entry per (user, guild), not per user                   |
| `voiceStates` | `guildId:userId` | guild id          | off           |                                                             |
| `emojis`      | emoji id         | guild id          | **on**        | **Deviation from this table as written — below**            |
| `stickers`    | sticker id       | guild id          | off           | Arrives inside the guild payload; dropped unless enabled    |

**Emojis default on — a second deviation, on the same argument.** This table originally had
them off. They were switched on when the scope was implemented, because the case is the roles
case with the nouns changed: a guild's emoji set is small and hard-bounded by Discord, it
arrives free inside a `GUILD_CREATE` the bot already receives, and posting a guild's own emoji
needs the ID — so caching it costs nothing that was not already paid for, and not caching it
means a REST call to learn something the gateway already said. Stickers stayed off, and the
asymmetry is deliberate rather than an oversight: a sticker is a far rarer thing for a bot to
send and its payload is several times larger. This wants the same sign-off as the roles
deviation below; if it goes the other way, one line in `DefaultCacheOptions` changes.

**Roles default on — the deviation.** ADR 4 lists three defaults; this adds a fourth. Permission
computation is the single most common thing a bot does, and it is impossible offline without
roles. Roles are bounded (250 per guild, a hard Discord limit) and arrive inside the guild
payload anyway, so the marginal cost over a guild is bounded arithmetic rather than open-ended
growth. **Measured** by `scripts/bench/cache-memory.ts`: **374 B per role** in a grouped store,
so 2,500 guilds x 40 roles is **35.7 MB** — the estimate of ~200 B and "roughly 20 MB" was
1.8x low, and a floor at that, since the fixture's role names are short and none carries an
`icon`, a `unicode_emoji` or `tags`. The conclusion survives the correction: 36 MB is bounded
and modest, and the alternative is a bot that cannot compute permissions offline. The alternative, considered
and rejected, was nesting `Map<Snowflake, Role>` inside the cached guild record: literally
ADR-4-compliant, since roles ride along with a thing ADR 4 already caches, but it makes roles
invisible to a third-party adapter, unserialisable by the codec, and exempt from policy and
sweeping — a special case in every mechanism below. Uniformity won. If sign-off goes the other
way, the nested form is the fallback and only `CacheScopes.ts`, `CacheStore.ts` and `Guild`
change. §8-A9.

**Threads split out, default off.** Verified from `GatewayGuildCreateExtraFields`:
`threads: APIThreadChannel[]` is "threads the current user can see", which for a bot with view
permission is every active thread in the guild — up to 1,000 per guild. Folding threads into
`channels` would make an "unbounded but bounded in practice" default quietly unbounded. The
honest cost of `threads: false` is that `message.channel` returns `undefined` for a thread
message; that is exactly the class of ergonomic loss ADR 4 says must be documented rather than
papered over. The alternative — fold into `channels` with a default TTL — trades a hard limit
for an invented number and is listed at §8-A10.

**The current user is not a scope.** It is `client.user`, a plain field, assigned from `READY`
and updated from `USER_UPDATE`. ADR 4 lists it among what the default adapter caches; a field
satisfies that more strongly than a scope would, because a scope could be switched off and the
client needs its own id to compute permissions and to recognise its own messages. Rejected: a
pinned entry in `users`, since `users: false` would then evict the one entry that must never go.
§8-A12 asks whether this is an acceptable reading of ADR 4.

```ts
export interface CachePolicy<V> {
  /** Maximum entries in this scope. Omit for unbounded. */
  max?: number
  /** Milliseconds an entry survives its last write. Omit for no expiry. */
  ttl?: number
  /** Evaluated on every write; a value that fails is not stored. */
  filter?: (value: V, key: string) => boolean
}

/** `false` disables the scope. `true` enables it with no limits. */
export type CacheOption<V> = boolean | CachePolicy<V>

export type CacheOptions = { [S in CacheScope]?: CacheOption<CacheValue<S>> } & {
  /** Swaps the storage implementation. See 4.10. */
  adapter?: CacheAdapterFactory
  /** How often the TTL sweeper runs, or `null` to drive it yourself. */
  sweepInterval?: number | null
}
```

`CacheValue<S>` is a mapped type binding each scope name to its structure, so `filter` in
`messages: { filter: (m) => … }` narrows `m` to `Message` with no annotation. That mapping is one
`interface CacheValueMap` and one line per scope, and it carries a compile-time exhaustiveness
guard of the kind `@vestra/types` already uses on `GatewayDispatchEventMap` — a scope with no
value binding is a compile error, not a silent `unknown` (§7 **CP5**).

Rejected: a numeric shorthand (`messages: 50` meaning `{ max: 50 }`). Two spellings of one thing
double the resolution logic and the documentation for four saved characters.

Resolution produces a total record — every scope present, nothing `undefined`:

```ts
export interface ResolvedCachePolicy<V> {
  enabled: boolean
  max: number // Infinity when unbounded
  ttl: number // 0 when no expiry
  filter: ((value: V, key: string) => boolean) | undefined
}
export function resolveCacheOptions(options?: CacheOptions): ResolvedCacheOptions
```

Rules, all Vestra policy:

- `false` gives `enabled: false`. `true` gives `{ max: Infinity, ttl: 0 }`.
- `{ max: 0 }` resolves to `enabled: false` — two spellings must not produce two behaviours.
- A negative or non-integer `max`, or a negative `ttl`, **throws at construction**. A cache
  misconfiguration that silently degrades to "caches nothing" is a support ticket six months
  later.
- A disabled scope is a `NullCacheAdapter`, **never** `undefined`. Handlers never write
  `if (client.cache.members)`. One branch removed from every handler is worth one virtual call
  that does nothing.

`DefaultCacheOptions` is the table above, and each entry's TSDoc says whether the number is
protocol-derived (none are) or Vestra policy (all are).

---

### 4.10 `cache/CacheAdapter.ts` — and the sync decision

**There are two interfaces, not one, and the split is what makes the rest tractable.**

|                   | `CacheAdapter<V>`                                         | `CacheStore<V>`                                   |
| ----------------- | --------------------------------------------------------- | ------------------------------------------------- |
| Who implements it | third parties (Redis, SQLite, a different eviction order) | `@vestra/core`, once                              |
| What it knows     | keys, values, `max`, `expiresAt`                          | scopes, key derivation, `filter`, indexes, codecs |
| Surface           | 10 members                                                | the handler- and structure-facing API             |
| Stability         | a published contract                                      | free to change                                    |

Handlers and structures never touch a `CacheAdapter`. They touch `client.cache.messages`, which
is a `CacheStore` wrapping whichever adapter the user configured. This is what keeps the
third-party surface at ten methods while `guild.channels` still works, and it is why `filter` is
enforced above the adapter — a third-party adapter should not be able to get filtering subtly
wrong.

An earlier layout put an adapter above many stores (`MemoryCacheAdapter` building one
`MemoryStore` per name). Rejected: it makes the pluggable unit the whole cache rather than one
scope, so a user who wants Redis for `members` and memory for everything else has to implement
both. One adapter instance **per scope**, built by a factory, is the shape that composes.

**Decision: every `CacheAdapter` method is synchronous. No method returns a promise.**

The case for async is real and single-purpose: it is the only way an adapter can serve a read
from a network store, which is the only way the cache can stop being process memory. It was
rejected for four reasons, in descending order of weight:

1. **It makes dispatch handling asynchronous, and the gateway does not await listeners.**
   `ShardEvents` documents this verbatim. If a handler must `await client.cache.guilds.get(id)`
   before it can construct a structure, two dispatches for the same guild can interleave their
   read-modify-write cycles, and `GUILD_MEMBER_ADD` followed by `GUILD_MEMBER_REMOVE` can land in
   either order. Sync writes preserve dispatch order for free; async writes need an ordered
   per-key queue in core to get it back, and that queue is unbounded memory under load.
2. **`no-floating-promises` is lint-enforced here.** An async `set` inside a synchronous handler
   is literally a lint error. Every cache write would have to be awaited, making every handler
   async, which returns to point 1.
3. **It poisons every accessor.** `message.guild` becomes `Promise<Guild | undefined>`. So do
   `guild.channels.get(id)`, `member.roles`, `channel.parent`. ADR 4's ergonomics argument —
   "`message.member.roles` has to resolve against _something_" — does not survive being a
   promise; a promise is exactly what "resolve against something" was trying to avoid.
4. **`SessionStore` sets the precedent for the other shape** (`Promise<T> | T`) and shows why it
   is wrong here. That union works because `SessionStore` is touched a handful of times per
   connection. On a path that runs several times per dispatch, `T | Promise<T>` forces every
   caller to `await` anyway _and_ destroys narrowing.

**What this costs, stated plainly.** A purely remote cache is not expressible through
`CacheAdapter`. A Redis-backed adapter can be a _write-behind mirror_ — synchronous reads from a
local `Map`, writes queued out for cross-process sharing and warm restarts — but not a
_memory-offloading_ cache, because `guild.channels.get(id)` cannot go to the network. ADR 4's
consequence, "a Redis or SQLite adapter is a third-party package implementing one interface", is
satisfied in the first sense and not the second. That gap is the price of this decision.

The escape hatch, which recovers most of the value without poisoning anything:

```ts
/** Optional: an asynchronous backing store, consulted only by `fetch*` methods. */
export interface AsyncCacheSource<V> {
  load: (key: string) => Promise<V | undefined>
  store?: (key: string, value: V, expiresAt: number) => Promise<void>
}
```

An adapter may also implement `AsyncCacheSource`. `client.cache.channels.fetch(id)` then
consults, in order: the sync adapter, the async source, then REST. Property accessors never touch
it. This is the documented path for "I want a 4 GB member cache in Redis": `members: false`
locally, an async source that serves `guild.members.fetch(id)`, and the honest understanding that
`message.member` stays `undefined` in the sync path.

```ts
export interface CacheScopeContext<V> {
  readonly scope: CacheScope
  /** Maximum entries. `Infinity` when unbounded. */
  readonly max: number
  /** Serialisation for adapters that leave the process. Never called by the default. */
  readonly codec: CacheCodec<V>
  /** Optional eager notification that an entry was dropped. See CacheIndex. */
  readonly onEvict?: (key: string, value: V) => void
}

export type CacheAdapterFactory = <V>(context: CacheScopeContext<V>) => CacheAdapter<V>

export interface CacheAdapter<V> {
  get: (key: string) => V | undefined
  /** `expiresAt` is an absolute epoch millisecond, or `Infinity` for no expiry. */
  set: (key: string, value: V, expiresAt: number) => void
  delete: (key: string) => boolean
  has: (key: string) => boolean
  clear: () => void
  readonly size: number
  keys: () => IterableIterator<string>
  values: () => IterableIterator<V>
  entries: () => IterableIterator<[key: string, value: V]>
  /** Drops expired entries. Returns how many. */
  sweep: (now: number) => number
}
```

The division of labour is load-bearing, because it is what a third-party implementer has to get
right:

| Concern        | Enforced by                                | Why there                                                                                                  |
| -------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `filter`       | `CacheStore`                               | User code must run in exactly one place; an adapter that forgets it silently over-caches                   |
| key derivation | `CacheStore`                               | Scope-specific; adapters see opaque strings                                                                |
| `expiresAt`    | `CacheStore` computes, the adapter honours | The adapter never reads a clock for policy, and a Redis adapter can hand the value straight to `PEXPIREAT` |
| `max`          | the adapter                                | Only the adapter knows its own ordering                                                                    |
| indexes        | `CacheStore` / `CacheIndex`                | Must survive adapters that evict without telling anyone                                                    |

So a third-party adapter's obligations are three sentences: honour `max`, never return an entry
past its `expiresAt`, and drop expired entries when `sweep` is called. `codec` exists so an
out-of-process adapter has something to call; the default never calls it. `onEvict` is optional —
the index is correct without it and merely faster with it.

`size` is documented as the raw entry count, which **may include entries that have expired but
not yet been swept**. Making it exact costs an O(n) walk on a property. `has` and `get` must
agree, and both check expiry.

---

### 4.11 `cache/MemoryCacheAdapter.ts` and `cache/NullCacheAdapter.ts`

Two maps, not one map of records:

```ts
#values = new Map<string, V>()
#expiry: Map<string, number> | undefined   // constructed only when the scope has a TTL
```

Rejected: a single `Map<string, { value, expiresAt }>`. Tidier, and it allocates a wrapper object
per entry on the **default** configuration, where no scope has a TTL and the wrapper is pure
overhead. The two-map form makes the default path one hash lookup and zero allocations, at the
cost of two lookups on TTL'd scopes and an invariant (`#expiry.size === #values.size`) that has
to be tested rather than made impossible. That invariant is contained in one class where every
mutation touches both maps in the same method, so it is a property test (§7 **CE7**), not an
architectural risk.

The allocation argument behind this choice is **measured**: `scripts/bench/cache-memory.ts`
puts a wrapper-record map at **156.5 B per entry** against **116.7 B** for the two-map form
with no TTL configured — **34% more**, paid on the default configuration where the wrapper's
second field is always `undefined` (§8-D3).

**Eviction order is write-recency: insertion order, refreshed on write, never on read.**

- `Map` iteration is insertion order, so `#values.keys().next().value` is the oldest write — O(1)
  eviction with no side list.
- Re-`set`ting an existing key does **not** move it in a JS `Map`, so `set` does
  `this.#values.delete(key)` before `this.#values.set(key, value)`, unconditionally. Without
  that, a hot entry rewritten on every message still ages out on its original insertion, which is
  the opposite of what a bounded cache should do. `Map.prototype.delete` is fine here —
  CONTRIBUTING's "never `delete`" rule is about `delete obj.prop` deoptimising object shape, and
  it explicitly points at `Map` as the alternative.
- **Rejected: true LRU with read promotion.** This was the other facet's choice and it is
  perfectly defensible; ADR 4 specifies a maximum entry count and says nothing about order. It
  loses because it puts a delete-and-reinsert on the _read_ path, which is the hotter of the two,
  and because it makes iteration order change under a read — a nasty surprise for anything
  iterating while resolving. Write-recency approximates LRU well for exactly the scopes where it
  matters, because activity produces writes: a user who talks is re-`set` by every
  `MESSAGE_CREATE`. An adapter that wants real LRU is a third-party adapter; the interface does
  not care. §8-C7.
- Eviction runs **on write**, in a `while (this.#values.size > this.#max)` loop, so the bound is
  never exceeded even transiently and no timer is involved.

**The sweep is O(expiring), not O(n).** Because TTL is per _scope_ and not per _entry_, and
because `set` moves the key to the tail, insertion order is ascending `expiresAt`. The sweep
walks from the head and **stops at the first unexpired entry**. That invariant is a property of
this adapter, must be stated in its TSDoc, and must be asserted (§7 **CE8**), because it breaks
silently for any adapter offering per-entry TTLs.

Expiry is also checked lazily on `get`/`has`, and an expired entry found on read is deleted
there. With a 60 s sweep interval an entry could otherwise be served up to 60 s past its TTL,
which makes `ttl` a lie. Deleting during a read is one hash operation, and deleting from a `Map`
mid-iteration is defined behaviour — an unvisited deleted entry is simply not visited.

`keys()`, `values()` and `entries()` are generators that skip expired entries. Handing back a key
that `get` would refuse is worse than a per-item comparison.

**TTL is refreshed on write and not on read**, matching the eviction order. Undecided by ADR 4;
policy (§8-C8).

`NullCacheAdapter` returns `undefined`/`false`, does nothing on `set` and `clear`, reports size 0
and empty iterators, and sweeps 0. It is constructed once per disabled scope. Its whole reason to
exist is that no handler and no structure should ever branch on whether a scope is enabled.

**Measured, and the prediction was off by one.** This section used to guess that three adapter
implementations at the shared call site would stay polymorphic and "a fourth (a user's) may
cross V8's threshold". `scripts/bench/adapter-shapes.ts` puts the cliff between **two and
three**: one or two classes cost ~17ns per read through `CacheStore.get`, three or more cost
~40ns, and it is flat from there to eight. So the cost is not gradual and it is not at four —
it is a single step of **~2.2x**, paid the moment a third class exists.

Core ships two adapters, `MemoryCacheAdapter` and `NullCacheAdapter`, and a client with some
scopes disabled uses both. That puts the shipped configuration on the last fast step, and makes
a user's first custom adapter the one that crosses. **This does not reopen ADR 1's
pluggability decision** — 22ns on a cached read is nothing beside a ~140ns dispatch, and being
unable to plug in a Redis adapter would cost far more than that. It is worth saying plainly
rather than leaving as a guess (§8-D4).

---

### 4.12 `cache/CacheStore.ts`, `CacheKeys.ts`, `CacheIndex.ts`, `CacheRegistry.ts`

```ts
export class CacheStore<V> {
  get(key: string): V | undefined
  /** Derives the key from the value, applies the filter, updates indexes. Returns `value`. */
  add(value: V): V
  set(key: string, value: V): V
  delete(key: string): boolean
  has(key: string): boolean
  readonly size: number
  values(): IterableIterator<V>
  keys(): IterableIterator<string>
  /** Index-backed view: every cached member of a guild, every cached message in a channel. */
  group(groupKey: string): CacheGroupView<V>
  /** Sync adapter, then AsyncCacheSource, then REST. Always returns a promise. */
  fetch(key: string): Promise<V>
  clear(): void
  sweep(now: number): number
}
```

`add(value)` returns the value it was given, **whether or not it was stored**. This is not
sloppiness: CONTRIBUTING.md's canonical handler is

```ts
const message = client.cache.messages.add(new Message(data, client))
client.emit('messageCreate', message)
```

and that line has to keep working under `messages: false`, which is the _default_. A
`V | undefined` return would force every handler to hold the object separately from the cache
call. Returning the argument is what lets one handler shape serve both configurations.

`fetch` **always** returns a promise, even on a cache hit. Rejected: a `T | Promise<T>` return
that resolves synchronously when cached — it forces every caller to `await` anyway and destroys
narrowing, the same trap the sync-adapter decision turned down.

`filter` semantics, in `add`/`set`:

- Evaluated on **every** write, before the adapter sees the value.
- A write that fails the filter **deletes any existing entry** for that key. This is the rule
  most likely to be got wrong. `presences: { filter: (p) => p.status !== 'offline' }` must remove
  a user who goes offline, not leave a cached presence claiming they are online forever.
- **Never** evaluated on read. Doing so would double the cost of every read and make reads depend
  on user code.
- **Not guarded locally.** A throwing filter is user code on the dispatch path and is contained
  by `EventRouter`'s single `try` (§4.7), like every other user callback that runs inside a
  handler. An inconsistent local `try` here would hide a bug in one place and not two lines away.

`CacheKeys.ts` owns composite keys: `memberKey(guildId, userId)` gives `guildId:userId`. `:` is
safe as a separator because Discord snowflakes are decimal digit strings (verified:
`Snowflake = string`, populated only from Discord ids), so no component can contain one. The
string allocation per composite-key read is real and unmeasured (§8-D3); the alternative — nested
maps — does not fit a flat adapter interface and makes a remote adapter's key space awkward.

`CacheIndex.ts` is `Map<groupKey, Set<entryKey>>`, maintained by `CacheStore` for scopes that
declare a group key. It is what makes `guild.channels`, `guild.members` and `channel.messages`
possible without a full scan.

**The index is tolerant, not authoritative.** `CacheGroupView.values()` looks each id up in the
store, skips misses, and prunes the dead id from the set as it goes. Necessary because an adapter
can drop entries without telling anyone — a Redis adapter expiring a key server-side cannot call
`onEvict`, and neither can a process that restarts with a warm store. An index that assumed it
was authoritative would hand back ids for entries that do not exist, and every caller would have
to re-check anyway. `onEvict` is therefore an eager optimisation only.

Cost, stated rather than hidden: one `Map` entry and one `Set` per group, plus one string
reference per entry. For `members` on a 2,500-guild shard that is 2,500 `Set`s. Groups whose sets
empty are removed on prune. Unmeasured (§8-D3).

**`guild.members` and `guild.channels` return arrays that silently skip unresolved ids**, rather
than `undefined` per id. The alternative is more honest and much more annoying, and the skip is
already what a tolerant index has to do internally. It must be documented on the accessor: _this
is what is cached, not what exists_.

`CacheRegistry.ts` is `client.cache`. It constructs one `CacheStore` per scope from the resolved
options and the adapter factory, exposes them as named readonly properties, and owns three
whole-cache operations: `sweep(now?)`, `clear(scope?)` and `stats()`. The named properties are
typed individually rather than through an index signature, so `client.cache.messages.get(id)`
returns `Message | undefined` and not `unknown`.

---

### 4.13 `cache/CacheSweeper.ts`

TTL needs something to run it, and the naive answer — a timer per scope, or worse per entry — is
what makes TTL expensive.

- **One timer for the whole client**, owned by `CacheSweeper`.
- **Armed only if at least one scope has a non-zero TTL.** The default configuration has none, so
  **the default configuration creates no timer at all**. That is the answer to "a timer per cache
  is expensive": the common case pays nothing. §7 **CW1**.
- The sweeper holds a precomputed array of the TTL'd stores, built once at resolution. A scope
  with no TTL is never visited.
- `setTimeout`, re-armed at the end of each sweep, not `setInterval` — a sweep that runs long
  cannot stack on itself. Verified: the `Timers` seam has no `setInterval` anyway.
- The handle is `unref`'d so the cache alone never holds the process open. Guarded, because under
  a mocked clock the handle may be a plain number rather than a `Timeout`:
  `if (typeof handle === 'object' && handle !== null && 'unref' in handle) handle.unref()`.
  Whether `Timers` should grow `unref` properly is §1.2 item 5.
- Timers come from the injected `Timers` seam, so sweep tests run in mocked time like the
  gateway's. Phase 3's implementation note applies unchanged: dereference `globalThis.setTimeout`
  at call time, never capture it at module scope, or every timing test silently runs in real time.
- Armed in `login()` and cleared in `destroy()`, never at module scope — ADR 2, and §7 **PK4**.
- `sweepInterval` default **60,000 ms — invented Vestra policy**, no protocol basis. `null`
  disables the timer entirely for users who drive `client.cache.sweep()` from their own
  scheduler. `REST.sweep()` already establishes the manual-sweep precedent in this repo and the
  cache mirrors its shape. §8-C9.

Per-tick cost is O(entries actually expiring), thanks to the write-order invariant, plus O(TTL'd
scopes) for the loop. A million-entry member cache with a TTL costs a handful of comparisons per
tick when nothing is expiring.

**What evicts, and when — the complete list.**

| Trigger                                          | What runs                                                         | Cost                    |
| ------------------------------------------------ | ----------------------------------------------------------------- | ----------------------- |
| every write                                      | `max` enforcement, oldest write first                             | O(1) amortised          |
| every write                                      | `filter`; a failing write also deletes any existing entry         | one user call           |
| `get` / `has`                                    | expiry check on that key only; expired entries deleted in place   | O(1)                    |
| iteration                                        | expired entries skipped                                           | O(1) per item           |
| sweep tick                                       | TTL'd scopes only, head first, stops at the first unexpired entry | O(expiring)             |
| `GUILD_DELETE` / `CHANNEL_DELETE`                | index cascade drops the guild's or channel's children             | O(children)             |
| fresh identify, after the guild stream completes | generation reconciliation (§4.14)                                 | O(guilds on that shard) |
| `client.cache.clear(scope?)`                     | everything, or one scope                                          | O(n)                    |

Nothing else evicts. In particular there is no memory-pressure heuristic and no adaptive sizing:
a cache that shrinks itself based on `process.memoryUsage()` is unpredictable in exactly the
situations where predictability is the reason to choose this library.

---

### 4.14 `cache/CacheReconciler.ts`

**The dangerous case is not resume — it is a failed resume.** After a successful replay the cache
is correct, because the replay covers the whole disconnected window; that is what resume is for.
When resume fails and the shard falls back to IDENTIFY, the events in the gap are gone forever.
Fresh `GUILD_CREATE`s overwrite the guilds you are still in, but nothing ever overwrites a guild
you left, a channel deleted during downtime, or a role removed while disconnected. Those entries
linger indefinitely.

Bounded reconciliation:

1. The registry holds a `generation: number`. Every write through `CacheStore` stamps the current
   generation **on the guild record only** — one numeric field on an object that is already large,
   not a field on every entry in every scope.
2. On `READY` for a **new** session (not `RESUMED`), the reconciler bumps the generation for that
   shard.
3. On the `GuildReadyTracker`'s completion signal — not at READY — the reconciler walks the
   `guilds` scope, bounded at 2,500 entries per shard rather than the whole cache, and drops every
   guild belonging to that shard whose generation is stale, cascading through the group indexes to
   its channels, roles, members, voice states, presences, emojis and stickers.
4. Entities deleted _inside_ a surviving guild are handled by the `GUILD_CREATE` handler itself:
   the payload carries the guild's complete channel and role lists, so the handler takes the set
   difference against the guild's index and evicts what is no longer there. Bounded by
   channels-per-guild (500) and roles-per-guild (250). **This is only sound if `GUILD_CREATE`
   after a fresh identify always carries the complete lists** — §8-A8.
5. `messages` and `users` are **not** reconciled. Discord never re-supplies them, so they age out
   through `max` and `ttl` only, and a message deleted during downtime can remain cached.
   Documented limitation, not a bug to be discovered.

**Rejected: clearing the re-supplied scopes up front on identify.** Simpler, and no generation
field. It empties the cache for the entire duration of the guild stream — potentially 30 s on a
large shard — during which every accessor misses. Stale-for-30 s beats absent-for-30 s.

**Rejected: clearing the cache on any reconnect.** Not clearing keeps references stable and leaves
stale entries; clearing is correct and breaks every reference a user holds. §5 makes structure
identity across a resume a promise, and that promise is incompatible with clearing.

Cross-shard note: step 3 needs to know which guilds belong to the reconnecting shard, so the guild
record stores its `shardId`, assigned once at write time. Deriving it per entry via
`shardIdForGuild` would be a `BigInt` shift per guild on a path that runs for every reconnect, and
CONTRIBUTING's snowflakes-stay-strings rule points the same way.

---

### 4.15 `structures/Base.ts` and the conversion rule

```ts
/** Everything a structure needs from the client it came from. */
export abstract class Base {
  readonly #client: Client

  protected constructor(client: Client) {
    this.#client = client
  }

  /** The client that produced this structure. */
  get client(): Client {
    return this.#client
  }
}
```

That is the whole base class, and each omission is a decision:

- **No `id` on `Base`.** Several structures have no snowflake — a voice state is keyed by
  (guild, user), a typing start by nothing at all. Putting `id` on the base makes those declare a
  field they must then lie about. Structures that have an id declare `readonly id: Snowflake`
  themselves, and the snowflake timestamp comes from a free function, `snowflakeTimestamp(id)`,
  using the `DiscordEpoch` constant `@vestra/types` already exports. Rejected: a two-level
  `Base` to `SnowflakeStructure` hierarchy, which buys one shared getter at the cost of a layer
  every reader has to hold in their head.
- **No `equals()`.** With a cache hit, two references to the same entity are the same object and
  `===` is correct. Without one, `a.id === b.id` is what anybody means. A deep `equals` invites
  the reading "these two have equal _contents_", which is expensive, almost never wanted, and
  wrong the moment an array field is compared by reference.
- **No `toJSON()`.** Verified: because the client lives in a private field behind a prototype
  getter, `JSON.stringify(message)` already produces the structure's own camelCase fields and
  nothing else. Adding `toJSON()` would be code fixing a problem this design does not have. One
  consequence must be documented rather than discovered: **the JSON of a structure is not an API
  payload.** It is camelCase, it omits fields the structure chose not to mirror, and it cannot be
  posted back to Discord. Request bodies come from `@vestra/types`' `REST*JSONBody` types.
- **`toString()` only where there is one obvious answer** — the mention, on `User`,
  `GuildMember`, `Role` and `Channel`. Not on `Message` (content? id? a jump link?) and not on
  `Guild`. Where the choice would be a guess, `[object Object]` is more honest than a guess that
  reads as a feature. This is defensible and also inconsistent by construction (§8-C13).

**snake_case to camelCase is hand-written, and the argument that decides it is not the usual
one.** The tempting version is forty lines of generic transform, and the folk argument against it
— "it produces megamorphic shapes" — **is not correct as stated, and it was checked before being
repeated.** Over payloads with identical key sets, generically built instances stay in
fast-properties mode and share a hidden class. Two arguments do hold:

1. **Shape divergence across partial payloads, measured.** A generic transform copies the keys
   that _arrived_. `MESSAGE_CREATE` and `MESSAGE_UPDATE` carry different key sets, and two
   different `MESSAGE_UPDATE`s carry different key sets from each other. Each distinct key set is
   a distinct hidden class, so `message.content` in user code sees N maps and goes polymorphic and
   then megamorphic. A fixed-order constructor assigning `undefined` for absent fields produced
   one map across all three payload shapes. This is the decisive argument and it is the _inverse_
   of the folk one: the generic transform is not inherently megamorphic, it is megamorphic
   precisely on the partial-payload case a Discord library hits constantly.

   **Measured, and with a caveat the original probes missed.** A consumer reading one field off
   generically-built objects costs **~2.2x** what the same read costs off hand-written ones —
   but only past **four** payload variants. V8's inline caches stay fast while polymorphic, and
   the first version of the committed benchmark used three variants and found the generic
   transform _faster_ to read from. The argument is sound and it is specifically an argument
   about **megamorphism**, not about polymorphism; a library that only ever saw three payload
   shapes would not be able to make it.

2. **Cost, on the hot path.** Measured in `scripts/bench/structure-construction.ts`: a naive
   generic transform is **~26x** a hand-written constructor at equal field count, which lands at
   the low end of the scratch bench's "~25–36x". Its _attribution_ was wrong. The
   precomputed-keymap variant — which does no string work at all — was recorded as still ~25x
   and is measured at **~5.6x**, so most of the original figure was the name conversion rather
   than the keyed stores. Keyed stores that cannot be inline-cached to an offset still cost
   ~5.6x and no version of the generic approach recovers that, so the conclusion stands on a
   smaller number than the one that was quoted for it.

**Rejected: build-time codegen of the constructors** from the `API*` interfaces. A real option,
not a silly one — it would remove the boring half of the work and guarantee the naming rule. It
is rejected for 1.0 for the same reason ADR 3 hand-writes the typings: generated output has to be
committed and reviewed anyway, the generator becomes a thing to maintain, and the non-mechanical
cases (renames, omitted fields, sub-structure conversion) mean per-field annotations — at which
point the annotation file is the same size as the code. Worth revisiting if the structure count
grows past what §4.17 ships; it must then produce byte-identical code to what a human would write.

**The naming rule** is mechanical camelCase — split on `_`, uppercase the following character —
with a short explicit **rename allowlist**. Renaming is a thing users must learn and a thing that
breaks grep against Discord's own documentation, so the bar is "the mechanical result is ambiguous
or collides", not "the mechanical result is ugly".

| API field                                          | Structure field                                | Why                                                                                                                                                                                                              |
| -------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `channel_id`, `guild_id`, `owner_id`, `webhook_id` | `channelId`, `guildId`, `ownerId`, `webhookId` | mechanical                                                                                                                                                                                                       |
| `rate_limit_per_user`                              | `rateLimitPerUser`                             | mechanical, and kept ugly on purpose — it is greppable against the docs                                                                                                                                          |
| `color`                                            | `color`                                        | Discord's spelling. Prose in this repo is British (`colour`); field names are not. A field differing from the wire by a vowel is a permanent papercut                                                            |
| `pending` (member)                                 | `pending`                                      | **Not** renamed despite the inversion `payloads/member.ts` warns about. The TSDoc warning is carried across verbatim; a rename would hide the trap rather than flag it                                           |
| `timestamp` (message)                              | `sentTimestamp`                                | allowlisted rename. Bare `timestamp` next to `editedTimestamp` reads as "the relevant one", which it is not. Not `createdTimestamp`: that name is epoch milliseconds from the snowflake on every other structure |
| `*_timestamp`, `joined_at`, `premium_since`        | value kept as the raw ISO string               | `globals.ts` is explicit that timestamps stay strings because most are never read. Structures expose a sibling `get xAt(): Date` that allocates on access and says so. No eager `Date` parsing anywhere          |

**The rule must be tested, not trusted.** `packages/core/test/naming.test.ts` walks the `API*`
interfaces with the TypeScript compiler API (a devDependency, so no runtime dependency is implied)
and asserts every structure field name is either the mechanical camelCase of a field on the
corresponding API type or present in the allowlist **with a reason**. It also reports, as a
warning rather than a failure, a field Discord has that no structure mirrors — drift detection,
per ADR 3's reasoning about never blocking a contributor on a field Discord shipped this morning.

Whether the mechanical rule is unambiguous across all 58 payload files is **not verified**
(§8-A14). "I saw no digits, doubled underscores or leading underscores" is not "there are none".
That test settles it and should be written before a single structure is.

**Sub-structure conversion is eager, and the mechanism behind it is the point.** `new Message(...)`
constructs `new User(data.author)` in the constructor rather than lazily on first access. The
reason is not ergonomics: **any lazy conversion forces the structure to retain the raw payload**,
which pins the entire parsed JSON graph — every embed, every attachment, every mention — for the
lifetime of the structure. That is precisely the memory profile ADR 4 exists to avoid, and it
would be invisible until a heap dump. Eager conversion lets the raw payload be collected as soon
as the handler returns. The cost is one allocation per message for bots that never read
`message.author`, and that cost is **unmeasured** (§8-D2).

**Arrays and nested objects are held by reference, not copied.** `data.mention_roles` came out of
`JSON.parse` moments earlier, is freshly allocated per payload, and nothing else aliases it.

---

### 4.16 Partial structures, `patch`, and why there is no `clone()`

**The uncomfortable fact first.** Under ADR 4's default the cache holds guilds, channels and the
current user — not messages, not members, not users. So a `MESSAGE_UPDATE` arriving for a message
the library has never seen is not an edge case. **It is the normal case.** Any design in which
the partial path is the exception is designing for a configuration most users will not run.

| Payload                    | Cache | Answer                                                                                              |
| -------------------------- | ----- | --------------------------------------------------------------------------------------------------- |
| Full (`MESSAGE_CREATE`)    | miss  | Construct. Every field assigned, in fixed order                                                     |
| Partial (`MESSAGE_UPDATE`) | hit   | `patch()` in place. The cached object is mutated, so every reference the user holds sees the update |
| Partial                    | miss  | Construct **from the partial**, absent fields assigned `undefined`, `partial === true`              |

Case 3 is why the constructor accepts the partial payload type and why every mirrored field is
declared `T | undefined` even when `MESSAGE_CREATE` always sends it.

**The shape survives both.** Verified: the constructor establishes the full shape by assigning
_every_ field including the absent ones; `patch()` may then assign _conditionally_, because
writing an already-present property is a store to a known offset rather than a map transition.
This reconciles two rules that look like they conflict: **"no conditional field assignment" is a
constructor rule; `patch` is exempt precisely because the constructor already ran.** That belongs
in CONTRIBUTING alongside the existing bullet, because on its face the exemption looks like a
violation.

```ts
export class Message extends Base {
  declare readonly id: Snowflake
  declare readonly channelId: Snowflake
  declare readonly guildId: Snowflake | undefined
  declare readonly author: User | undefined
  declare content: string | undefined
  declare readonly sentTimestamp: ISO8601Timestamp | undefined
  declare editedTimestamp: ISO8601Timestamp | null | undefined
  declare pinned: boolean | undefined
  declare embeds: readonly APIEmbed[] | undefined
  /* … remaining fields, fixed order … */
  declare readonly partial: boolean

  constructor(
    client: Client,
    data: GatewayMessageCreateDispatchData | GatewayMessageUpdateDispatchData,
  )

  /**
   * Applies a partial payload in place.
   *
   * @returns The previous values of the fields that actually changed, or `null` if nothing
   *   did. Allocated lazily, so an unchanged patch allocates nothing.
   */
  patch(data: GatewayMessageUpdateDispatchData): Changes<Message> | null

  /** Narrows to a message known to carry every field. */
  isComplete(): this is CompleteMessage
}

/** A message that arrived as a full payload. */
export interface CompleteMessage extends Message {
  readonly author: User
  readonly content: string
  readonly sentTimestamp: ISO8601Timestamp
  readonly editedTimestamp: ISO8601Timestamp | null
}
```

`isComplete()` is verified to compile and narrow under every strict flag this repo sets, with no
cast. It is what stops "every field is `T | undefined`" from making the common path miserable.

**Rejected: separate `Message` and `PartialMessage` classes.** Better types on paper. It doubles
the class count, forces `messageUpdate` to emit a union the user narrows with `instanceof` on a
class that exists only for this purpose, and — decisively — the two classes have different hidden
classes, so any code path handling both goes polymorphic on every field read. One class with a
boolean discriminant and an interface-narrowing predicate gets the same type safety with one
shape.

**Structures never throw on a partial payload.** Absent fields are `undefined`. This follows from
ADR 4's tolerate-absence rule, and the no-throw guarantee is broader than ADR 4 literally states
(§8-C11).

**Why there is no `clone()`, and why `messageUpdate` emits `(message, changes)`.** The familiar
signature is `(oldMessage, newMessage)`. Producing a full `old` requires cloning, and cloning is
where this design hit a wall worth reporting:

- `Object.create(Message.prototype)` plus a field copy — the discord.js approach — **throws
  `TypeError` on the first `this.client` read**, because private fields are installed only by the
  constructor. Verified.
- The obvious workaround, dropping `#client` for a non-enumerable `client` defined with
  `Object.defineProperty`, works functionally and keeps fast properties — **and the clone's hidden
  class still differs from the constructor's**, even with every field assigned in constructor
  order. Verified. So `Object.create` cloning is shape-divergent regardless of how the client is
  held, meaning every cloned structure is a second map and every property read on `Message`
  becomes polymorphic. The workaround buys nothing.
- The only shape-safe clone is re-running the constructor, which needs the raw payload, which
  means retaining raw payloads — the memory cost §4.15 just rejected.

So: **no `clone()`, and `messageUpdate` emits `(message, changes)`.** `Changes<Message>` is
`Readonly<Partial<Message>>` carrying the previous values of only the fields that changed, built
lazily — `null` until the first real change, so a no-op patch allocates nothing. This is cheaper,
available exactly when a cache hit occurred, and more useful than a stale full snapshot the reader
must diff themselves. It also stops the API teaching a shape that, under the default cache, is
`undefined` most of the time. **The choice to break ecosystem convention is policy** and needs a
migration note, not a changelog line (§8-C12).

Two honesty notes that must reach the TSDoc:

- Change detection is exact for scalars and **reference-only** for arrays and objects. A fresh
  `JSON.parse` never reference-equals the previous value, so `embeds` reports as changed whenever
  the payload carries it, even if the contents are identical. Deep comparison is not worth its
  cost on this path. Say so rather than letting people discover it.
- `patch()` must never introduce a property the constructor did not. Testable (§7 **S4**), and it
  is the invariant the whole shape argument rests on.

**Partial payloads must never create a cache entry.** Verified from `@vestra/types`:
`GatewayGuildMemberUpdateDispatchData` is `Partial<Omit<APIGuildMember, 'roles' | 'user'>>` plus
`guild_id`, and `GUILD_UPDATE` is a bare `APIGuild` — it does **not** carry
`GatewayGuildCreateExtraFields`, so it has no `member_count`, `joined_at` or `large`. Two rules
follow, and both are tested (§7 **R5**, **R6**):

- A partial dispatch **merges** over an existing entry and is **dropped** if there is none.
  Writing a partial as if it were complete corrupts the cache with an object whose missing fields
  are indistinguishable from real absences.
- `GUILD_UPDATE` merges into the cached guild rather than replacing it. Constructing a fresh
  `Guild` from `GUILD_UPDATE` and storing it wipes `memberCount`, `joinedAt` and `large` — a bug
  that only shows up hours after startup, the first time somebody edits a guild setting.

---

### 4.17 What ships as a structure, and what does not

The criterion, applied without exceptions: **a structure earns its place if it has identity, and
at least one of — a default cache entry under ADR 4, a REST route that exists today, or computed
behaviour a consumer could not reasonably write themselves.** Everything else is emitted as its
already-complete `API*` type from `@vestra/types`.

| Ships                                 | Qualifies because                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Base`                                | the pattern                                                                                                                                                        |
| `User`                                | referenced by nearly every payload; `users.get`, `users.createDM` exist                                                                                            |
| `ClientUser extends User`             | cached by default under ADR 4; `users.getCurrent`, `users.editCurrent` exist                                                                                       |
| `GuildMember`                         | six `guilds.*Member*` routes exist                                                                                                                                 |
| `Guild`                               | cached by default; `guilds.get`, bans and roles all exist                                                                                                          |
| `Role`                                | **computed behaviour** — permission resolution needs role objects with their bit sets. `guilds.getRoles`/`createRole` exist; `editRole`/`deleteRole` do not (§1.3) |
| `Channel` family plus `createChannel` | cached by default; `channels.get/edit/delete` and the whole message CRUD hang off it; the README's committed example depends on it                                 |
| `Message`                             | full CRUD exists; the object most bots touch first                                                                                                                 |

The channel family is `Channel` (abstract) to `GuildChannel` to `TextChannel`,
`AnnouncementChannel`, `VoiceChannel`, `StageChannel`, `CategoryChannel`, `ThreadChannel`,
`ForumChannel`, `MediaChannel`, plus `DMChannel` and `GroupDMChannel` off `Channel` directly.
`createChannel(client, data)` switches on `data.type` and is the **only** place that switch
exists. It has a total-coverage test (§7 **S7**) mirroring the dispatch-coverage test, and it
returns a plain `Channel` rather than throwing for an unrecognised type — Discord ships new
channel types without warning and a library that throws on one is a library that breaks on a
Tuesday (§8-C10).

**Cut, deliberately:**

- **`Interaction` and the entire component/modal tree.** Not a judgement about importance —
  blocked. §1.3.
- **`Attachment`, `Embed`, `Sticker`, `Reaction`, `MessageReference`, `Poll`, `Activity`,
  `Presence`.** No identity that matters, no cache entry, no route, no computation. Wrapping them
  costs a conversion per message on the hot path — every message carries `embeds` and
  `attachments` — and buys renamed fields. Reasoned, not measured (§8-C11).
- **`Emoji`.** Fails the criterion honestly: reaction emoji are often unicode with no id, there is
  no emoji route, and nothing is cached. What is actually needed is one function —
  `emojiIdentifier(emoji)`, producing the `name:id` or percent-encoded unicode form that
  `channels.addReaction` requires. ~50 lines instead of a class.
- **`VoiceState`. Built after all, and the cut was wrong.** The reasoning here was "no id, not
  cached by default, nothing to compute" — and the last two were false by the time it was
  written. It has a cache scope keyed by `guildId:userId`, `connected`/`muted`/`deafened` are
  exactly the computation this section says it lacks, and emitting `APIVoiceState` would have
  meant `self_mute` beside `selfMute` on the same event.
- **`Invite`, `AuditLogEntry`, `StageInstance`, `GuildScheduledEvent`, `AutoModerationRule`.
  Also built.** The cut said each "can be added in a later minor without touching anything that
  ships now — the definition of a safe cut", and that held: every one landed additively, and
  the events that would otherwise have emitted raw payloads never shipped doing so. So the
  reasoning was right and the conclusion was premature; the safe cut turned out to be a safe
  _order_.
- **`Webhook`, `Integration`, `SoundboardSound`, `Entitlement`, `Subscription`, `ThreadMember`.**
  Still cut, on the same grounds, and each still listed in `events/unhandled.ts` with its
  reason. `ThreadMember` was named here as the one to do next, on the grounds that §5.2 and §7
  specify replay behaviour for `THREAD_MEMBERS_UPDATE` — but that turned out not to need the
  structure at all. The dispatch is handled now and the contradiction is closed (§8-E **E2**);
  `ThreadMember` is cut on the same terms as the rest.

**The objection this cut must answer, stated plainly.** Handled events that emit raw payloads
(§4.4: four of them) give the event API **mixed casing** — `message.channelId` in one handler,
`data.channel_id` in the next. That is a real DX cost and should not be waved away. The
alternative, wrapping everything, pays a conversion cost on every dispatch for every bot
regardless of what it listens to — the CPU analogue of the memory profile ADR 4 exists to avoid.
The mitigation is that raw payloads here are not a fallback to `any`: `GatewayDispatchPayload` is
a discriminated union and the 76 events are fully typed already. The cost is "different naming for
four events", not "untyped". Each raw-emitting event says so in its TSDoc, and `docs/events.md`
lists which events emit structures — a user finding this out at runtime is a documentation
failure.

**`message.channel` and the README.** ADR 4 requires `message.channel` to be
`Channel | undefined`. `README.md` line 50 reads
`await message.channel.createMessage({ content: 'pong' })` with no optional chaining, and **does
not type-check under ADR 4**. This is a genuine conflict in the repository as it stands, not a
typo. ADR 4 is non-negotiable, so the README gains `?.` and the library's headline example becomes
slightly uglier — which is the honest outcome, and it sets the tone for every other cache-backed
accessor. It should be fixed before the structure accessors are written (§9).

**Three tiers, and the naming makes the tier visible.**

| Tier            | Spelling                                                  | Returns                             | Touches                 |
| --------------- | --------------------------------------------------------- | ----------------------------------- | ----------------------- |
| payload-derived | `message.author`, `message.member`, `message.channelId`   | always present when Discord sent it | nothing                 |
| cache-derived   | `message.guild`, `message.channel`, `member.roles.cache`  | `T \| undefined`, synchronously     | the cache               |
| fetched         | `message.fetchChannel()`, `client.cache.guilds.fetch(id)` | `Promise<T>`                        | async source, then REST |

**Ids never lie; objects may be missing.** Every structure carries the raw id as a constructor-
assigned field, so a user who needs to _act_ on a guild id — route it, log it, pass it to REST —
never touches the cache. This is what makes `guilds: false` survivable at all.

**Cache getters never memoise.** `get guild()` reads the store on every access and stores nothing
on `this`. A memoised `#guild` field would hold a strong reference to an entry the adapter has
evicted, silently defeating `max`, and would keep serving a stale object after `GUILD_UPDATE`
replaced it. The cost is a hash lookup per access, which is the honest price (§7 **CU3**).

**What this does to `message.member.roles`** — verified against the repo's own types, this is
better than it first looks and worse in one specific place:

- `message.member` is **payload-derived**. `APIGuildMember`'s TSDoc records that `user` is absent
  in the member embedded in `MESSAGE_CREATE`/`MESSAGE_UPDATE` because the user is at the top
  level. So a guild message carries its member inline and `message.member` is defined with
  `members: false`, the default. Its presence depends on the payload, not on cache policy.
- `member.roles` is the raw `Snowflake[]` from that payload. Always there. Never a cache read.
- `member.roles.cache` — resolved `Role` objects — is cache-derived, and works by default **only
  because of the roles-on-by-default deviation**. Under literal ADR 4 it would be `undefined` by
  default and permission computation would need a REST round trip on every check. That is the
  concrete reason the deviation is being asked for.
- `message.member.user` is `undefined` on that inline member, by protocol. Structures must resolve
  the author from `message.author` or the `users` cache, never from `member.user`. Anything keying
  members off `member.user.id` — "the single most common source of runtime errors when porting",
  per that same TSDoc — breaks here first. This is why `GuildMember` carries `guildId` and
  `userId` as its own constructor-assigned fields: the composite cache key must be derivable
  without `user`.

**Two files sit at the 300-line line, and pretending otherwise would be dishonest.** `Guild.ts`
and `Message.ts` are _at_ 300, and only because the structures do not mirror every API field.
`APIGuild` has roughly fifty; with a TSDoc block on each, a full mirror is 600 lines before a
single method. `max-lines` is `warn`, not `error` (verified), and CLAUDE.md's phrasing is "around
300 lines, ask what belongs elsewhere" — so this is a question to answer, not a rule to break. The
answer that works for a class, which cannot be split across files: **keep fields, the constructor
and `patch` in the class file, and move computation to sibling modules the class delegates to** —
`guild/permissions.ts`, `guild/icons.ts`, `message/links.ts`. That is a split by idea rather than
a line-count dodge. What it does not solve is field count, so the honest position is that a
structure mirrors a **curated** field set and the rest of the payload is reachable through
`client.on('raw')`. Which fields are curated needs a per-structure pass this document does not
attempt (§8-A15).

---

## 5. Replay, idempotency and reconnect

### 5.1 What `replayed` means, and the rule that is wrong

The tempting rule is "ignore dispatches with `replayed: true`, we have already applied them."
**That rule is wrong and would put holes in the cache.**

Read from `Shard.ts`: `replayed` is `true` for dispatches arriving between the RESUME being sent
and `RESUMED` arriving. Discord replays from `s + 1`, where `s` is the last sequence the client
parsed. Those events arrived _while the socket was down_. The client has never seen them.
Skipping them means a `MESSAGE_CREATE` that happened during a five-second reconnect is never
applied to anything — and it will never be delivered again, because resume is the only delivery.

**Replay is gap-fill, not redelivery. Replayed dispatches are handled exactly like live ones.**

`replayed` is surfaced to consumers exactly once, on `client.on('raw', …)`. It is not passed to
`handle` (§4.5). That restriction is deliberate: if a handler cannot see the flag, it cannot
branch on it, and the "handlers are pure functions of (cache, data)" invariant is unforgeable
rather than a convention that erodes the first time somebody has a plausible reason. The escape
hatch exists and is deliberately awkward — `shard.state === ShardState.Replaying`, which is
presently equivalent because `#replaying` and the `Replaying` state are set and cleared together,
though the gateway does not publish that as a guarantee. A handler reaching for it should be
explaining itself in a comment.

### 5.2 Idempotency, structurally

Duplicates are nonetheless possible and the cache must be idempotent under re-application. One
certain mechanism exists in this repo: `SessionStore.set` may be async, so if a process crashes
between processing sequence _n_ and the store durably recording it, a cross-process resume asks
Discord to replay from a sequence somebody already handled. Whether Discord _itself_ ever replays
from before the acked sequence is undocumented and unmeasured (§8-A1).

The rule that makes duplicates harmless is one sentence:

> **A handler may write an entity absolutely (`cache.x.add(entity)`) or remove one
> (`cache.x.delete(id)`). It may never read a cached value, adjust it, and write it back.**

Applying the same payload twice then leaves the cache in the same state as applying it once, for
every handler, by construction. The rule has teeth because real handlers want to break it:

| Event                              | The tempting non-idempotent write | Payload carries an absolute value?                               | What Vestra does       |
| ---------------------------------- | --------------------------------- | ---------------------------------------------------------------- | ---------------------- |
| `THREAD_MEMBERS_UPDATE`            | splice `added_members` into a set | **Yes** — `member_count` is on the dispatch                      | assign it; replay-safe |
| `GUILD_MEMBER_ADD` / `_REMOVE`     | `guild.memberCount ± 1`           | **No** — verified, neither payload carries a count               | leave it alone         |
| `MESSAGE_REACTION_ADD` / `_REMOVE` | `reaction.count ± 1`              | **No** — verified: `user_id`, `emoji`, `burst`, `type`, no count | leave it alone         |

**`guild.memberCount` and reaction counts are never adjusted locally.** They hold the last
absolute value Discord sent, and say so in their TSDoc. `guild.fetch()` refreshes it.

The honest and the convenient answer differ here, so state it plainly: a counter maintained by
deltas over a lossy stream is wrong **even without resume** — one dropped `GUILD_MEMBER_REMOVE`
during a reconnect and the number is permanently off, with nothing to correct it. ADR 4's
"accessors that depend on the cache never lie by asserting" applies to numbers as much as to
objects. This is a genuine behaviour difference from discord.js and ADR 4 requires it be
documented as such rather than discovered (§8-C2).

**Rejected: sequence-based replay de-duplication.** One of the facets specified this — the
`EventRouter` keeps the highest applied `s` per session and drops any dispatch not greater than
it, with a reset on op 9 `d:false`. It is rejected on three grounds. (a) Discord's sequence
numbering means a duplicate cannot arise in a healthy session, so it guards a protocol violation
nobody has observed. (b) It costs a comparison and a write on every single dispatch on the hot
path, forever, for that. (c) The reset requirement is a **new way to lose events**: `s` restarts
at 1 after a fresh identify, so a missed reset silently blackholes an entire session — a worse
failure than the one being guarded, and one that no test would catch unless somebody thought to
write it. Idempotency by absolute writes covers the same ground with no per-dispatch cost and no
new failure mode. `highestAppliedSequence` therefore appears nowhere in §2.4's ownership table.

### 5.3 Two promises about reconnects

**Structure identity is stable across a resume.** `assert.equal(guildBefore, guildAfter)` on the
same reference holds (§7 **R2**). A reconnect that rebuilds structures silently invalidates every
reference a user has held. This constrains every handler to patch rather than replace, forever.
It is the right promise and it is a promise, not a protocol requirement (§8-C1).

**The cache is not cleared on reconnect or on a fresh identify.** Not clearing keeps references
stable and leaves stale entries; clearing is correct and breaks every reference a user holds.
§4.14's generation reconciliation is what removes the stale entries without breaking the
references, and it is bounded rather than wholesale.

### 5.4 Where `ready` fits

`ready` fires when **every owned shard has reached READY and settled its guild stream**. It fires
once per client lifetime. It carries the bot's own user, which is guaranteed present at that
moment even though `client.user` is `ClientUser | undefined` everywhere else — handing the
listener a non-optional value at the one moment it is certain is worth the extra parameter.

Three verified facts shape this.

**`ShardManager.allReady` is already deferred for exactly this purpose.** It is emitted from a
`shard.once('ready')` counter wrapped in `queueMicrotask`, with a source comment stating the
deferral exists because `shardSpawn` is the first point a consumer can attach, so emitting inline
would run ahead of every consumer `ready` handler. The client is downstream of that: `ShardBridge`
seeds `client.user` and the tracker in a `shard.on('ready')` listener, and `allReady`'s deferral
is what guarantees that work has finished before the client considers firing `ready`. **This is
why `client.ready` can be built on `allReady` at all**, and it is a property of the shipped code
rather than something Phase 4 arranges.

**`allReady` is one-shot, and slightly optimistic.** Because the counter uses `once`, a shard that
reaches READY, dies, and re-identifies before the fleet completes will not re-increment, so
`allReady` can fire while that shard is disconnected. `client.ready` inherits this. The honest
TSDoc phrasing is _"every owned shard has reached READY at least once"_, not _"every shard is
connected"_. `client.isReady` reports whether `ready` has fired; a live check is
`[...client.shards.values()].every(s => s.state === ShardState.Ready)`, and if that turns out to
be something people want it should be a separate accessor with a separate name rather than a
redefinition of `isReady`. §8-A5.

**`GuildReadyTracker` is what stops `ready` from lying about the cache.** `allReady` means the
handshakes succeeded. The `GUILD_CREATE` stream lands afterwards, so a `ready` built on `allReady`
alone fires while the guild cache is partially filled — and guilds are cached by default, so
`client.cache.guilds.size` inside such a handler would return an arbitrary number. That is
precisely the bug the tracker was written to prevent, and it is currently wired to nothing (§1.1).

Per shard the client therefore tracks two flags: READY seen, and guild stream settled. A shard is
settled when the tracker completes, or immediately at READY when `(intents & Guilds) === 0`.

**`ready` cannot hang indefinitely as long as READY arrives**, because the tracker's timer is
idle-based rather than absolute: it completes after `idleMs` with no new resolution, and a Discord
outage produces `GUILD_DELETE`s that also resolve entries. If READY itself never arrives — Phase 3
§4.9 established there is no protocol-sanctioned unconditional READY timeout, because a connection
still ACKing heartbeats is healthy — then `ready` never fires, `whenReady()` waits, and `login()`
is governed by `loginTimeout`. Each link in that chain is deliberate.

**`whenReady()` is level- and edge-triggered.** It resolves immediately if `ready` has already
fired. Without that, `await client.login(); await client.whenReady()` has a race: `login()`
awaits, which drains microtasks, and `allReady` is itself queued as a microtask — so against a
fast fake gateway in a test, `ready` can fire _during_ the `await` and a purely edge-triggered
`whenReady()` would wait forever. Real network latency hides this; the test suite would find it,
which is the whole reason to write it down now (§7 **L9**).

**`ready` does not re-fire after a full fleet reconnect.** A one-shot `ready` means
`client.on('ready', registerCommands)` registers commands once, which is what people mean.
Reconnect visibility comes from `shardResumed`, `shardReady` and `shardDisconnect`.

---

## 6. Cross-facet decisions register

Five facets were designed independently and disagreed in eleven places. Each is resolved above;
this table exists so a reader can find the resolution without re-reading the section that contains
it, and so the rejected option is on the record rather than lost in a conversation.

| #   | The disagreement                                               | Decision                                                                                                              | Rejected, and why                                                                                                                                                                                                                                                                                             | §        |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Is `CacheAdapter` synchronous?                                 | **Sync.** No method returns a promise                                                                                 | Async: it makes dispatch handling asynchronous, which the gateway explicitly does not do; it is a lint error under `no-floating-promises`; and it turns `message.guild` into a promise, which is what ADR 4's ergonomics argument was avoiding. `AsyncCacheSource` recovers the useful part for `fetch*` only | 4.10     |
| 2   | One cache interface or two?                                    | **Two.** Pluggable `CacheAdapter<V>` per scope; core-owned `CacheStore<V>` facade; `CacheRegistry` is `client.cache`  | One adapter owning many stores: makes the pluggable unit the whole cache, so a user wanting Redis for members alone must implement everything                                                                                                                                                                 | 4.10     |
| 3   | `max` eviction order                                           | **Write-recency** — insertion order, refreshed on write via delete-then-set, never on read                            | LRU with read promotion: puts a delete-and-reinsert on the hotter path and makes iteration order change under a read. ADR 4 specifies a count and no order, so both were legal                                                                                                                                | 4.11     |
| 4   | Sequence-based replay de-duplication                           | **No.** Idempotency by absolute writes                                                                                | Dropping any dispatch whose `s` is not greater than the highest applied: costs a comparison per dispatch forever to guard an unobserved violation, and its reset-on-identify requirement is a new way to lose an entire session                                                                               | 5.2      |
| 5   | `replayed` on every dispatch-derived client event              | **No.** Surfaced on `raw` only                                                                                        | Trailing `(shardId, replayed)`: structurally incompatible with handlers owning their own `emit` (needed for the guildCreate/guildAvailable split) plus handlers not being told about replay. Cost: a DM `messageCreate` listener cannot tell which shard delivered it                                         | 4.4      |
| 6   | Derive `ClientEvents` from `GatewayDispatchEvents`?            | **Hand-written map; the mechanical rule survives as a test-only guard**                                               | The derived mapped type cannot express a one-to-two split, and three of its properties (compile cost, diagnostic quality, whether `EventEmitter` accepts the intersection) were never measured or compiled                                                                                                    | 4.4      |
| 7   | Do unhandled events emit under a derived name?                 | **No.** They reach consumers through `raw` and are listed in `unhandled.ts` with a reason                             | Emitting raw data under a derived name: after 1.0, upgrading an event's argument from `APIEntitlement` to `Entitlement` is a major bump for an event nobody asked for                                                                                                                                         | 4.4      |
| 8   | Handler signature                                              | **`handle(client: EventContext, data, shard: DispatchShard): void`** — three arguments, narrowed views, no `replayed` | Four arguments with `replayed`, and passing `Client`/`Shard` directly. The three-argument form keeps CONTRIBUTING's published example literally correct                                                                                                                                                       | 4.5      |
| 9   | Who owns `GuildReadyTracker` and `MemberChunker`?              | **Core, in `ShardBridge`, outside the registry**                                                                      | Wiring them into `Shard`: tidier and probably where they belong long term, but it makes Phase 4 wait on a Phase 3 amendment for something core can do today                                                                                                                                                   | 1.1, 4.3 |
| 10  | `login()` or `connect()`, and when does it resolve?            | **`login()`, resolving on the first owned shard's READY**                                                             | `connect()`: shares a name with `ShardManager.connect()` while resolving at a different point. Full-fleet readiness: 65 s of identify pacing for a 200-shard bot; `whenReady()` covers it                                                                                                                     | 4.2      |
| 11  | Structures for `Emoji`, `Presence`, `VoiceState`, `Attachment` | **Cut.** `emojiIdentifier()` is a free function; the rest emit `API*` types                                           | Shipping them: fails §4.17's criterion, and wrapping every payload costs a conversion per dispatch for every bot regardless of what it listens to                                                                                                                                                             | 4.17     |

Two further alignments that were not contradictions but needed one answer:

- **A throwing cache `filter` is contained by `EventRouter`'s single `try`**, not by a local guard
  in `CacheStore`. The cache facet deliberately deferred this; the client facet owns it (§4.7).
- **The raw event is named `raw`, not `dispatch`.** The client's version carries an extra
  `shardId` and fires after `ShardBridge`'s companions, so reusing the shard's name would describe
  two subtly different things (§4.4).

---

## 7. Testing

Type-level assertions are checked by `tsc --build` and never by the runner — tests execute under
`--experimental-strip-types`, so a wrong type in a test file fails `pnpm typecheck` and passes
`pnpm test`. Both must be in CI for these guards to mean anything, and **`packages/core/test` must
be in the root solution `tsconfig.json`** or none of them run.

`@ts-expect-error` is the mechanism throughout: if the error stops occurring, the directive
becomes an unused-directive error and the test fails in the correct direction.

**Two things this section did not anticipate, learned from writing the tests it specifies.**

_`pnpm build` does not run any of this._ It is `turbo run build`, and each package's build task
compiles that package's `src` only — the test projects are in the root solution but are not
turbo tasks. A green `pnpm build` is compatible with a test file that does not compile at all.
`pnpm typecheck` is the one that covers them, and it is what CI runs. CONTRIBUTING.md now says
so; the sentence above about the solution `tsconfig.json` was necessary but not sufficient.

_The guards that earned their keep are the sweeps, not the cases._ Almost every real defect this
phase was an **absence** — a cache scope nothing wrote to, an entity nothing evicted when its
container went, a dispatch nobody had decided about — and an absence is invisible to a test that
checks a value. So the tests that found things enumerate a surface and assert nothing is missing
from it: every scope has a writer, every dispatch is handled or explained, every channel type
builds a class or is recorded as unsupported, every structure emits one shape, every re-export is
the same object the lower package exports. Each names the missing thing when it fails.

They come with a hazard the case-based tests do not have: a sweep that enumerates nothing passes
silently. Every one of them therefore asserts its own surface is non-empty first — and every
guard in the package is proven by mutation, reverting the fix and requiring the test to fail
naming the thing, because a guard that cannot fail is worse than no guard.

The suite is 34 files. The IDs below are the specification's; the implementation added families
it did not name — `CC` for cache coverage, `EC` for dispatch coverage, `SH` for structure shape,
`ER` for the error hierarchy, `PK` for barrel identity.

### 7.1 Test doubles

**The REST double is free.** Verified: `RESTOptions.fetch?: typeof globalThis.fetch` exists and is
documented for testing. Core's tests construct `new REST({ fetch: recordingFetch }).setToken('t')`
and never open a socket. Rejected: reusing `packages/rest/test/mock-discord.ts` (175 lines, a real
`node:http` server) — it exists because rate limiting must be exercised over real headers, which
is `@vestra/rest`'s job and already covered by its own suite. Core would pay a listening socket
per test to re-prove someone else's invariant. One caveat to write down: `DefaultRESTOptions.fetch`
captures `globalThis.fetch` **at module load**, so a test that swaps the global after import has
no effect — pass `fetch` explicitly, always.

**The gateway double is not free, and the reason is mechanical.**
`packages/gateway/test/mock-transport.ts` is exactly the double core wants, and of four ways to
reach it, three do not compile (§0.2). **Take the fourth:** `packages/core/test/tsconfig.json` gets
`rootDir: "../.."` and `include: ["**/*.ts", "../../gateway/test/mock-transport.ts",
"../../gateway/test/manual-timers.ts"]`. The runtime half is fine either way — `pnpm test` runs
`node --experimental-strip-types`, which resolves the relative `.ts` path directly, and the mock's
only cross-package imports are `import type`, which erase. (Read, not executed; confirm it first.)

- Rejected **copying** `MockTransport` into core: two scripted transports drift, and core's copy
  would quietly stop matching the `Transport` contract the real `Shard` depends on — which is the
  entire reason core wants the real `Shard` in its integration path rather than a fake one.
- Rejected a private **`@vestra/test-utils`** workspace package: cleanest long-term, and the right
  answer the moment a third consumer appears, but it costs a package directory, a
  `pnpm-workspace.yaml` entry, a root-solution reference, a turbo target and a rewrite of Phase 3's
  imports — for two files. Revisit rather than pre-build. This is the moment to choose, and it
  wants sign-off because it changes how test projects are configured repo-wide (§8-A17).
- The trade accepted: the mock is compiled twice, and a change to it must keep both suites green.
  That is a feature.

**One Phase 3 test refactor is required.** `ManualTimers` is defined _inside_
`packages/gateway/test/fleet.test.ts` and is not exported (verified). It must move to
`packages/gateway/test/manual-timers.ts` and be imported back, and it needs a
`get pending(): number` for **L2**. Small and mechanical — but it is an edit to Phase 3's tests
inside Phase 4, and it should be a deliberate first commit rather than a surprise.

The harness is what makes the scenarios below one-liners:

```ts
export interface CoreHarness {
  client: Client
  fleet: MockTransportFleet
  timers: ManualTimers
  requests: { method: string; path: string }[]
  hello(shardId?: number, intervalMs?: number): void
  ready(overrides?: Partial<GatewayReadyDispatchData>): void
  dispatch<E extends keyof GatewayDispatchEventMap>(
    t: E,
    d: GatewayDispatchEventMap[E],
    s?: number,
  ): void
  close(code: number, wasClean?: boolean): void
  settle(): Promise<void>
}
export async function harness(options?: Partial<ClientOptions>): Promise<CoreHarness>
```

Typing `dispatch` through `GatewayDispatchEventMap` means every scenario below is _also_ a
compile-time assertion that the payload matches the event name — the `@vestra/types` work pays for
itself in the test suite before it pays for itself anywhere else.

`fixtures.ts` builds **valid** payloads. `partials.ts` builds invalid ones and is the only file
permitted a cast, because a genuinely partial `APIMessage` is by construction not an `APIMessage`;
concentrating the dishonesty in one helper keeps it visible.

### 7.2 Cache policy — `CP`

- **CP1** `false` and `{ max: 0 }` both produce a `NullCacheAdapter`.
- **CP2** `true` produces `{ max: Infinity, ttl: 0 }`.
- **CP3** a negative `max` or `ttl`, or a non-integer `max`, throws at construction.
- **CP4** every scope is present in the resolved record; none is `undefined`.
- **CP5** (compile-time) a scope missing from `CacheValueMap` is a compile error.
- **CP6** the defaults match the documented table exactly — the test _is_ the table.
- **CP7 — the ADR 4 contract.** `new Client({ intents })` with no `cache` option, then a
  `MESSAGE_CREATE` from an unseen author in an unseen channel: `cache.guilds.size === 1`,
  `cache.channels.size === 1`, `client.user` set, and `cache.users.size === 0`,
  `cache.messages.size === 0`, `cache.members.size === 0`. Plus `cache.roles.size` reflecting the
  fourth default. **If one test in this package survives a rewrite, it is this one.**

### 7.3 Eviction, expiry and adapters — `CE`, `CW`, `CA`

- **CE1** `max: 3`, four writes: `size === 3` and the oldest _write_ is gone.
- **CE2** rewriting an existing key moves it to the tail — with `max: 3`, writing A, B, C, A, D
  evicts **B**, not A. This is the write-recency rule made testable.
- **CE3** `max` is never exceeded even transiently: size after each write is `<= max`.
- **CE4** an expired entry is not returned by `get`, `has`, `values` or `entries`, **before any
  sweep runs**.
- **CE5** a write failing `filter` deletes the existing entry for that key.
- **CE6** `filter` is never called on a read.
- **CE7** property test: after an arbitrary sequence of `set`/`delete`/`clear`/`sweep`,
  `#expiry.size === #values.size`.
- **CE8** the write-order invariant: after arbitrary writes with a fixed TTL, iterating keys yields
  non-decreasing `expiresAt`. This is what licenses the early-exit sweep, and it is the assertion
  that fails first if somebody adds per-entry TTLs.
- **CW1** no scope with a TTL means **no timer is ever created** — asserted against the mocked
  timer count, not by inspection.
- **CW2** the sweep visits only TTL'd scopes.
- **CW3** the sweep stops at the first unexpired entry: instrument the comparison count and assert
  it is bounded by the number expiring, not by the scope size.
- **CW4** the timer handle is `unref`'d, and the guard survives a handle that is a plain number.
- **CW5** `sweepInterval: null` creates no timer and `client.cache.sweep()` still works.
- **CA1** `adapter-conformance.ts` exports `runCacheAdapterConformance(name, factory)`, asserting
  the entire `CacheAdapter` contract against any implementation. `MemoryCacheAdapter` and
  `NullCacheAdapter` both run it in-repo; a Redis adapter imports it. **This is the artefact that
  makes "implementing one interface" a checkable claim rather than a hope.**
- **CA2** a `RecordingCacheAdapter` swapped in via options receives the identical call sequence the
  default adapter would, for a fixed five-dispatch script. The only test that proves ADR 4's
  central claim.

### 7.4 Indexes and miss tolerance — `CI`, `CU`

- **CI1** `guild.channels` returns exactly the guild's cached channels.
- **CI2** an index entry whose target has been evicted is skipped and pruned on read — simulate a
  Redis-style silent eviction by deleting straight from the adapter, bypassing the store.
- **CI3** `GUILD_DELETE` cascades to channels, roles and members.
- **CI4** an emptied group is removed from the index rather than left as an empty `Set`.
- **CU1** with every scope disabled, constructing a `Message` from a real `MESSAGE_CREATE` payload
  succeeds and `message.member` is defined **from the payload**.
- **CU2** no accessor on any shipped structure throws on a cache miss — enumerate the accessors
  reflectively and call each against an empty cache. This is ADR 4's tolerate-absence rule made
  executable, and it is what forbids an asserting variant ever being added.
- **CU3** a cache getter does not memoise: evict the entry between two reads and the second returns
  `undefined`.
- **CU4** `add` returns its argument under a `NullCacheAdapter`, so CONTRIBUTING's canonical
  handler line compiles and runs with `messages: false`.
- **CU5** (compile-time) the return type of every cache-backed accessor includes `undefined`.
  `message.guild` asserting is a compile failure, not a review comment.
- **CU6** `message.guildId` is the correct string with `guilds: false` — ids never lie.

### 7.5 Structures — `S`, and shape — `SH`

- **S1** `MESSAGE_UPDATE` carrying only `{ id, channel_id, edited_timestamp }`, in two variants:
  patched onto a cached message (every prior field intact, `editedTimestamp` updated), and with
  nothing cached (a `Message` whose absent fields are `undefined`, no throw, no accidental `null`).
- **S2** constructing from a minimal payload leaves absent fields `undefined` and **present**:
  `'content' in message === true`.
- **S3** `patch` returns previous values for changed fields only, and `null` when nothing changed —
  asserted by identity, that no object was allocated.
- **S4** `patch` never introduces an own property the constructor did not create: `Object.keys`
  before and after are identical, **in identical order**.
- **S5** `edited_timestamp: null` clears the field; `edited_timestamp` absent leaves it alone. The
  null-versus-absent case, which is the one that will regress.
- **S6** `isComplete()` is `false` for a partial and `true` for a full payload, and the narrowing
  compiles — asserted with `@ts-expect-error` on the un-narrowed read.
- **S7** every value in `ChannelType` maps to a constructor or is listed explicitly as unsupported.
  The analogue of the dispatch-coverage test.
- **S8** an unrecognised numeric channel type returns a base `Channel` and does not throw.
  **Implemented the other way, deliberately — this line is superseded.** `createChannel` returns
  `undefined` for a type it cannot build, and `packages/core/test/structures-channels.test.ts`
  **CH4** asserts exactly that. Returning a bare `Channel` fails on the version after next:
  `GuildDirectory` has no payload shape in `@vestra/types` today, so it would come back as
  `Channel`, and the release that models it would start returning `DirectoryChannel` — a class
  change for existing code, arriving as a bug fix. Every predicate on that placeholder would
  also be answering about a payload nobody has modelled. `undefined` says the library did not
  understand the channel, which is the truth, and a caller can act on it. The cost is that
  `createChannel` has a `| undefined` return that callers must handle; the handlers do.
- **S9** `JSON.stringify(structure)` does not throw when the client holds a reference cycle. The
  regression test for the `#client` rule; it would have caught the plain-field version instantly.
- **S10** `Object.keys(structure)` and `util.inspect(structure)` do not include the client.
- **S11** `toString()` returns the mention for `User`, `GuildMember`, `Role`, `Channel`, and is not
  overridden on `Message` or `Guild`.
- **S12** snowflakes stay strings: `typeof message.id === 'string'`, and `'1234567890123456789'`
  (past 2^53) round-trips byte-identical through construction, caching and a `guild.members` lookup.
- **S13** `snowflakeTimestamp` agrees with the `timestamp` field on a payload carrying both.

**Shape — `SH`.** The suite that makes the hot-path rules tested rather than reviewed. It needs V8
natives, so `shape.test.ts` `await import()`s `shape-helper.ts` inside a `try`/`catch` and skips
when the flag is absent. Verified: without `--allow-natives-syntax` the helper is a parse-time
`SyntaxError` and a dynamic import catches it, so no child process is needed. CI runs it as a
second pass, `node --allow-natives-syntax --test`. **It is advisory, not a build gate** — every
`%HaveSameMap` result is a V8 fact and V8 differs across 22.15.0, 24 and 25 (§8-B1).

- **SH1** a structure built from a full payload and one built from a two-field partial share a
  hidden class.
- **SH2** they still share it after `patch()` with one field and with several.
- **SH3** instances stay in fast-properties mode.
- **SH4** a deliberately conditional constructor, checked in as a **negative control**, fails SH1 —
  proving the suite can detect the thing it exists to detect. Without SH4 the whole shape suite
  passes vacuously, and it is also what catches V8 renaming the natives.

### 7.6 Naming — `N`

Runs in the normal suite, using the TypeScript compiler API.

- **N1** every structure field is the mechanical camelCase of a real field on the corresponding
  `API*` type, or is in the rename allowlist **with a reason**. Write and run this before a single
  structure is written (§8-A14).
- **N2** no structure field name contains `_`.
- **N3** a field present on an API type and mirrored by no structure is reported as a **warning**,
  not a failure — drift detection, per ADR 3's reasoning.
- **N4** every emitted client event name is the mechanical camelCase of its wire name, or appears
  in `ClientEventNames.ts`'s deviation table with a reason.
- **N5** the wire values of `GatewayDispatchEvents` are unique, so a PascalCase inversion would be
  lossless — the guard that keeps N4's mechanical rule meaningful.
- **N6** snapshot: the sorted list of every emitted client event name matches a literal array in
  the test file. **This is the guard against a `@vestra/types` key rename silently renaming a
  public event**, and it works by making the rename a reviewable diff in a file whose whole purpose
  is to be reviewed.

### 7.7 Events, coverage and containment — `EV`, `EC`, `EE`

- **EC1** every dispatch name is a key of `handlers` or of `unhandledDispatchEvents`, with a failure
  message that **names the gaps**.
- **EC2** no name is in both.
- **EC3** no key of either object is absent from `GatewayDispatchEvents` — the mirror of the types
  package's stray-key check; catches a typo and a stale entry after Discord renames an event.
- **EC4** `handlers[k].name === k` for every entry. The runtime half of the correlation the type
  system cannot prove.
- **EC5** the assertion is set arithmetic over `Object.values(GatewayDispatchEvents)`, with **no
  count constant anywhere in the file**. A constant that must be bumped by hand is a second thing
  to forget.
- **EC6** (compile-time) `[Exclude<GatewayDispatchEvents, HandledDispatchEvents | UnhandledEvent>]
extends [never]`. Kept as a belt-and-braces companion to EC1, not as its replacement — verified
  that its failure message names no event, which is why the runtime form is primary.

**Does the coverage test require a handler for all 76? No, and that is the design.** It requires
every event to be _accounted for_, with a one-line escape hatch that demands a sentence. Three
reasons, two of them precedents already set here: ADR 3 runs drift detection on a schedule and
never on pull requests, on the stated ground that a contributor must never be blocked because
Discord shipped a field this morning; `packages/types/test/gateway.test.ts` resolves the identical
tension identically ("map it to `unknown` explicitly — that is the same type a missing row
produces, but it is a decision on the record instead of an oversight"); and the `raw` event means
an unhandled event is still fully reachable, so the opt-out costs a convenience and never a
capability. Rejected: an fs scan of `handlers/` asserting every file appears in the registry — EC1
already fails in that case, so the scan only adds value when a contributor makes two mistakes at
once, and it costs the suite a dependency on the `dist/` layout. Rejected: warning at runtime on an
unhandled `t` — one log line per `TYPING_START` is a flood, and the information is in
`unhandled.ts` where it can be read without running the bot.

- **EV1** `harness.dispatch('MESSAGE_CREATE', fixtures.message())` emits `messageCreate` exactly
  once with a `Message`; inside the handler, `data` is `GatewayMessageCreateDispatchData` and
  reaching for a branch-only field compiles. Half of this test is the compiler's.
- **EV2** the handler receives the **identical** `payload.d` object — identity, not deep equality.
  A copy on the hot path would be a defect.
- **EV3** a `t` that is **not in `GatewayDispatchEvents` at all** — a hypothetical new Discord
  event, constructed with a cast — routes to nothing, does not throw, and still fires `raw`.
- **EV4** an unhandled event fires `raw` and emits no derived name.
- **EV5** `raw` fires **before** the handler runs, and `replayed` reaches it unchanged.
- **EV6** (compile-time) `handlers.MESSAGE_CREATE.handle` accepts
  `GatewayMessageCreateDispatchData` and rejects `GatewayReadyDispatchData`.
- **EV7** (compile-time) a handler registered under the wrong key fails to compile, using two
  events that share a data type (`CHANNEL_CREATE`/`CHANNEL_DELETE`) — the case verified to slip
  through without the `name` field, so this is its regression guard.
- **EV8** (compile-time) `handlerFor(handlers, payload.t)` on an un-narrowed payload compiles.
- **EE1** a throwing handler produces `client.emit('error', EventHandlerError)` and `routeDispatch`
  returns normally; the next dispatch still routes. A dispatch stream that dies on one malformed
  payload is a bot that stops responding with no close event.
- **EE2** a throwing **user listener** does the same, and `fleet.current.sends` still grows
  afterwards — proving the shard's read loop survived.
- **EE3** a throwing cache `filter` is contained identically.
- **EE4** with no `error` listener, the failure arrives as an `uncaughtException` on a later tick,
  not synchronously — assert via `process.once('uncaughtException')` and a `setImmediate` barrier.
- **EE5** an `error` listener that itself throws does not unwind into the caller.

**Handler specifics worth their own cases** — **EV9** `guildCreate` with an unavailable payload
emits `guildUnavailable` and caches nothing. **EV10** `guildCreate` while `shard.guildsPending`
emits `guildAvailable`, not `guildCreate`. **EV11** `channelDelete` emits the cached channel and
the cache no longer holds it. **EV12** `messageUpdate` on an uncached message emits a `Message`
built from the partial and `changes === null`, never a fabricated previous object.

### 7.8 Serial mode — `Q`

- **Q1** two dispatches with an async listener complete in order.
- **Q2** a slow listener on shard 0 does not delay shard 1's dispatches.
- **Q3** overflow past `maxQueued` emits `dispatchDropped` and discards the **newest**.
- **Q4** default mode: the second dispatch's handler runs _before_ the first dispatch's async
  listener resolves — pinning the documented non-guarantee so nobody "fixes" it into an await.
- **Q5** a second READY empties the queue.
- **Q6** a listener whose promise rejects is reported through the router's `error` path rather
  than vanishing. Not in the original list, and needed: awaiting a promise marks it handled, so
  a rejection that reached `unhandledRejection` on the default path would go silent the moment
  serial mode was switched on.
- **Q7** a `RESUMED` dispatch leaves the backlog alone — the other half of Q5, and the half a
  "clear on any reconnect" reading gets wrong.

### 7.9 Replay and reconnect — `R`

- **R1** a `MESSAGE_CREATE` delivered with `replayed: true` **is** written to the cache and **does**
  emit `messageCreate`. The regression test for the tempting-but-wrong rule.
- **R2** cached guilds survive a resume **by identity**: `assert.equal(guildBefore, guildAfter)` on
  the same reference.
- **R3** the same dispatch applied twice leaves the cache byte-identical to applying it once —
  table-driven over the whole registry, for every handled event with a fixture. This is what
  enforces the absolute-writes rule and it is the reason fixtures are worth the effort.
- **R4** `guild.memberCount` is unchanged by `GUILD_MEMBER_ADD`, live or replayed;
  `THREAD_MEMBERS_UPDATE` assigns `member_count` absolutely and is stable under double
  application. Built as **R6** in `packages/core/test/replay.test.ts`, which asserts the fixture
  actually moves the count first so it cannot pass vacuously.
- **R5** `GUILD_MEMBER_UPDATE` for an uncached member creates nothing.
- **R6** `GUILD_UPDATE` merges: `memberCount`, `joinedAt` and `large` survive it.
- **R7** `GUILD_CREATE` with `unavailable: true` marks the guild unavailable rather than replacing
  it; `GUILD_DELETE` with `unavailable: true` marks it unavailable, and `unavailable` **absent**
  removes it. The outage-versus-kicked distinction (§8-A3 asks whether Discord actually behaves
  this way).
- **R8** after a fresh identify, a guild absent from the new guild stream is dropped once the stream
  completes, along with its channels and roles, while another shard's guilds are untouched.
- **R9** a channel deleted during downtime is removed by the `GUILD_CREATE` set difference.
- **R10** the cache is **not** cleared on reconnect or re-identify.

### 7.10 Lifecycle, options, wiring, package guards — `L`, `O`, `W`, `PK`

- **L1** `login()` resolves after the first shard's READY, not when the socket opens — assert with
  a transport that opens and sends nothing: the promise is still pending.
- **L2** `login()` rejects with `SessionLimitError` when preflight's `remaining` is below the shard
  count, and **zero** transports were constructed.
- **L3** a 4004 close before READY rejects `login()`, emits `error`, then `invalidated`, and every
  other shard is destroyed.
- **L4** a 4014 close on shard 3 of 4 tears down shards 0, 1 and 2.
- **L5** `loginTimeout: 50` rejects and does **not** destroy the fleet; the shards are still
  connected afterwards.
- **L6** `ready` fires once, after every shard's READY _and_ its guild stream settling, and
  `client.user` is populated when it does.
- **L7** with `intents` lacking `Guilds`, `ready` fires at READY with no guild-stream wait.
- **L8** `ready` does not re-fire when a shard reconnects and re-identifies.
- **L9** `whenReady()` called after `ready` has fired resolves immediately.
- **L10** `whenReady({ signal })` rejects on abort and leaves the client running.
- **L11** `destroy()` is idempotent; the second call resolves and issues no further closes;
  `destroy()` before `login()` does not throw.
- **L12** `destroy({ resumable: true })` closes with 4000 and leaves a session in the store;
  `destroy()` closes with 1000 and leaves none.
- **L13** `destroy()` rejects pending `whenReady()` promises and pending member-chunk requests, and
  `timers.pending === 0` afterwards — every timer the client took out was handed back, the
  sweeper's included. The manual clock is what makes "cleanly" an assertion instead of an adjective.
- **L14** method calls after `destroy()` throw `ClientError`.
- **L15** `destroy()` **mid-handshake** (after `hello`, before `ready`) stops `fleet.created` from
  growing. Shutting down during a reconnect and getting a reconnect anyway is the classic version
  of this bug.
- **L16** a `ShardBridge` is attached before `shard.connect()` — script a transport that delivers
  Hello and READY synchronously on `connect()` and assert `shardReady` was observed.
- **O1** `userAgent` set once reaches both `client.rest.options.userAgent` and the shard options.
- **O2** `timers` set once is used by the gateway **and** by cache sweeps.
- **O3** `intents` as an array folds to the same bit set as the `|` form.
- **O4** `gateway.throttler` and `gateway.sessionStore` reach the `ShardManager` **by identity**,
  not by copy — the multi-process path depends on the same object being shared.
- **O5** a `REST` instance passed in is used as-is and `setToken` is not called on it.
- **O6** `fetchGatewayBot` defaults to a call on `client.rest.gateway`, and an explicit override
  replaces it.
- **O7** (compile-time) adding a field to `ShardManagerOptions` makes it available under
  `ClientOptions['gateway']` with no edit to core.
- **O8** options explicitly set to `undefined` do not reach the gateway as `undefined` values — the
  `exactOptionalPropertyTypes` conditional-spread rule, checked by asserting the constructed object
  has no own property for an omitted field.
- **O9** a REST/gateway `version` mismatch emits `debug` and does not throw.
- **W1** `guild.members.fetch()` sends op 8 on the shard that owns the guild —
  `(guild_id >> 22) % shardCount`, asserted against that shard's sent payloads, not the current one.
- **W2** `GUILD_MEMBERS_CHUNK` reaches `MemberChunker.handleChunk`; the promise resolves with
  `APIGuildMember[]`, mapped to `GuildMember`s; they land in the cache only when `members` caching
  is on (**CU1** is the other half).
- **W3** `RATE_LIMITED` routes to `MemberChunker.handleRateLimited` and is not treated as an unknown
  event. `RATE_LIMITED` was added to the types in Phase 3 specifically so this wire exists.
- **W4** a fresh identify calls `chunker.reset(error)`, so a member request outstanding across the
  reconnect rejects instead of hanging forever.
- **W5** `login()` calls `fetchGatewayBot` exactly once regardless of shard count.
- **PK1** every handler file's export appears in `registry.ts`. Writing the handler and forgetting
  the registry line is the one mistake CONTRIBUTING's two-step contribution flow invites.
- **PK2** the compile-time coverage pair (EC6) lives in `event-coverage.test.ts` so its failure
  names the right problem.
- **PK3** pass-through identity: `import { Shard } from '@vestra/core'` is the **same object** as
  `@vestra/gateway`'s. Verified that an explicit re-export shadowing a star export is not a compile
  error, so core can replace a lower package's symbol with its own and nothing will say so.
- **PK4** `tests/zero-dependencies.test.ts` and `tests/cjs-interop.test.ts` cover core automatically
  once it has real code — which means the sweeper must be armed in `login()`, never at module
  scope, or `require(esm)` breaks for every CommonJS consumer.

**Benchmarks**, under `scripts/bench/`, run on the CI floor: `structure-construction.ts`
(hand-written versus generic on a realistic `MESSAGE_CREATE`), `cache-dispatch.ts` (adapter
call-site shape count, per-entry memory — landed as `adapter-shapes.ts` and `cache-memory.ts`),
and `dispatch-overhead.ts` (the cost of the extra `raw`
emit, and of serial mode's microtask). Nothing from §0.3's scratch bench may be quoted in
user-facing documentation until the first of these exists.

**CI matrix: 22.15.0, 24.x, 25.x** — unchanged from `.github/workflows/ci.yml`. Nothing in core's
suite touches the network, so unlike Phase 3's X-group there is no environment-conditional skip.
The `--allow-natives-syntax` shape pass is a second invocation on the same matrix.

### 7.11 What this suite cannot tell us

Every scenario above runs against payloads we wrote, built from types we hand-wrote (ADR 3). **A
fixture-based suite cannot catch a field Discord actually sends differently from how we typed it.**
It proves internal consistency and nothing about Discord. That is not a gap more unit tests close:

- **Real payload shapes.** Whether `GUILD_CREATE`'s embedded `members`, `channels`, `threads` and
  `presences` arrays are complete enough to seed the cache without a REST follow-up, and how large
  they are — which also bears on Phase 3 §8-C5's invented ceilings. Proposal:
  `scripts/capture-dispatches.ts` on the testing bot writes a corpus; a core test constructs every
  structure from it and asserts no throw and no `undefined` where the type says required. That turns
  a live observation into a regression test, the way Phase 3's golden-frame Z7 does. **Caveat before
  anyone runs it:** a live corpus is real user data — ids, usernames, message content. It gets
  captured in a private test guild and scrubbed, or it does not get checked in (§8-A18).
- **§5.2's premise.** Whether Discord ever replays a dispatch already applied. R3 proves the
  handlers are idempotent; only live traffic can say whether it was necessary.
- **R7's distinction.** Whether `GUILD_DELETE` genuinely omits `unavailable` on a kick and sets it
  on an outage. Both branches are testable in isolation; which one Discord sends is not.
- **Member chunking at scale.** `chunk_count` / `chunk_index` over a genuinely large guild,
  `not_found` behaviour, whether presences arrive. A 250k-member guild cannot be scripted honestly.
- **Memory.** The default cache's real footprint for N guilds is a benchmark, not a test, and per
  CLAUDE.md no number goes in the docs without one. ADR 4's entire justification is a memory claim
  this suite does not measure.
- **Cost on the hot path.** Core adds cache writes and structure construction between the socket and
  the heartbeat. Whether that measurably increases `heartbeatDrift` under load is a benchmark
  against a busy shard, and it is the one performance question core actually owns.
- **Multi-process fleets.** Shard routing, a shared `IdentifyThrottler`, cross-process resume and
  the op-8 per-guild gate are all live-only, and Phase 3 already parked them there.

---

## 8. Must verify before implementing

Nothing in this section is settled. None of it is promoted to a confident rule anywhere above;
each item is cross-referenced from the rule that depends on it.

### A. Protocol, repository and design unknowns

- **A1. Does Discord ever redeliver an already-processed dispatch on resume, or only gap-fill?**
  Nothing in Phase 3's verification work covers it. §5.1 frames replay as gap-fill; §5.2's
  absolute-write rule is correct either way, but the difference decides whether idempotency is a
  correctness requirement or a defensive property. **Measurable on the live bot:** process to
  sequence _N_, close 4000, resume, record the first replayed `s`. If it is ever ≤ _N_, the
  framing is wrong and the rule becomes load-bearing rather than merely tidy. The `SessionStore`
  sequence-lag mechanism (§5.2) is certain and derived from this repo's own code; what is unknown
  is whether the protocol has one too.
- **A2. `payload.t` may at runtime be a string outside the closed 76-member union.** Discord ships
  new events without warning and the gateway hands them straight through. Treated as certain rather
  than verified, because the alternative is unrecoverable: a throwing `default` turns a new event
  into a crash on every occurrence. §7 **EV3** asserts it regardless.
- **A3. Does `GUILD_CREATE` re-arrive for every guild after a RESUME?** If it does,
  `shard.guildsPending` is false at that moment and every guild emits `guildAvailable` — probably
  right, and unverified. If it emitted `guildCreate` instead, the consequence is duplicated
  join-side effects on every reconnect. Measurable on the same live run as A1. Relatedly, whether
  `GUILD_DELETE` genuinely omits `unavailable` on a kick and sets it on an outage (§7 **R7**).
- **A4. Handler faults and listener faults are reported identically**, both as `EventHandlerError`
  naming the gateway event, so a consumer's typo reads as a library bug. Separating them costs the
  uniform handler shape (§4.7). The trade is not settled.
- **A5. Is `allReady`'s optimism acceptable for `client.ready`?** A shard that reaches READY, drops,
  and is reconnecting when the last shard readies will still let `ready` fire. Alternatives: gate on
  live state instead of first-READY, or leave it and document it. Documented is what §5.4 assumes.
- **A6. Who should own the op-8 30-second per-guild gate?** Core owns `MemberChunker` (§1.1), so the
  gate is per process. Phase 3 §8-A16 leaves it unresolved whether Discord scopes the limit per bot
  or per session; if per bot, the gate must be shareable across processes exactly like
  `IdentifyThrottler`, and core is the wrong side of the boundary to share it from.
- **A7. Should a fatal error on one shard really destroy the fleet?** The argument is that every
  `Reconnect: false` close code is a configuration fault and configuration is fleet-wide. It is not
  airtight: 4010 "invalid shard" during a rolling reshard could in principle affect one manager and
  not another.
- **A8. Does `GUILD_CREATE` after a fresh identify always carry the complete channel and role
  lists?** §4.14 step 4's set-difference reconciliation is only sound if it does. Believed yes; the
  types say `channels: APIChannel[]` with no partiality marker, which is suggestive rather than
  conclusive.
- **A9. Roles cached by default** is a deviation from ADR 4's literal three and needs sign-off, with
  the nested-in-guild-record form as the fallback. §4.9.
- **A10. Threads: own scope defaulted off, or folded into `channels` with a TTL?** The first is
  specified because it invents no numbers; the second is friendlier and needs a TTL nobody can
  justify. It changes what `message.channel` returns by default for a thread message.
- **A11. Is `max` a per-scope global bound or a per-group one?** ADR 4's example,
  `messages: { max: 50, ttl: 300_000 }`, is ambiguous, and discord.js's equivalent is **per
  channel**. This design reads it as global, because that is the only reading where the number is a
  memory bound a user can reason about. The cost is that "the last 50 messages of every channel" is
  inexpressible, and a user migrating will get something very different from what the same number
  meant before. A follow-up `maxPer?: CacheScope` grouping bound is the obvious extension and is
  deliberately not in 1.0. **This needs an explicit decision before the option is documented,
  because changing it later is a breaking change to the meaning of a number — the worst kind.**
- **A12. The current user as a field rather than a scope** is stricter than ADR 4 but not literally
  what it says. Confirm the reading, or make it a `max: 1` scope that rejects `false`.
- **A13. The `debug` event's granularity.** Specified as lifecycle-only and never per-dispatch, with
  string construction guarded by `listenerCount('debug')`. Whether people then ask for per-dispatch
  debug — and what it costs on the hot path — is not settled, and nothing about it should be
  benchmarked by assertion.
- **A14. Is the mechanical camelCase rule unambiguous across all 58 payload files?**
  **Answered — yes.** `packages/core/test/naming.test.ts` reads every exported `API*` type
  through the TypeScript compiler API and checks the whole surface. Across **429 distinct field
  names**: zero collisions under the mechanical rule, zero doubled or edge underscores, zero
  digits following an underscore, and zero already-mixed-case names. The rule is injective and
  reversible over the entire payload surface, so no allowlist entry is needed for ambiguity —
  the allowlist in §4.15 carries only the deliberate renames.

  Written and run before any structure was, as this entry asked. The guards were checked by
  injecting a `guildId` field into `APIStageInstance` and confirming N2 and N5 both fail, so
  they are pinned to the real property rather than passing over an empty set.

- **A15. Which fields each structure mirrors.** §4.17 admits the curated-field-set position without
  doing the per-structure pass. `Guild` in particular needs a field-by-field decision, and that
  decision determines whether `Guild.ts` is 300 lines or 600.
- **A16. Does a bot ever receive a DM channel object over the gateway** (a `CHANNEL_CREATE` for a
  DM)? Decides whether the unbounded `channels` default is bounded by guild count or by how many
  people DM the bot. Believed no; not verified.
- **A17. How does core reach `mock-transport.ts`?** The widened-`rootDir` route is verified to
  compile and is the recommendation; the private `@vestra/test-utils` package is the cleaner
  long-term answer and this is the moment to choose. Needs sign-off because it changes how test
  projects are configured repo-wide.
- **A18. Where does a live dispatch corpus live, and how is it scrubbed?** Real captured payloads
  carry user ids, usernames and message content. Checking them in unscrubbed is a privacy problem,
  not a test-fixture problem.
- **A19. `GatewayDispatchEventMap` is declaration-mergeable and `GatewayDispatchEvents` is not**, so
  a consumer who adds an event gets payload typing and no client event name. Because §4.4 emits
  nothing for unhandled events, `client.on('raw')` is already the answer and the asymmetry is
  smaller than it looks — but it should be documented rather than discovered.
- **A20. `version` is declared independently on `RESTOptions` and `ShardOptions`.** §4.1 emits
  `debug` on a mismatch. If a mismatch turns out to matter more than that, it wants a shared options
  module upstream rather than a warning in core.
- **A21. Interactions.** Whether Phase 4 grows a REST prerequisite for the interaction callback
  routes (recommended) or 1.0 ships without interaction structures. §1.3. This is a scope decision
  for the phase owner and it is the largest single open item in the document.

### B. Compiler and runtime unknowns

- **B1. Every V8 result in §0.3 ran on Node v25.8.1; the floor is 22.15.0.** The `declare` emit and
  the `exactOptionalPropertyTypes` behaviour are compiler facts and will not vary by Node version,
  but **every `%HaveSameMap` result is a V8 fact**. The shape suite (§7.5) is therefore advisory —
  a failure on one Node version is a signal to investigate, not a build break — and it must be run
  on the floor before any of §0.3's shape claims are repeated as fact. The `EventEmitter` and
  zlib-callback probes have the same caveat.
- **B2. `%HaveSameMap` and `%HasFastProperties` are undocumented V8 internals with no stability
  guarantee.** The suite skips when they are unavailable, and would also silently stop testing
  anything if V8 renamed them. **SH4**, the negative control, is what keeps that from passing
  unnoticed.
- **B3. `Client extends EventEmitter<ClientEvents> implements EventContext` was never compiled.**
  Whether Node's typed `EventEmitter.emit` satisfies the `EventContext` member under
  `exactOptionalPropertyTypes`, and whether a ~100-key event map hits an inference-complexity limit,
  are both unchecked. Everything about the registry typing was compiled; this was not, and it is the
  one place the type story could still fall over. If it does, the fallback is to drop `emit` from
  `EventContext` and pass a narrower `emitClientEvent` callback.
- **B4. Serial mode's `rawListeners` plus manual invocation.** Whether it preserves `once` removal
  correctly and how it interacts with `captureRejections` was reasoned about, not tested.
- **B5. Diagnostic quality when a listener signature is wrong.**
  `client.on('messageCreate', (m: string) => …)` should produce something a beginner can read. A
  hand-written interface over ~100 keys is much likelier to than a mapped type was, but it has not
  been checked, and it should be before the API is published.

### C. Vestra policy — invented here, and its TSDoc must say so

- **C1. Structure identity stability across a resume** (§5.3). A promise to consumers, not a
  protocol requirement, and it constrains every handler to patch rather than replace, forever.
- **C2. Refusing to maintain `guild.memberCount` and reaction counts from events at all**, accepting
  staleness rather than drift. A genuine behaviour difference from discord.js that ADR 4 requires be
  documented as such.
- **C3. The 26-handler Phase 4 set**, and therefore the 50 entries in `unhandled.ts`. Nothing decides
  which events are "core" except judgement.
- **C4. The event-coverage test accounts for all 76 events but does not require a handler for all 76.** The one-line opt-out is invented, though it follows two precedents already in the repo.
- **C5. Every entry in `unhandled.ts` must carry a reason string.** Enforced only by
  `Partial<Record<GatewayDispatchEvents, string>>` and by review.
- **C6. `maxQueued` = 1024 payloads per shard in serial mode**, and **drop-newest** on overflow. No
  basis for the number; the drop-newest reasoning is sound but the choice is still Vestra's.
- **C7. Write-recency eviction** (Map insertion order, refreshed on write via delete-then-set, never
  on read) as the only built-in strategy. ADR 4 specifies a maximum entry count and no order.
- **C8. TTL refreshed on write, not on read.** Undecided by ADR 4.
- **C9. `sweepInterval` of 60,000 ms**, `null` to disable, and **an active sweeper at all** in
  addition to lazy expiry. ADR 4 mentions TTL, not sweeping.
- **C10. Unknown `ChannelType` falls back to the base `Channel`** rather than being dropped or
  throwing.
- **C11. Structures never throw on partial payloads**; absent fields are `undefined`. Follows from
  ADR 4's tolerate-absence rule, but the no-throw guarantee is broader than ADR 4 states. Same for
  keeping `Attachment`, `Embed`, `Sticker`, `Reaction`, `MessageReference`, `Poll`, `Activity` and
  `Presence` as raw `API*` types — reasoned from hot-path cost, not measured.
- **C12. Emitting `(message, changes)` rather than `(oldMessage, newMessage)`.** The clone findings
  make the conventional signature genuinely expensive, but breaking convention is policy and needs a
  migration note, not a changelog line. Same for cutting `VoiceState` and `Emoji` as structures — a
  consistent application of §4.17's criterion and a break with every other Discord library.
- **C13. `toString()` on `User`/`GuildMember`/`Role`/`Channel` and deliberately not on `Message` or
  `Guild`.** Defensible and inconsistent by construction.
- **C14. The rename allowlist for non-mechanical field names** — currently one entry,
  `Message.timestamp` to `sentTimestamp`. Every future entry is a papercut users must learn, so
  each must carry a stated reason in the test data. Keeping Discord's American spelling (`color`)
  while repo prose stays British is the same kind of call.
- **C15. Requiring `ClientOptions` to expose REST and gateway seams** (`fetch`, `transport`,
  `fetchGatewayBot`). Testability is the only argument for it; it is otherwise public API driven by
  the test suite.
- **C16. `login()` resolving on first READY**; `loginTimeout` existing at all, with its `null`
  default following `rateLimitTimeout`'s recorded reasoning; `destroy()` being terminal and clearing
  the cache; fleet-fatal escalation and the `invalidated` event name (borrowed from ecosystem
  convention, not from any Vestra source); `ready` being one-shot and carrying a non-optional user;
  not forwarding `RESTEvents`; `client.rest` as the sole client-level REST entry point.
- **C17. `EventContext` and `DispatchShard` as narrowed views** rather than `Client` and `Shard`. A
  judgement about what a handler should be able to reach.
- **C18. `raw` emitted before the handler runs**, so a raw consumer sees wire order and still sees
  the payload when a handler throws. Cost: raw listeners observe pre-cache state. Defensible either
  way.
- **C19. `EventHandlerError` as the wrapper type**, and the `setImmediate(() => { throw })` re-raise
  when there is no `error` listener. The containment requirement is verified; this shape of it is
  invented.
- **C20. `{ max: 0 }` collapsing to `enabled: false`**, and invalid policy values throwing at
  construction rather than degrading. **A write that fails `filter` deleting any existing entry**
  for that key. **`:` as the composite-key separator.** **Flat composite keys** (`guildId:id`) for
  members, presences and voice states. **`CacheStore.add` returning its argument** whether or not the
  value was stored. **`AsyncCacheSource` as an optional adapter extension** consulted only by
  `fetch*`, which always returns a promise even on a hit. **Generation-stamp reconciliation** run on
  the guild-stream-complete signal rather than at READY, and scoped to `guilds` only. **Not clearing
  the cache on reconnect or re-identify.** **`guild.members` returning arrays that skip unresolved
  ids** rather than `undefined` per id.
- **C21. The default scope table itself** — guilds, channels and roles on and unbounded; threads,
  members, users, messages, presences, voiceStates, emojis and stickers off. Only the first two and
  the current user come from ADR 4.
- **C22. Every per-file line-count estimate** in §2, and the ~83-file / ~8,000-line total. Calibrated
  against `@vestra/gateway` and against Phase 3's own estimates, which ran 26 files against 33
  shipped and 48% low on the largest file.
- **C23. The rule that handlers import concrete structure files rather than `structures/index.ts`**,
  and the suggestion to enforce it with `no-restricted-imports`. Also treating the ~300-line
  convention as satisfied by moving computation to sibling modules while `Guild.ts` and `Message.ts`
  sit at the limit.
- **C24. §4.17's structure cut list and the criterion behind it** — "identity, plus a cache entry or
  a route or computed behaviour". A rule invented here, applied consistently including where it hurt,
  and a different phase owner could reasonably draw the line elsewhere.

### D. Unresolved measurement

- **D1. The 25–36x hand-written-versus-generic figure. MEASURED, and one half of it was wrong.**
  `scripts/bench/structure-construction.ts`, Node 25.8.1, best of five passes, twelve payload
  variants:

  |                              | ns per object | against hand-written |
  | ---------------------------- | ------------- | -------------------- |
  | hand-written, fixed order    | ~95           | —                    |
  | generic, camelCase per key   | ~2,500        | **~26x**             |
  | generic, precomputed key map | ~550          | **~5.6x**            |

  The magnitude held at the low end of "~25–36x". The **attribution did not**: the scratch bench
  recorded the precomputed-keymap variant as "still ~25x slower, isolating the cause to keyed
  stores", and it is 5.6x. Most of the original figure was the name conversion. Keyed stores are
  still ~5.6x and still unrecoverable, so §4.15's conclusion stands — on a smaller number than
  the one that was quoted for it.

  The scratch bench also over-measured the hand-written side by letting it be optimised away. It
  reported 40.8M ops/s (~24ns); with the result forced to escape, as a real structure does into a
  cache, it is ~95ns.

  **The decisive argument is confirmed with a caveat.** A consumer reading one field costs
  **~2.2x** off generically-built objects — but only past four payload variants. The first
  version of this benchmark used three and found the generic transform _faster_ to read from,
  because V8 stays fast while polymorphic. §4.15's argument is specifically about
  **megamorphism**, and it is now written that way.

- **D2. Eager sub-structure conversion. MEASURED, and it is a memory decision rather than a speed
  one.** Same benchmark:

  |                                    |                                |
  | ---------------------------------- | ------------------------------ |
  | `new User` alone                   | ~35ns, **~38%** of a `Message` |
  | eager `Message`, author never read | ~90ns                          |
  | lazy `Message`, author never read  | ~10ns, so eager is **~9x**     |
  | lazy `Message`, author read once   | ~40ns                          |
  | retained, the payload alone        | 1,008 bytes                    |
  | retained, eager `Message`          | **744 bytes**                  |
  | retained, lazy `Message`           | **1,072 bytes**, **44%** more  |

  So the concern was real and it points the other way from the conclusion: eager conversion does
  cost ~9x per message for a bot that never touches `message.author`, and it is still right. The
  eager structure retains **less than the payload it was built from**, because it drops the
  fields it does not model — `components`, `sticker_items`, `referenced_message` and the rest —
  while the lazy one pins all of them for as long as the message is cached. Under ADR 4, where
  memory is the constraint that made caching opt-in at all, 44% per cached message is worth 80ns
  of CPU that is not on the socket path.

  What must not be repeated is the framing: eager conversion is **not** faster, and nothing in
  the repository should say it is.

- **D3. Per-entry memory. MEASURED.** `scripts/bench/cache-memory.ts`, Node 25.8.1, forced
  collection either side of each figure — it refuses to run without `--expose-gc` rather than
  reporting whatever garbage had not been swept.

  |                                     | bytes per entry        |
  | ----------------------------------- | ---------------------- |
  | two maps, expiry map unbuilt        | **116.7**              |
  | one map of wrapper records          | **156.5**, 34% more    |
  | `Role` in a grouped `CacheStore`    | **374.3**              |
  | the same store without `groupKeyOf` | **302.1**              |
  | the secondary index, by difference  | **~72**, 19% of a role |
  | `guildUserKey`, held                | **~104**               |

  **The two-map decision is confirmed**: the wrapper's second field is `undefined` on the
  default configuration and costs 40 B per entry for the privilege.

  **The roles estimate was 1.8x low.** §4.9 said ~200 B per role and "roughly 20 MB" for 2,500
  guilds; it is 374 B and **35.7 MB**, and that is a floor — the fixture's names are short and
  no role carries an `icon`, a `unicode_emoji` or `tags`. §4.9 now carries the measured figure.
  The deviation still stands on it.

  **Grouping is not free.** `group()` support costs ~72 B per entry, which is a fifth of a
  cached role. Worth knowing before a scope is given a `groupKeyOf` it does not need.

- **D4. Adapter call-site shape count. MEASURED, and the guess was off by one.**
  `scripts/bench/adapter-shapes.ts`, Node 25.8.1, best of five passes, eight stores in every
  case so only the class count varies:

  | adapter classes sharing the call site | ns per read |
  | ------------------------------------- | ----------- |
  | 1                                     | ~17         |
  | 2                                     | ~17         |
  | 3                                     | **~40**     |
  | 4, 5, 6, 8                            | ~40, flat   |

  §4.11 predicted the threshold at four. It is at **three**, and it is a step rather than a
  slope: ~2.2x, paid once, and no worse at eight than at three. Core ships two adapters, so the
  shipped configuration sits on the last fast step and a user's first custom adapter is the one
  that crosses.

  Two confounds had to be removed before the number meant anything, and both made the effect
  look larger than it is. Selecting a store with `index % shapes` made one and two classes look
  fast because the modulo was cheaper, not the call. Building one store per class made the
  three-class case walk three times as many `Map`s — a cache-locality difference wearing an
  inline-cache costume. The benchmark now uses a precomputed rotation and a fixed eight stores.

  This does not reopen ADR 1: 22ns on a cached read against a ~140ns dispatch is not a reason
  to make the cache unpluggable.

- **D5. The extra `raw` emit costs one additional `emit` per event on the hot path** whether or not
  anyone listens, and serial mode costs a microtask per dispatch. Per CLAUDE.md both needed a
  benchmark before any claim, including the claim that they are free. **Both halves are now
  measured.**

  `scripts/bench/raw-emit.ts`: the unwatched emit is **~10ns**, and **~13ns** with a listener
  attached, against a **~140ns** `CHANNEL_UPDATE` dispatch. Routing with the emit and routing
  with it suppressed differ by **±0.7%**, which is inside the run-to-run spread of the route
  measurement itself — so the honest statement is not "it is free" but "it is too small for this
  benchmark to separate from noise, and it is ~7% of a dispatch when measured on its own".

  `scripts/bench/dispatch-queue.ts`: **the serial-mode claim was wrong** — with no async
  listeners the batch is empty and the path never yields. §4.8 carries the figures.

  Both take the best of five passes rather than a mean. Every source of error in a
  microbenchmark makes a pass slower and none makes it faster, and a single-pass mean gave the
  route cases a 133–246ns spread that buried a 10ns difference entirely.

- **D6. Whether the single-hidden-class property survives contact with reality. HALF CLOSED, and
  it is now asserted rather than argued.** The property was argued from how V8 works and probed
  by hand against two or three payload variants — and never asserted anywhere, so nothing
  stopped a future contributor from adding one `if (data.x !== undefined)` to a constructor and
  silently undoing the reason forty structures are hand-written.

  `packages/core/test/hidden-class.test.ts` puts it to V8 directly with `%HaveSameMap`, out of
  process because the native needs `--allow-natives-syntax` and the test runner does not pass
  it. **HC1** builds a `Message` from thirty distinct payload subsets and asserts one map and
  one key set across all of them; **HC2** asserts `patch()` does not split it; **HC3** is the
  control, a deliberately conditional constructor that must produce many — without it the first
  two could be passing because the technique does not work.

  Mutation-proven both ways, and one of the mutations is worth recording because it _failed_ to
  break anything: making the constructor skip `webhook_id` when absent changes nothing, because
  that field is absent from every variant and the shape stays uniform. Skipping `content`, which
  some variants carry and others do not, fails HC1 immediately. The property being guarded is
  divergence, not omission.

  **Still open:** captured live traffic. Thirty synthetic subsets from one field list is a
  stronger probe than the two or three that came before it and is still not a real bot's
  `MESSAGE_UPDATE` stream — the corpus §7.11 proposes.

---

### 8-F. Corrections from implementation

Found while building the slice, and recorded here because each contradicts something stated
above.

- **F1. The fixed-field-order rationale is imprecise, and the mechanism is not the constructor.**
  §4.15 argues that assigning every field in a fixed constructor order is what keeps one hidden
  class, and that "a constructor that skips absent fields produces a different shape". Under
  `useDefineForClassFields` — the default at `target: es2023`, which `tsconfig.base.json` sets —
  a bare field declaration emits `bot;` into the class body, and that defines the property as
  `undefined` **before the constructor runs**. So the shape is fixed by the _declaration list_;
  a constructor that conditionally assigns a declared field does not change it. Verified by
  injecting a conditional assignment and watching the shape test still pass.

  This does not make the rule wrong, it makes its reason conditional on how fields are written,
  and the difference matters for §4.16: fields written with `declare` emit nothing, so for
  those the constructor **is** the only thing creating properties and its completeness is
  exactly what the argument claims.

  **Resolved: `declare`.** CONTRIBUTING.md:114 already required it — "Declare structure fields
  with `declare` and assign them in the constructor, so no redundant field initialisation is
  emitted before your assignment" — and the first structures were written plainly, which
  contradicted the rule and cost a define and a set per field on the hot path. All structures
  now use `declare`, which both satisfies the house rule and restores the original rationale.
  §4.15's wording stands as written.

  `packages/core/test/structures.test.ts` **S7** covers it. A missing declaration cannot compile
  while the constructor assigns it, so the mistake actually guarded is `declare` plus a
  conditional assignment, which compiles cleanly and was confirmed to fail the test.

### 8-E. Inconsistencies found by review, unresolved here

**Status note.** E1, E3, E4 and E6 are settled by the implementation and marked below with what
settled them. E2 and E5 are still open. This section is kept rather than deleted because the
reasoning is the useful part.

An adversarial review of this document against the real source in `packages/gateway/src`,
`packages/rest/src` and `packages/types/src` found three blockers and several inconsistencies.
The blockers are fixed above — the `GuildReadyTracker` lifecycle (§4.3), the `login()` READY race
(§4.2) and the `FatalGatewayError` branch (§4.2). The rest are recorded here rather than
silently resolved, because each is a genuine choice and picking one in a document nobody has
implemented against would be guessing.

- **E1. Structure constructor argument order. RESOLVED: `(data, client)`.** §4.16 declared
  `constructor(client, data)` while §4.6 and §4.12 both wrote `(data, client)`. Settled on the
  majority spelling, which is also the house convention: every multi-argument constructor in the
  repository puts the subject first and collaborators after — `Shard(options, throttler)`,
  `ShardSession(store, shardId)`, `ZlibStream(hooks, limits)`,
  `ShardConnection(options, hooks, url, epoch)`. For a structure the subject is the payload and
  the client is context. §4.16's signature is the one to correct when it is implemented.
- **E2. The handled set contradicts the idempotency table. RESOLVED: the event is handled.**
  §4.6 fixed the handled set at 26 named events and put `THREAD_MEMBERS_UPDATE` among the
  unhandled, while §5.2 specified its replay behaviour and §7 tested it — so the table's
  showcase case described something that never ran. The registry now holds **50** handlers
  against 26 documented non-handlers, which is every dispatch Discord defines, and
  `THREAD_MEMBERS_UPDATE` is among them.

  Settling it did not need `ThreadMember` after all, which is why it sat open longer than it
  deserved. The cache effect §5.2 specifies is one assignment of `member_count` onto the
  cached thread, and the payload carries that absolutely. What the event _emits_ is where the
  missing structure would have bitten, so it emits `(thread, addedIds, removedIds)`: IDs are
  what a consumer acts on, they are what `cache.users` and `guild.members` are keyed by, and
  they do not change shape when `ThreadMember` is eventually modelled. `added_members` is
  absent unless the bot can see the members anyway, so an event built around it would be empty
  for most consumers.

  `RESUMED` stays unhandled and always will — a session mechanic, handled by `ShardBridge`, for
  the reason §4.6 gives about mechanics never being handlers. **R6** guards the assignment, and
  fails if it is turned back into an adjustment.

- **E3. `CacheStore.fetch(key)` is not implementable for messages. RESOLVED: there is no
  `fetch`.** The store ships without one at all, rather than with one that works on four scopes
  and not the fifth. A cache-backed accessor that is present but throws or returns `undefined`
  for structural reasons is exactly the "accessor that lies" ADR 4 forbids, and the flat-key
  decision (§2.3) is load-bearing enough not to reopen for it. Fetching stays explicit:
  `client.rest.channels.getMessage(channelId, messageId)`.
- **E4. `EventContext.user` is writable while `Client.user` is a getter. RESOLVED by not making
  them the same object.** The document assumed the client would satisfy `EventContext`
  structurally. It cannot, for an unrelated reason — Node's `EventEmitter` types `emit` over its
  own event map plus its built-ins, and no hand-written signature matches — so `Client` builds
  one context object per client instead. `EventContext.user` is a plain writable field the
  handlers assign; `Client.user` is a getter that reads through to it. One owner, no runtime
  assignment to a getter, and the narrowing the interface existed for is unchanged.
- **E5. Serial mode has no stated mechanism. RESOLVED: built, and the objection was wrong.**
  This entry previously called the feature unbuildable as specified, reasoning from
  `EventEmitter.prototype.emit` returning `boolean` before an async listener settles. That much
  is true and measured; the conclusion did not follow, because §4.8 never said the queue awaits
  `emit` — it said the client's `emit` invokes `rawListeners(name)` and awaits each in turn, and
  that is exactly what `Client.#dispatchEmit` and `events/DispatchQueue.ts` now do.

  Two of the three costs claimed here also turned out not to exist. Invoking a `once` listener
  through `rawListeners` **does** consume it — the wrapper Node stores removes itself when
  called — so the queue does not take over `once` semantics, and listener ordering is just the
  array order `rawListeners` returns. What survives is the third: a promise a listener returns
  stops being ignored and becomes a completion signal, so an unrelated `async` listener starts
  holding up its shard's queue simply by being `async`. That is documented on `serialDispatch`
  rather than being an obstacle, and it is why the mode is opt-in.

  One consequence worth naming: a rejection from an awaited listener promise would have gone
  silent, because awaiting a promise marks it handled. `EventRouter.report` is public for that
  reason and the queue routes rejections through it, so the failure behaves the same in both
  modes. Q6 guards it.

- **E6. `raw` is emitted outside the `try` in `routeDispatch` (§4.7). RESOLVED: it is emitted
  inside.** `EventRouter.route` puts it in the same `try` as the handler and says why — it runs
  consumer listeners like everything else, and a throwing `raw` listener escaping while a
  throwing `messageCreate` listener is contained would be an inconsistency with no defence. It
  fires before the handler, so a consumer watching `raw` sees the payload as it arrived rather
  than after the cache has been updated from it.

## 9. Suggested issues to open before coding

Per the working agreement that GitHub is the record:

1. **`GuildReadyTracker` and `MemberChunker` are exported, documented, unit-tested and unreachable
   from `@vestra/gateway`'s own code paths.** A defect against Phase 3, not planned work. Core works
   around it (§1.1); the gateway's own consumers cannot.
2. **`packages/core/test` is missing from the root solution `tsconfig.json`.** A repository gap that
   silently disables every type-level guard this document specifies. One line; open it first.
3. **`README.md` line 50 does not type-check under ADR 4.** `message.channel.createMessage(...)`
   with no optional chaining, against an accessor ADR 4 requires to be `Channel | undefined`. A
   genuine conflict, not a typo. Fix the README before the structure accessors are written (§4.17).
4. **The interaction scope decision** (§1.3, §8-A21): either a bounded REST prerequisite covering
   the interaction callback routes, or an explicit note that 1.0 ships without interaction
   structures. This is the one that most needs a decision on the record rather than in a
   conversation.
5. **The remaining REST route gaps** from §1.3 — pins, reaction deletes, thread creation, role
   edit/delete, guild channel creation, guild leave — as one grouped issue, since each blocks exactly
   one structure method.
6. **`ShardOptions` cannot carry an identify presence** though `@vestra/types` models it (§1.2
   item 1), and **`REST` cannot report whether it is authenticated** (§1.2 item 4). Two small
   gateway/REST issues that each remove a documented degradation from core.
7. **Sign-off on the two ADR 4 deviations**: roles cached by default (§8-A9) and the current user as
   a field rather than a scope (§8-A12). Either an amendment to ADR 4 or an ADR 8 recording them,
   because "the default adapter caches guilds, channels and the current user" is a sentence people
   will quote.
8. **The `max` semantics decision** (§8-A11) before the cache option is documented, because changing
   what a number means later is the worst kind of breaking change.
9. **A "verify against the live gateway before 1.0" issue** enumerating §8-A1, A3, A8 and A16, all of
   which are measurable on one live run with the testing bot, plus the corpus-scrubbing policy
   (§8-A18).
10. **The benchmark issues** (§8-D): `structure-construction.ts` blocks quoting any conversion
    figure, `cache-dispatch.ts` blocks every memory claim in the cache docs, and
    `dispatch-overhead.ts` blocks any statement about what `raw` costs. Serial mode's half is
    measured — `scripts/bench/dispatch-queue.ts`.
11. **The test-double sourcing decision** (§8-A17) — widened `rootDir` now, or `@vestra/test-utils`
    now — plus the `ManualTimers` extraction from `packages/gateway/test/fleet.test.ts`, which is an
    edit to Phase 3's tests and should be a deliberate commit rather than a surprise.
