# Contributing to Vestra

The structure of this repository exists so that you can find the one file you need to
change without understanding the whole library. If that ever stops being true, that is a
bug worth reporting.

## Getting set up

```bash
pnpm install
pnpm build         # turbo, which builds each package's own sources
pnpm typecheck     # tsc --build --force across the whole solution, tests included
pnpm test          # node:test, no test framework to learn
pnpm lint
```

**`pnpm build` does not typecheck the tests.** It runs `turbo run build`, and each package's
build task compiles that package's `src` only — `packages/*/test/tsconfig.json` are projects
in the root solution but not turbo tasks, so nothing in them is ever checked. A green
`pnpm build` is compatible with a test file that does not compile at all: change a
constructor signature and every call site in `src` fails while the ones in `test` stay
silent. Run `pnpm typecheck` before you trust it. CI runs it too, so this costs a round trip
rather than a broken release.

Node **22.15.0 or newer** is required. That floor is not arbitrary — it is the first
version with native zstd in `node:zlib`, which is what lets the gateway decompress Discord
traffic with no dependency at all.

## Where things live

| I want to...                         | Go to                                |
| ------------------------------------ | ------------------------------------ |
| Add or fix an API type               | `packages/types/src/`                |
| Add a REST endpoint                  | `packages/rest/src/routes/`          |
| Change rate limiting                 | `packages/rest/src/ratelimit/`       |
| Change reconnect or resume behaviour | `packages/gateway/src/Shard.ts`      |
| Handle a new gateway event           | `packages/core/src/events/handlers/` |
| Add a method to a structure          | `packages/core/src/structures/`      |
| Change what gets cached              | `packages/core/src/cache/`           |

Packages form a strict one-directional graph (`types → rest/gateway → core → vestra`),
enforced by TypeScript project references. If an import fails with `TS2307: Cannot find
module`, you are reaching across a boundary that is deliberately closed — see
[ADR 5](docs/adr/0005-enforced-package-boundaries.md).

## The three common contributions

### Adding a gateway event

One file per event, one uniform shape, then one line in the registry:

```ts
// packages/core/src/events/handlers/messageCreate.ts
export const messageCreate: EventHandler<'MESSAGE_CREATE'> = {
  name: 'MESSAGE_CREATE',
  handle(client, data, shard) {
    const message = client.cache.messages.add(new Message(data, client))
    client.emit('messageCreate', message)
  },
}
```

A test asserts that every dispatch event declared in `@vestra/types` either has a handler
or is listed explicitly as unhandled, so an unimplemented event is always visible rather
than silently missing.

### Adding a REST endpoint

Routes are hand-written typed methods grouped by resource, not inferred from route strings.
This is deliberate: the types come out identical and the code stays readable.

```ts
// packages/rest/src/routes/channels.ts
async createMessage(channelId: Snowflake, body: RESTPostAPIChannelMessageJSONBody) {
  return await this.rest.post<APIMessage>(`/channels/${channelId}/messages`, { body })
}
```

### Adding an API type

One file per API resource. Every object shape is prefixed `API`. Optional and nullable are
spelled out separately — `field?: string | null` means Discord may omit it _and_ may send
null, and conflating the two is the most common bug in hand-written Discord typings.

`enum` is a compile error here (`erasableSyntaxOnly`). Use an `as const` object plus a
derived union, in `src/enums/`:

```ts
export const ChannelType = {
  GuildText: 0,
  DM: 1,
} as const

export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType]
```

## Rules the tooling enforces

These are not style preferences; each one is checked, and each exists because of a specific
failure mode.

- **No runtime dependencies.** `tests/zero-dependencies.test.ts` fails on any dependency
  outside `@vestra/*`. See [ADR 1](docs/adr/0001-zero-runtime-dependencies.md).
- **No top-level `await` in published code.** It turns the package into an async module and
  breaks `require()` for every CommonJS consumer. `tests/cjs-interop.test.ts` catches it.
- **No `enum`, no parameter properties, no namespaces.** `erasableSyntaxOnly`.
- **TSDoc on every exported symbol.** `tsdoc/syntax` is an error, not a warning.
- **No floating promises.** This library is almost entirely async queues and reconnect
  timers; an unhandled promise here is a hung bot, not a lint nit.
- **~300 lines per file.** Warned at, not blocked. Past it, a file is usually holding more
  than one idea and wants splitting.

## Performance rules

Vestra's hot path is: socket frame → inflate → JSON parse → event handler → structure
construction. These rules apply _there_; elsewhere, prefer clarity.

- **Assign fields explicitly, in a fixed order,** in the constructor. `Object.assign` and
  conditional field assignment produce megamorphic object shapes that defeat V8's inline
  caches. This is lint-enforced.
- **Never `delete`.** It deoptimises the object's shape permanently. Assign `undefined`, or
  use a `Map`. Also lint-enforced.
- **Declare structure fields with `declare`** and assign them in the constructor, so no
  redundant field initialisation is emitted before your assignment.
- **Snowflakes stay `string`.** They are used as map keys and compared for equality, never
  for arithmetic. Converting to `bigint` costs on every payload and serialises badly.
- **Reuse buffers in the inflator.** It runs on every single gateway frame.

If you believe a change is faster, add a benchmark under `scripts/bench/` showing it.
Assertions about V8 without measurements get asked for measurements.

## Commits and pull requests

- Imperative subject, roughly 50 characters. No Conventional Commits prefixes, no emoji.
- Add a body only when the diff does not explain _why_; say what breaks without the change.
- Prefer several small focused commits over one large one.
- Run `pnpm lint && pnpm typecheck && pnpm test` before pushing. `typecheck` rather than
  `build`: it is the one that covers the test projects.
- Add a changeset (`pnpm changeset`) for anything user-visible.

Real defects, broken assumptions and known limitations belong in GitHub issues, not only in
a pull request description — the repository should show the current state of the work
without anyone having to read the conversation that produced it.
