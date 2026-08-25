# @vestra/core

The Vestra client: structures, pluggable cache and typed events.

Zero runtime dependencies outside `@vestra/*`.

```bash
npm install @vestra/core
```

```ts
import { Client, GatewayIntentBits } from '@vestra/core'

const client = new Client({ token, intents: [GatewayIntentBits.Guilds] })
client.on('messageCreate', (message) => console.log(message.content))
await client.login()
```

Caching is **opt-in per scope**, and cache-backed accessors are honest about it:
`message.channel()` returns `Channel | undefined`, because an accessor that asserted would
turn cache configuration into runtime exceptions in code that never mentions caching.

The meta-package [`vestra`](https://www.npmjs.com/package/vestra) re-exports this.

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
