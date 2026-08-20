# 7. zlib-stream is the default transport compression

Status: accepted — revisit when node:zlib's zstd reaches Stability 2

## Context

Discord offers two transport compression modes, `zlib-stream` and `zstd-stream`. Native
zstd in `node:zlib` is the reason the Node floor is 22.15.0 and a large part of why
[ADR 1](0001-zero-runtime-dependencies.md) can promise zero dependencies at all — every
other library reaches for `fzstd` or `zstd-napi` to decode it.

By Discord's own figures zstd wins on wire size, and its framing is simpler to decode:
`zlib-stream` requires buffering until the four-byte `Z_SYNC_FLUSH` suffix `00 00 ff ff`
appears, while zstd frames arrive whole.

So the expectation going in was that zstd would be the default. It is not.

## Decision

Both codecs are fully implemented behind the same `Compression` interface. **`zlib-stream`
is the default.**

Three things decided it:

- `zlib.createZstdDecompress` is **Stability 1 — Experimental** across the whole Node 22
  LTS line. It would sit on the hot path of every gateway frame, in a library whose
  selling point is reliability.
- ADR 1 leaves no fallback: there is no dependency to swap in if it misbehaves, only a
  reconnect loop that fails the same way each time.
- Most importantly, the round-trip evidence we have used **Node's compressor on both
  ends**. That demonstrates Node is self-consistent with itself. It does not demonstrate
  interoperability with Discord's encoder, and the window-size question — whether
  Discord's compressor exceeds Node's default `ZSTD_d_windowLogMax`, in which case the
  decompressor refuses to allocate — is unresolved.

A benchmark showing zstd is faster would not address any of those. The uncertainty is
about correctness against a counterparty we have not tested with.

## Consequences

- Vestra ships slightly more gateway traffic than it could. That is the price of not
  putting an experimental codec on the hot path by default.
- Selecting zstd is one option, so anyone who wants it now can have it and report back.
- The Node 22.15.0 floor stays justified: it buys the _option_ of native zstd, and
  preserving that option is precisely what ADR 1's pluggable-interface rule protects.
- The default flips when **both** hold: a conformance test against captured live gateway
  traffic passes, and `node:zlib`'s zstd reaches Stability 2. Tracked in the repository's
  issues.
- `zlib-stream` decoding must therefore be correct and fast, not a fallback nobody
  exercises. It is what the test suite targets.
