# vestra

A lightweight, fully-typed Discord library for Node.js.

The meta-package. Re-exports [`@vestra/core`](https://www.npmjs.com/package/@vestra/core),
which itself re-exports the gateway, REST and typings — so this is the single install for a
normal bot.

```bash
npm install vestra
```

```ts
import { Client, GatewayIntentBits } from 'vestra'

const token = process.env.DISCORD_TOKEN
if (token === undefined) throw new Error('DISCORD_TOKEN is not set')

const client = new Client({
  token,
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
})

client.on('messageCreate', async (message) => {
  if (message.content === '!ping') await message.reply({ content: 'pong' })
})

await client.login()
```

**Zero runtime dependencies.** Not "few" — zero. The websocket, `fetch`, multipart uploads,
zlib inflation and zstd decompression all come from Node itself.

Install a single package instead if you need less:
[`@vestra/rest`](https://www.npmjs.com/package/@vestra/rest) for an
HTTP-interactions bot, [`@vestra/types`](https://www.npmjs.com/package/@vestra/types) for
typings alone.

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
