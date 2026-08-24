# Vestra

A lightweight, fully-typed Discord library for Node.js. Monorepo, ESM-only,
**zero runtime dependencies**.

## Before changing anything

Read [docs/adr](docs/adr). The constraints below are decisions with recorded reasoning, not
defaults — if a change appears to require breaking one, that is a signal to reconsider the
change, or to write an ADR superseding the old one.

## Hard constraints

- **No runtime dependencies** outside `@vestra/*`. Node built-ins and globals only.
  Enforced by `tests/zero-dependencies.test.ts`.
- **No top-level `await`** in `packages/*/src/`. It breaks `require(esm)` for CommonJS
  consumers. Enforced by `tests/cjs-interop.test.ts`.
- **No `enum`**, parameter properties or namespaces — `erasableSyntaxOnly` is on. Use
  `as const` objects plus derived unions.
- **Do not bump TypeScript past 6.0.x.** TypeScript 7 is outside typescript-eslint's
  supported peer range and type-aware linting would run on an unsupported compiler API.
  See [ADR 6](docs/adr/0006-typescript-6-not-7.md).
- **Node floor is 22.15.0** — the first version with native zstd in `node:zlib`. Lowering it
  reintroduces a dependency.
- **Package graph is one-directional**: `types → rest/gateway → core → vestra`. Enforced by
  TypeScript project references; a breach is a compile error.

## Commands

```bash
pnpm build            # turbo; each package's own sources, NOT the test projects
pnpm typecheck        # tsc --build --force; the whole solution, tests included
pnpm test             # node:test
pnpm lint
pnpm check:packaging  # publint + arethetypeswrong
```

## Conventions

- One idea per file, ~300 lines. Adding a gateway event means adding a file to
  `packages/core/src/events/handlers/` plus one registry line.
- TSDoc on every exported symbol; `tsdoc/syntax` is an error.
- Hot-path rules (fixed field order, no `delete`, no `Object.assign`, snowflakes as
  strings) are documented in CONTRIBUTING.md and partly lint-enforced.
- Performance claims need a benchmark under `scripts/bench/`, not an assertion about V8.
