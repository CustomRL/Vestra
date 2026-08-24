import type { ShardManagerOptions } from '@vestra/gateway'
import type { ClientOptions } from '@vestra/core'

/**
 * Type-level guards for the option surface (§7.10 **O7**, §7.7 **EC6**).
 *
 * @remarks
 * **Not a runtime test, and there is nothing here to run.** Like `capabilities.test-d.ts`,
 * this file is checked by `pnpm typecheck` and by nothing else — and `pnpm build` never
 * compiles the test projects, so a green build says nothing about it.
 *
 * Every `@ts-expect-error` is load-bearing: TypeScript reports an unused one as an error of
 * its own, so a directive that stops being needed fails the build rather than quietly passing.
 */

/** Fails to compile unless `Actual` and `Expected` are mutually assignable. */
type Exact<Actual, Expected> = [Actual] extends [Expected]
  ? [Expected] extends [Actual]
    ? true
    : false
  : false

// --- O7. A new gateway option reaches the client with no edit to core. ---
//
// `ClientGatewayOptions` is `Omit`-derived from `ShardManagerOptions`, which is what makes a
// new gateway knob available under `client.options.gateway` automatically. Spelled out here
// because the alternative — restating each field — compiles just as well on the day it is
// written and then silently stops keeping up.

type Gateway = NonNullable<ClientOptions['gateway']>

// Everything the manager takes, minus the four the client owns, is on the client's `gateway`.
type Owned = 'fetchGatewayBot' | 'intents' | 'token' | 'userAgent'
type PassedThrough = Exclude<keyof ShardManagerOptions, Owned>

// Assigned rather than asserted through a helper: if `Exact` resolves to `false`, `true` is
// not assignable to it and the build fails here. Exported so it is not an unused binding.
export const everyPassThroughReachesTheClient: Exact<
  PassedThrough extends keyof Gateway ? true : false,
  true
> = true

// And the four the client owns are not passed through, or a caller could identify with one
// set of intents while a shard used another.
// @ts-expect-error `intents` is hoisted to the client and must not be settable per shard
export type NoIntentsOnGateway = Gateway['intents']
// @ts-expect-error `token` is hoisted for the same reason
export type NoTokenOnGateway = Gateway['token']

// `fetchGatewayBot` is the exception: removed from the manager's surface and added back on
// the client's, because the client is what knows how to serve it.
export const fetchGatewayBotIsAddedBack: Exact<
  Gateway extends { fetchGatewayBot?: unknown } ? true : false,
  true
> = true
