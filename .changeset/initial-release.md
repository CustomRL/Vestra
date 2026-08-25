---
'@vestra/gateway': minor
'@vestra/types': minor
'@vestra/rest': minor
'@vestra/core': minor
'vestra': minor
---

First published release.

A lightweight, fully-typed Discord library for Node.js with **zero runtime dependencies** —
the websocket, `fetch`, multipart uploads, zlib inflation and zstd decompression all come from
Node itself.

- `@vestra/types` — hand-written Discord API typings, no dependencies.
- `@vestra/rest` — REST client with bucket-accurate rate limiting, a shared global limiter and
  an invalid-request tracker that refuses to send rather than earn a Cloudflare ban.
- `@vestra/gateway` — sharding, session resumption, identify pacing, and pluggable transport,
  compression, encoding and session-store seams.
- `@vestra/core` — the client: 50 dispatch handlers, an opt-in per-scope cache, and structures
  that admit a cache miss rather than asserting.
- `vestra` — the meta-package.

**`0.1.0` rather than `1.0.0`, deliberately.** The API is in the shape we want and the test
suite is thorough, but nobody outside this repository has used it: every line of evidence comes
from one test bot in two guilds, driven by its author. The REST surface is also incomplete — there are no
emoji, sticker, scheduled-event, application-command or audit-log routes — and the first real
user will want signatures that do not exist yet, which is exactly when signatures get revised. `docs/design/phase-5-release.md`
records the reasoning and the concrete gate for a 1.0.

Requires Node 22.15.0 or newer, the first version with native zstd in `node:zlib`.
