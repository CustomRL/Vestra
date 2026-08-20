# 2. ESM only

Status: accepted

## Context

Dual CJS/ESM publishing doubles build output, creates the "dual package hazard" (two copies
of every class, so `instanceof` fails across the boundary), and roughly doubles the surface
that `publint` and `arethetypeswrong` have to validate.

The historical reason to keep shipping CJS was that a large share of Discord bots are
still written in CommonJS and `require()` of an ES module used to throw outright.

Node 22.12+ removed that reason: `require()` of an ES module works, provided the module
graph contains no top-level `await`.

## Decision

Every package is ESM-only: `"type": "module"`, a single `exports` entry, no CJS build.

**No published code may use top-level `await`** — a single one turns the package into an
async module and breaks `require(esm)` for every CommonJS consumer.

## Consequences

- Half the build output, no dual package hazard, one resolution path to reason about.
- `arethetypeswrong` runs with `--profile esm-only`, which ignores two findings we accept
  deliberately: `node10` resolution failure (pre-`exports` TypeScript) and
  `node16 (from CJS)` reporting dynamic-import-only types.
- The no-top-level-await rule cannot be reliably linted — `await` hides in declarations,
  loops and nested expressions. It is instead enforced behaviourally by
  `tests/cjs-interop.test.ts`, which `require()`s every built entrypoint from CommonJS and
  fails on `ERR_REQUIRE_ASYNC_MODULE`. That guard has been verified to fail when violated.
