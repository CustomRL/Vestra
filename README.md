# Vestra

A lightweight, fully-typed Discord library for Node.js.

> **Status: early development.** The foundation is in place; the REST, gateway and client
> packages are being built out phase by phase. Not yet published to npm.

Vestra is in the tradition of [Eris](https://github.com/abalabahaha/eris) and
[Oceanic](https://github.com/OceanicJS/Oceanic) — close to the wire, low indirection, low
memory — with complete first-class typings and a repository structured so that changing one
thing means editing one file.

## What makes it small

- **Zero runtime dependencies.** Not "few" — zero. The WebSocket, `fetch`, multipart
  uploads, zlib inflation and zstd decompression all come from Node itself.
- **Opt-in caching.** The default caches only what the client needs to work. Members and
  messages are not cached unless you ask, which is where the memory goes in every other
  library.
- **Separately installable packages.** An HTTP-interactions bot installs `@vestra/rest`
  and ships no gateway or cache code at all.

## Packages

| Package           | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `vestra`          | Meta-package; re-exports `@vestra/core`        |
| `@vestra/core`    | Client, structures, cache, typed events        |
| `@vestra/gateway` | Sharding, resuming, transport compression      |
| `@vestra/rest`    | REST client with bucket-accurate rate limiting |
| `@vestra/types`   | Zero-dependency Discord API typings            |

## Requirements

Node **22.15.0+**. That is the first version with native zstd in `node:zlib`, which is what
removes the last dependency the gateway would otherwise need.

## The shape of it

```ts
import { Client, GatewayIntents } from 'vestra'

const client = new Client({
  auth: `Bot ${process.env.TOKEN}`,
  gateway: { intents: GatewayIntents.Guilds | GatewayIntents.GuildMessages },
})

client.on('messageCreate', async (message) => {
  if (message.content === '!ping') {
    await message.channel.createMessage({ content: 'pong' })
  }
})

await client.connect()
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository map and the rules the tooling
enforces. Design decisions and their trade-offs are recorded in [docs/adr](docs/adr).

## Licence

MIT
