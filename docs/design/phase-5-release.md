# Phase 5 — release

Phases 1 to 4 each answered "what should this package do". This one answers a different
question — **what are we willing to promise, and to whom** — so it is shorter and its
conclusions are about scope rather than about code.

The short version: the library is finished enough to publish and is **not** finished enough to
call 1.0, and the gap between those two is usage rather than features. §6 recommends `0.1.0`.

---

## 0. Where things actually stand

Verified by reading the repository and running it on 2026-08-24, not recalled.

|                      |                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Packages             | 5, all building: `types` (59 files, 8,729 lines), `rest` (17 / 2,510), `gateway` (33 / 3,938), `core` (91 / 11,599), `vestra` (1 / 11)     |
| Tests                | 65 files, **782 cases**, green on Node 22.15.0, 24.x and 25.x                                                                              |
| Gateway dispatches   | 76 defined; **50 handled**, 26 documented in `events/unhandled.ts` with a reason                                                           |
| ADRs                 | 7                                                                                                                                          |
| Runtime dependencies | 0, enforced by `tests/zero-dependencies.test.ts`                                                                                           |
| Packaging            | `publint` and `arethetypeswrong` clean; ESM-only resolutions green, CJS and node10 ignored by policy per ADR 2                             |
| Versions             | every package at `0.0.0`; nothing published                                                                                                |
| Live verification    | the client connects, seeds its cache, resumes with the cache intact, replies to a message, and round-trips a reaction against real Discord |

**REST was the thinnest layer** and is less thin than when this was written:

| Namespace      | Routes                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `channels`     | get, edit, delete, getMessages, getMessage, createMessage, editMessage, deleteMessage, bulkDeleteMessages, triggerTyping; addReaction, removeOwnReaction, removeUserReaction, getReactions, removeAllReactions, removeEmojiReactions; getPinnedMessages, pinMessage, unpinMessage; getInvites, createInvite; startThread, startThreadFromMessage, joinThread, leaveThread, addThreadMember, removeThreadMember, getThreadMembers |
| `guilds`       | get, getMember, getMembers, editMember, removeMember, createBan, removeBan, getBan, getRoles, createRole, editRole, deleteRole, addMemberRole, removeMemberRole, getChannels, createChannel, getInvites, getActiveThreads                                                                                                                                                                                                        |
| `webhooks`     | create, getForChannel, getForGuild, get, getWithToken, edit, editWithToken, delete, deleteWithToken, execute                                                                                                                                                                                                                                                                                                                     |
| `invites`      | get, delete                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `users`        | getCurrent, get, editCurrent, createDM                                                                                                                                                                                                                                                                                                                                                                                           |
| `interactions` | reply, getReply, editReply, deleteReply, followUp, getFollowUp, editFollowUp, deleteFollowUp                                                                                                                                                                                                                                                                                                                                     |
| `gateway`      | get, getBot                                                                                                                                                                                                                                                                                                                                                                                                                      |

Still missing: **emoji, sticker, scheduled-event and audit-log routes**, guild editing, and
the archived-thread listings. A bot that reads the gateway, replies, registers slash commands
and manages channels, roles, invites, threads and webhooks is served; one that manages emoji
or reads an audit log is not.

---

## 1. What 1.0 is a promise about

A major version is a promise about **shape**, not about coverage. Declaring 1.0 says: this
public surface is one we will keep, and changing it costs a major.

That framing does most of the work here, because it separates two things that look similar:

- **A missing feature is not a 1.0 blocker** if adding it is additive. A new REST route, a new
  structure, a new handler for a currently-unhandled dispatch — none of these change an
  existing signature. §4.17 already reasoned this way about the structure cut, and §8-E of the
  Phase 4 document records that the reasoning held: "the safe cut turned out to be a safe
  _order_".
- **A surface we would have to change is a blocker**, however small. Two shipped in the last
  week and both were caught before publication rather than after: `message.reply()` did not
  compile on a message from an event (#22), and structures read back out of the cache could not
  reach REST at all (#23). Both were public type surface. Both would have been majors.

This is also why unhandled dispatches emit **nothing** rather than their raw payload. Emitting
the raw form would mean that adding a handler later changes an event's argument from
`APIEntitlement` to `Entitlement` — a breaking change for an event nobody asked for. Emitting
nothing makes adding one purely additive. That decision is what lets 26 unhandled events sit
comfortably inside a 1.0.

---

## 2. In scope, cut, and the criterion

### Cut, and staying cut

Seven structures and the nineteen dispatches that need them: `Entitlement`, `Subscription`,
`SoundboardSound`, `Integration`, `Poll`, `ThreadMember`, `VoiceChannelEffect`. Each is listed
in `events/unhandled.ts` with its reason, each is additive, and `THREAD_MEMBERS_UPDATE` already
demonstrated the pattern — it turned out to need no structure at all, only the absolute
`member_count` assignment §5.2 always specified.

The criterion §4.17 invented and this phase keeps: **identity, plus a cache entry or a route or
computed behaviour.** A structure that would only wrap a payload and hand it back earns
nothing that the payload does not already give.

### Not cut, and not built either

The REST gap in §0 is different in kind. Those routes are additive too, but their absence is
what a user hits first. Nothing about the library's shape depends on them, so they do not
block a major — they block being _useful_, which is a different and more urgent problem.

Forty-two routes have landed since this was written, which closed the worst of it: creating a
channel, editing and deleting roles, pinning, the full reaction set, invites, threads,
webhooks and application commands. What remains is narrower and more specialised.

**This is the strongest argument for shipping 0.x first.** Adding fifteen REST routes to a 0.x
is a Tuesday. Discovering after 1.0 that one of them needed a different signature is a major.

---

## 3. What cannot be settled here

`docs/design/phase-3-gateway.md` §8 records protocol behaviours implemented on a documented
assumption. [#7](https://github.com/CustomRL/Vestra/issues/7) tracks them. As of today:

| Question                                                                                 | State                                                                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Session timeout after an abnormal close                                                  | **Measured**: survived 90s, gone by 120s. Discord documents "a few minutes"    |
| `zstd-stream` availability and correctness                                               | **Measured**: not gated, decodes identically to `zlib-stream`                  |
| More than one payload per websocket message                                              | **Not observed** across 188 payloads and three runs, all at ≤3.4 KB compressed |
| One payload split across messages                                                        | **Not observed**, same evidence                                                |
| Server-requested heartbeat (op 1)                                                        | **Not observed** in 10 minutes and 14 heartbeat cycles                         |
| op 9 with `d: true`, 4003 resumability, server 1000/1001, `resume_gateway_url` staleness | **Untouched.** No lever exists to provoke any of them                          |

The framing pair deserves its caveat repeated rather than buried: **splitting is a function of
frame size and the test bot cannot move it.** Two small guilds produce a largest frame of 2.6 KB.
Three clean runs there say nothing about behaviour at hundreds of kilobytes, which is where a
fragmentation threshold would live.

None of these is a 1.0 blocker under §1's framing: being wrong about them means a behavioural
fix, which is a patch. They are listed because shipping while pretending they are settled would
be the dishonest version.

---

## 4. What a release needs mechanically

1. A changeset per package (`pnpm changeset`), with the `fixed` group in
   `.changeset/config.json` keeping `vestra` and `@vestra/*` on one version.
2. `pnpm check:packaging` — already green.
3. An npm token with publish rights, and `pnpm release`.
4. A tag, and release notes that say what §3 says.

Step 3 is the only one that is not reversible and the only one this repository cannot do on its
own.

---

## 5. What would have caught the things that got caught

Recorded because the pattern repeated and is worth generalising.

Every defect found in the last stretch was in **wiring**, not logic, and each was invisible to
the tests that existed:

| Defect                                             | Why nothing caught it                                                |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `userAgent` reached the shards and not REST        | §7.10's `O` group had no tests at all                                |
| `RATE_LIMITED` never routed to the chunker         | The chunker's own unit tests pass; nothing asserted it was reachable |
| `whenReady()` never settled after `destroy()`      | The `L` group had no tests at all                                    |
| `login()` never settled if destroyed mid-handshake | Same                                                                 |
| `message.reply()` uncallable from an event         | `capabilities.test-d.ts` only tested hand-built structures           |
| Cache reads uncallable                             | Same                                                                 |

The generalisation: **unit tests prove a component works; nothing but an integration test
proves it is reached.** Three of the six were "exported, documented, unit-tested, and called by
nobody" — a shape this project has now hit four times, counting `GuildReadyTracker` and
`MemberChunker` in Phase 3.

**Built, as `tests/reachability.test.ts`.** The broad version of the rule does not work:
"every public method is called somewhere in `src`" flags fifteen things that are simply
consumer API — `guild.iconUrl()`, `client.setPresence()`, every REST route — and a rule with
fifteen standing exceptions is one nobody trusts.

Restricted to **classes one package constructs from another** it needs no exceptions at all.
Four qualify today (`MemberChunker`, `GuildReadyTracker`, `ShardManager`, `REST`), every method
of each is reached, and those classes exist precisely to be driven from above — so a method of
one that nothing calls is either dead or unwired, and both deserve a failing test. Unwiring
`handleRateLimited` again fails it by name.

---

## 6. Recommendation

**Publish `0.1.0`, not `1.0.0`.**

The API is in good shape and §1's blockers are clear. What is missing is not a feature — it is
that **nobody has used this**. Every line of evidence in §0 comes from one test bot in two
guilds, driven by its author. The ergonomics have never met somebody who did not write them,
and the REST surface is thin enough (§2) that the first real user will want routes that do not
exist, which is exactly when signatures get revised.

1.0 is worth declaring when the answer to "what would you change if you could" is "nothing",
and that answer is only trustworthy after other people have asked for things. A 0.x costs
nothing and buys the right to be wrong once.

The concrete gate for 1.0, then, is not a feature list:

- the REST surface covers what a guild-managing bot needs, because that is where signature
  churn will happen. Substantially there now
- at least one bot that is not this one has run on it
- a soak of hours rather than minutes, with a reconnect observed in the wild
- #7's remaining items answered or explicitly accepted as permanent unknowns
