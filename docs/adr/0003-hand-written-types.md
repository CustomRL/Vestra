# 3. Hand-written API typings

Status: accepted

## Context

The typings are the product as much as the runtime is. Three options existed:

1. Depend on `discord-api-types` — battle-tested, zero runtime cost, community standard.
2. Hand-write them in `@vestra/types`.
3. Generate them from Discord's published OpenAPI specification.

Option 1 is the low-effort path but puts an external package in our public type surface and
ties our release cadence to someone else's. Option 3 produces awkward names and the spec has
real gaps, particularly around gateway payloads, which are not part of the REST spec at all.

## Decision

Hand-write the typings in `@vestra/types`, owned in-repo, with no external type dependency.

This is the highest-maintenance option and it is chosen with that understood. The mitigations
are what make it survivable:

- **Mechanical conventions** so the work is boring and parallelisable: one file per API
  resource, every object shape prefixed `API`, optional versus nullable spelled out
  explicitly, a TSDoc line on every field.
- **No `enum`.** `erasableSyntaxOnly` in `tsconfig.base.json` makes `enum` a compile error,
  so enum-like values are `as const` objects plus a derived union. These live under
  `src/enums/` — the only directory in the package that emits runtime code.
- **Scheduled drift detection** against Discord's OpenAPI spec, which opens an issue listing
  fields the spec has and we do not. It runs on a schedule, never on pull requests: a
  contributor must never be blocked because Discord shipped a field this morning.

## Consequences

- Typings PRs need no runtime review, making them the natural first contribution.
- We will lag the API at times. The drift job makes the lag visible instead of silent.
- If the drift job is ever ignored for a long stretch, revisit option 1 honestly rather
  than letting the typings quietly rot.
