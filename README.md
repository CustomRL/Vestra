# Vestra

A lightweight, fully-typed Discord library for Node.js.

> **Status: early development.** All four packages are built — typings, REST, gateway and
> client — and the test suite runs green on Node 22.15, 24 and 25. Not yet published to npm,
> and the gateway's protocol assumptions have not been checked against a live connection.

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
import { Client, GatewayIntentBits } from 'vestra'

const token = process.env.DISCORD_TOKEN
if (token === undefined) throw new Error('DISCORD_TOKEN is not set')

const client = new Client({
  token,
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // Without this, `message.content` is an empty string for anything the bot was not
    // mentioned in. It is a privileged intent, so it also has to be enabled in the
    // Discord developer portal — enabling it there alone is not enough.
    GatewayIntentBits.MessageContent,
  ],
})

client.on('messageCreate', async (message) => {
  if (message.content === '!ping') {
    await message.reply({ content: 'pong' })
  }
})

await client.login()
```

`message.reply` sends by channel ID rather than through the cache, so it works on a client
that caches nothing. Cache-backed accessors are separate and honest about missing entries:
`message.channel()` returns `Channel | undefined`, because caching is opt-in per scope and an
accessor that asserted would turn cache configuration into runtime exceptions.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository map and the rules the tooling
enforces. Design decisions and their trade-offs are recorded in [docs/adr](docs/adr).

## Licence

MIT
