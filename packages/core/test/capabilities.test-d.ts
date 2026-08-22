import type { REST } from '@vestra/rest'
import { CacheRegistry, Guild, Message, type CacheCapable, type RestCapable } from '@vestra/core'

/**
 * Type-level guards for the constrained-`this` mechanism (see `structures/capabilities.ts`).
 *
 * @remarks
 * **Not a runtime test, and there is nothing here to run.** The whole point of the mechanism is
 * that a structure whose client cannot reach REST refuses `send()` *at compile time*, and no
 * runtime assertion can observe that — the check has already succeeded or failed before any
 * code executes.
 *
 * So this file is checked by `pnpm typecheck` and by nothing else, which is exactly the trap
 * CONTRIBUTING.md warns about: `pnpm build` is turbo and never compiles the test projects, so a
 * green build says nothing about this file. Every `@ts-expect-error` below is load-bearing —
 * TypeScript reports an unused one as an error of its own, so a directive that stops being
 * needed fails the build rather than silently passing.
 */

declare const rest: REST

const capable = { rest, cache: new CacheRegistry() }
const bare = undefined

const payload = {
  id: '1',
  channel_id: '2',
  content: 'hi',
  timestamp: '2023-01-01T00:00:00+00:00',
  edited_timestamp: null,
  tts: false,
  mention_everyone: false,
  mentions: [],
  mention_roles: [],
  attachments: [],
  embeds: [],
  pinned: false,
  type: 0,
} as never

const guildPayload = {} as never

// A client carrying REST can send, and gets a Message back typed to that same client.
const sendable = new Message(payload, capable)
void sendable.send({ content: 'pong' })
void sendable.reply({ content: 'pong' })

// A client that cannot reach REST must not be able to send. Both directives are required; if
// the constraint were dropped these would become "unused @ts-expect-error" errors.
const unsendable = new Message(payload, bare)
// @ts-expect-error a client with no `rest` cannot send
void unsendable.send({ content: 'pong' })
// @ts-expect-error a client with no `rest` cannot reply
void unsendable.reply({ content: 'pong' })

// The same split for the cache-backed accessors.
const readable = new Guild(guildPayload, capable)
void readable.roles()
void readable.channels()

const unreadable = new Guild(guildPayload, bare)
// @ts-expect-error a client with no `cache` cannot read cached roles
void unreadable.roles()
// @ts-expect-error a client with no `cache` cannot read cached channels
void unreadable.channels()

// A client with only one capability gets only that half.
const restOnly: RestCapable = { rest }
const cacheOnly: CacheCapable = { cache: new CacheRegistry() }

void new Message(payload, restOnly).send({ content: 'pong' })
// @ts-expect-error `RestCapable` alone cannot reach the cache
void new Message(payload, restOnly).channel()

void new Message(payload, cacheOnly).channel()
// @ts-expect-error `CacheCapable` alone cannot reach REST
void new Message(payload, cacheOnly).send({ content: 'pong' })
