# @vestra/rest

A Discord REST client with bucket-accurate rate limiting.

Zero runtime dependencies: `fetch`, multipart uploads and timers all come from Node.

```bash
npm install @vestra/rest
```

```ts
import { REST } from '@vestra/rest'

const rest = new REST().setToken(process.env.DISCORD_TOKEN)
await rest.channels.createMessage('123', { body: { content: 'hello' } })
```

Rate limiting is keyed by Discord's own bucket hash rather than by route, because several
routes can share a bucket and Discord may remap them at any time — anything derived purely
from the URL is a guess that drifts. There is also a global limiter and an invalid-request
tracker that refuses to send rather than earn a Cloudflare ban on the IP.

An HTTP-interactions bot can install this alone and ship no gateway or cache code.

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
