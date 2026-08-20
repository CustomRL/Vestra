# 4. Pluggable, opt-in cache

Status: accepted

## Context

Cache policy is the single largest determinant of a Discord bot's memory footprint, and it
is the main reason large bots move off discord.js. A library that caches every member of
every guild by default will use gigabytes in a bot that only ever reads message content.

The opposite extreme — no cache at all — is smallest and most predictable, but loses the
ergonomics that make Eris and Oceanic pleasant: `message.member.roles` has to resolve
against *something*.

## Decision

Caching is an interface (`CacheAdapter`) with per-type policies. The default in-memory
adapter caches only what the client needs to function correctly — guilds, channels and the
current user — and nothing else unless asked:

```ts
new Client({
  cache: {
    users: { max: 1000 },
    members: false,
    messages: { max: 50, ttl: 300_000 },
  },
})
```

Every cached type supports a maximum entry count, a TTL, and a predicate filter.

## Consequences

- Default memory scales with guild and channel count, not with member or message volume.
- A Redis or SQLite adapter is a third-party package implementing one interface, not a fork.
- Structures must tolerate absent cache entries everywhere. Accessors that depend on the
  cache return `T | undefined` and say so in their signature; they never lie by asserting.
  This is more honest than the alternative and is the cost of the default being small.
- Cache-dependent conveniences are documented as such, so upgrading from discord.js is a
  deliberate step rather than a surprise at runtime.
