# @vestra/gateway

Discord gateway sharding, resuming and transport compression.

Zero runtime dependencies: the WebSocket, zlib inflation and zstd decompression all come from
Node.

```bash
npm install @vestra/gateway
```

```ts
import { ShardManager } from '@vestra/gateway'
```

Handles sharding, session resumption and identify pacing, with pluggable transport,
compression, encoding and session-store seams — the session store in particular is what makes
a multi-process deployment correct, since the identify allowance is per token rather than per
process.

Most consumers want [`@vestra/core`](https://www.npmjs.com/package/@vestra/core) instead,
which wires this to a cache and a typed event surface.

## Requirements

Node **22.15.0+** — the first version with native zstd in `node:zlib`, which is what removes
the last dependency the gateway would otherwise need.

## Status

Early development. See the [repository](https://github.com/CustomRL/Vestra) for the roadmap,
the [ADRs](https://github.com/CustomRL/Vestra/tree/main/docs/adr) for the decisions behind the
constraints, and [issue #7](https://github.com/CustomRL/Vestra/issues/7) for the gateway
protocol assumptions that are still unverified.

## Licence

MIT
