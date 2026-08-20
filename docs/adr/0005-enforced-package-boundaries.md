# 5. Enforced package boundaries

Status: accepted

## Context

"Well structured" degrades into "structured on the day it was written" unless the structure
is mechanically checked. Layering documented only in a README is layering that a
well-intentioned pull request will breach within a month.

## Decision

Packages form a strict acyclic graph, expressed as TypeScript project references in each
package's `tsconfig.json` and built with `tsc --build` from the solution file at the root:

```
@vestra/types    (no deps)
      ^
@vestra/rest     (types)
      ^
@vestra/gateway  (types)
      ^
@vestra/core     (types + rest + gateway)
      ^
vestra           (core)
```

Project references make a breach a compile error rather than a review comment: a file in
`@vestra/types` that imports `@vestra/core` fails with `TS2307: Cannot find module`,
because the reference does not exist. This has been verified, not assumed.

`@vestra/gateway` emits raw, typed gateway payloads and knows nothing about structures or
caching. `@vestra/rest` returns raw API objects. All conversion into Vestra structures
happens in `@vestra/core`, in exactly one place per event.

## Consequences

- A consumer writing an HTTP-interactions bot installs `@vestra/rest` alone and ships no
  gateway or cache code at all.
- `@vestra/gateway` is testable without a network, and `@vestra/rest` without a Discord
  token, because neither can reach for a client that would drag the world in.
- Adding a package means adding it to the root solution `tsconfig.json` as well as
  `pnpm-workspace.yaml`. Forgetting the former means it is silently never typechecked.
