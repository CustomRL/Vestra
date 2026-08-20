# 1. Zero runtime dependencies

Status: accepted

## Context

"Lightweight" is the reason to choose Vestra over discord.js, and it is a claim that
decays one convenient dependency at a time. Every runtime dependency is install weight,
a supply-chain surface, and a version conflict a consumer has to resolve.

Historically a Discord library needed native or third-party code for three things:
a WebSocket client, zlib stream inflation, and (optionally) zstd. That is no longer true.

## Decision

No published package declares a runtime dependency on anything outside `@vestra/*`.
Node built-ins and globals only.

Specifically:

| Need              | Historically           | Vestra                                           |
| ----------------- | ---------------------- | ------------------------------------------------ |
| WebSocket         | `ws`                   | global `WebSocket` (Node 22.4+)                  |
| HTTP              | `node-fetch`, `undici` | global `fetch`                                   |
| `zlib-stream`     | `zlib-sync` (native)   | `node:zlib` `createInflate`                      |
| `zstd-stream`     | `fzstd`, `zstd-napi`   | `node:zlib` `createZstdDecompress` (Node 22.15+) |
| Multipart uploads | `form-data`            | global `FormData` / `Blob`                       |
| ETF encoding      | `erlpack` (native)     | not supported; JSON only                         |

Native zstd in `node:zlib` is the reason the Node floor is **22.15.0**.

Anything a consumer might reasonably want to swap — the socket, the inflator, the
encoder, the cache, the session store — is defined as an interface with a native default,
so `ws` or `erlpack` remain drop-in _choices_ rather than imposed costs.

## Consequences

- Enforced by `tests/zero-dependencies.test.ts`, not by review discipline.
- We inherit Node's WebSocket bugs and cannot patch around them as quickly as `ws` does.
  Mitigated by the `Transport` interface: a `ws`-backed transport is a ~50 line adapter.
- No ETF support at 1.0. JSON with zstd-stream is within a few percent of ETF on wire size
  and avoids a native build step, so this is judged a good trade.
- Dropping below Node 22.15 would require reintroducing a zstd dependency. Do not do it.
