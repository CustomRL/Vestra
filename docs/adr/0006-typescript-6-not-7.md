# 6. TypeScript 6.0, not 7.0

Status: accepted — revisit when typescript-eslint supports TypeScript 7

## Context

TypeScript 7.0.2 (the native compiler) is the current `latest` tag. It was evaluated
directly against this repository's requirements and handles all of them: composite project
references, declaration and declaration-map emit, `erasableSyntaxOnly`,
`exactOptionalPropertyTypes`, and a 0.27s no-op incremental rebuild.

It was not adopted, for one reason: `typescript-eslint@8.67.0` declares
`typescript: ">=4.8.4 <6.1.0"`. TypeScript 7 is outside that range, so type-aware lint
rules would run on an unsupported compiler API.

Those rules are not optional decoration here. Vestra is largely async queues, reconnect
timers and rate-limit backoff, where `no-floating-promises` and `no-misused-promises` catch
the class of bug that presents as a silently hung bot.

## Decision

Pin TypeScript **6.0.3** — the newest release inside typescript-eslint's supported range.
It was verified to satisfy every requirement TypeScript 7 did.

## Consequences

- Correct type-aware linting today, at the cost of the native compiler's build speed.
  At this repository's size the build is not a bottleneck.
- Upgrading is a two-line change once typescript-eslint widens its peer range. Until then,
  do not bump TypeScript past 6.0.x — the failure mode is a lint crash, not a clean error.
- Relatedly, `eslint-plugin-tsdoc` pins an older `@typescript-eslint/utils` that caps
  TypeScript at `<6.0.0`. Since it only uses `ESLintUtils.RuleCreator` and performs no type
  analysis, `pnpm-workspace.yaml` overrides it onto 8.67.0. That is a genuine alignment
  rather than a suppressed warning, and can be dropped when the plugin updates.
