import type { REST } from '@vestra/rest'
import type { CacheRegistry } from '../cache/CacheRegistry.js'

/**
 * What a structure needs from its client to reach the API.
 *
 * @remarks
 * **This is how a structure calls REST without importing the client.** {@link Base} is generic
 * over the client precisely so `structures/` never imports `Client.ts`, which would close a
 * module cycle that `tsc --build` takes seriously. A method that needs REST therefore declares
 * a constrained `this` instead:
 *
 * ```ts
 * async send<C extends RestCapable>(this: TextChannel<C>, body: …): Promise<Message<C>>
 * ```
 *
 * The constraint is checked at the call site rather than on the class, which has three
 * consequences worth stating. A structure built with a real client can call it. A structure
 * built with `undefined` — which every unit test in this package does — still constructs, and
 * only the sending methods are unavailable on it. And `Client` survives into the return type,
 * so `channel.send()` gives back a `Message` typed to the same client rather than to this
 * interface.
 *
 * Rejected: constraining `Base<Client extends RestCapable>`. It would force every test and
 * every doc example to conjure a client with a REST instance in it to build a `User`, to buy
 * a check that is only meaningful on the four methods that actually call out.
 */
export interface RestCapable {
  /** The REST client. */
  readonly rest: REST
}

/**
 * What a structure needs from its client to reach the cache.
 *
 * @remarks
 * The same mechanism as {@link RestCapable}, for the accessors that read cached state —
 * `guild.roles`, `category.children`, `message.channel`.
 *
 * Every one of them returns `T | undefined` or a possibly-empty array, and that is ADR 4
 * rather than caution: caching is opt-in per scope, so `guild.roles` on a client configured
 * with `roles: false` has nothing to return and must say so. An accessor that threw would make
 * the cache configuration a source of runtime exceptions in code that never mentions caching;
 * one that fetched would make a property access an await.
 */
export interface CacheCapable {
  /** Cached entities, per scope. */
  readonly cache: CacheRegistry
}

/**
 * The client as a structure the library hands out sees it.
 *
 * @remarks
 * **What `Client` parameterises its events and its cache with**, and the reason
 * `message.reply()` works on a message from `client.on('messageCreate')`. It did not: `Client`
 * extended `EventEmitter<ClientEvents>`, whose client parameter defaults to `unknown`, so every
 * structure a consumer received was `Message<unknown>` — and `unknown` satisfies neither
 * capability. The mechanism above was tested on structures built directly with a capable
 * client and never on the path every consumer actually takes, so the library's headline
 * example did not compile.
 *
 * Both capabilities rather than `Client` itself, because `Client` is not what a structure
 * holds. Handlers are handed an `EventContext` — deliberately narrower, so a handler cannot
 * reach `destroy()` — and that context carries exactly `cache` and `rest`. Typing the events
 * as `Message<Client>` would make `message.client.destroy()` compile and then fail at runtime.
 * This says what is really there.
 */
export type StructureClient = RestCapable & CacheCapable
