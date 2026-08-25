# @vestra/types

Hand-written TypeScript typings for the Discord API.

Payload, gateway and REST typings for Discord API v10, with **no dependencies at all** — not
even development ones at runtime. Hand-written rather than generated, so the shapes carry the
reasoning: where a field is optional _and_ nullable, the TSDoc says what each case means.

```bash
npm install @vestra/types
```

```ts
import type { APIMessage, GatewayDispatchPayload } from '@vestra/types'
```

`GatewayDispatchPayload` is a discriminated union, so `payload.t === 'MESSAGE_CREATE'` narrows
`payload.d` to the right shape.

Useful on its own for anything that speaks to Discord — it does not assume the rest of Vestra.

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
