import { EventEmitter } from 'node:events'
import { FatalGatewayError, ShardManager, SystemTimers, type Shard } from '@vestra/gateway'
import { REST } from '@vestra/rest'
import type { Snowflake } from '@vestra/types'
import { CacheRegistry } from './cache/CacheRegistry.js'
import { CacheSweeper } from './cache/CacheSweeper.js'
import {
  resolveClientOptions,
  type ClientOptions,
  type ResolvedClientOptions,
} from './ClientOptions.js'
import { presencePayload, type PresenceOptions } from './ClientPresence.js'
import { ClientError, ClientErrorCode } from './errors/ClientError.js'
import type { ClientEvents } from './events/ClientEvents.js'
import { EventRouter } from './events/EventRouter.js'
import { handlers } from './events/registry.js'
import type { EventContext } from './events/EventHandler.js'
import { isConnected, ShardBridge } from './gateway/ShardBridge.js'
import type { ClientUser } from './structures/ClientUser.js'

/**
 * A Discord client.
 *
 * @remarks
 * Composes the three layers below it: {@link ShardManager} for the sockets, {@link REST} for
 * the API, and {@link CacheRegistry} for what is kept.
 *
 * Handlers receive an {@link EventContext} built once here rather than the client itself.
 * The design document expected the client to satisfy that interface structurally, and it
 * does not: Node's `EventEmitter` types `emit` over its own event map plus its built-ins, a
 * signature no hand-written one matches. One object per client is a rounding error next to
 * fighting that, and the narrowing it was there for is unchanged — a handler still cannot
 * reach the shard manager or `destroy()`.
 *
 * @example
 * ```ts
 * const client = new Client({ token, intents: [GatewayIntentBits.Guilds] })
 * client.on('messageCreate', (message) => console.log(message.content))
 * await client.login()
 * ```
 */
export class Client extends EventEmitter<ClientEvents> {
  /** Cached entities, per scope. */
  readonly cache: CacheRegistry
  /** The REST client. */
  readonly rest: REST
  /** The resolved configuration. */
  readonly options: ResolvedClientOptions
  /** The shard fleet. */
  readonly shards: ShardManager

  /**
   * The current user, `undefined` until the first READY.
   *
   * @remarks
   * Reads through to the handler context, which is what the READY and `USER_UPDATE`
   * handlers assign. Two copies would drift the moment one of them updated.
   */
  get user(): ClientUser | undefined {
    return this.#context.user
  }

  readonly #context: EventContext
  readonly #router: EventRouter
  readonly #bridges = new Map<number, ShardBridge>()
  readonly #sweeper: CacheSweeper
  readonly #readyShards = new Set<number>()
  #announcedReady = false
  #destroyed = false

  /**
   * @param options - What to connect as, and what to keep.
   */
  constructor(options: ClientOptions) {
    super()
    this.options = resolveClientOptions(options)

    this.rest =
      options.rest instanceof REST
        ? options.rest
        : new REST(options.rest ?? {}).setToken(this.options.token)

    this.cache = new CacheRegistry(this.options.cache)
    this.#context = {
      cache: this.cache,
      rest: this.rest,
      user: undefined,
      // One cast, at the one boundary. The emitter's own `emit` is typed over its event
      // map plus Node's built-ins, and no hand-written generic signature lines up with
      // that; the event name and its arguments were already checked at the call site.
      emit: (event, ...args) =>
        (this.emit as (name: string, ...rest: unknown[]) => boolean)(event, ...args),
      listenerCount: (event) => this.listenerCount(event),
    }
    this.#router = new EventRouter(this.#context, handlers)
    this.#sweeper = new CacheSweeper(
      this.cache.stores,
      this.options.gateway.timers ?? SystemTimers,
      this.options.sweepInterval,
    )

    this.shards = new ShardManager({
      ...this.options.gateway,
      token: this.options.token,
      intents: this.options.intents,
      userAgent: this.options.userAgent,
      fetchGatewayBot:
        this.options.gateway.fetchGatewayBot ?? (async () => await this.rest.gateway.getBot()),
    })

    this.#attachManager()
  }

  /**
   * Connects every shard and resolves once the first one is ready.
   *
   * @returns The current user.
   *
   * @remarks
   * Resolves on the first shard's READY rather than on the whole fleet. A two-hundred shard
   * bot spends over a minute on identify pacing alone, and a `login()` that waits for all of
   * it is one nobody can put a startup log after. {@link whenReady} is the fleet-wide wait
   * for anyone who wants it.
   *
   * The readiness promise is armed **before** anything connects. `ShardManager.connect()`
   * emits `shardSpawn` synchronously and then opens the socket inside the same await, so a
   * fast shard can reach READY before `connect()` resolves — a `login()` that attached its
   * listener afterwards would miss the event and wait forever.
   */
  async login(): Promise<ClientUser> {
    // Destroying is not reversible: the shard map is cleared and the sweeper stopped, so a
    // second `login()` would build a fresh fleet on a client whose caller believes it is the
    // same one. Refusing is the honest answer, and the code says which refusal it is so a
    // caller can tell it from a shard that is merely reconnecting.
    this.#assertUsable()

    const ready = this.#firstReady()

    try {
      await this.shards.connect()
    } catch (error) {
      // **Cancelled, not abandoned.** `connect()` can throw after some shards are already
      // live — a session store that rejects on shard 1 while shard 0 is up — and an orphaned
      // readiness promise stays armed with its two listeners. A later fatal close then
      // rejects a promise nobody is awaiting, which Node reports as an unhandled rejection
      // and, by default, exits on. Retrying `login()` in a loop also stacked a pair of
      // listeners per attempt until Node started warning about the leak.
      ready.cancel()
      throw error
    }

    this.#sweeper.start()
    return await ready.promise
  }

  /**
   * Resolves once every owned shard has reported ready.
   *
   * @remarks
   * Separate from {@link login} because they answer different questions: login asks "can I
   * talk to Discord", this asks "is the whole fleet up". Neither means the guild stream has
   * finished — that is `shardGuildsReady`.
   */
  async whenReady(): Promise<void> {
    if (this.#allShardsReady()) return
    await new Promise<void>((resolve) => {
      this.shards.once('allReady', () => {
        resolve()
      })
    })
  }

  /**
   * Whether every shard this client owns has reported ready.
   *
   * @remarks
   * The fast path for {@link whenReady}, and the reason it is spelled out rather than reusing
   * `#announcedReady`: that flag is set by the **first** shard, because it gates the
   * once-per-client `ready` emit. Guarding on it made `whenReady` return as soon as any shard
   * was up — on a two-hundred shard bot, about a minute before the fleet was — while its own
   * documentation promised the opposite. `#readyShards` existed for this and was written to,
   * cleared, and never read.
   *
   * `owned > 0` matters: before `connect()` there are no shards, and an empty set must not
   * read as "all of them are ready".
   */
  #allShardsReady(): boolean {
    const owned = this.shards.shards.size
    return owned > 0 && this.#readyShards.size >= owned
  }

  /**
   * Disconnects every shard and stops all timers.
   *
   * @param resumable - Whether to keep sessions resumable for a fast restart.
   *
   * @remarks
   * Idempotent, and it does not clear the cache. A caller who wants a cold start builds a
   * new client; silently discarding cached state on shutdown would make a resumable restart
   * pointless, since the whole reason to keep the session is to keep what it produced.
   */
  async destroy(resumable = false): Promise<void> {
    this.#sweeper.stop()

    this.#destroyed = true
    const reason = new ClientError(
      ClientErrorCode.Destroyed,
      'The client was destroyed, so this request will never be answered.',
    )
    for (const bridge of this.#bridges.values()) bridge.destroy(reason)
    this.#bridges.clear()
    this.#readyShards.clear()
    this.#announcedReady = false

    await this.shards.destroy(resumable)
  }

  /**
   * Requests members over the gateway for one guild.
   *
   * @param guildId - The guild to fetch from.
   * @param options - What to fetch.
   * @returns The members.
   *
   * @remarks
   * Routed to the shard that carries the guild, because a member request is answered on the
   * connection it was sent on. Sending it to the wrong shard produces no error and no
   * chunks — just a request that times out.
   */
  async fetchMembers(
    guildId: Snowflake,
    options: { query?: string; limit?: number; userIds?: Snowflake[] } = {},
  ): Promise<unknown[]> {
    this.#assertUsable()

    // The shard count is not known until `connect()` has fetched it, and the manager throws a
    // bare `Error` saying so. Rewrapped, because "you have not connected yet" and "that shard
    // is reconnecting" are different problems with different answers, and a caller should not
    // have to read message text to tell them apart.
    let shardId: number
    try {
      shardId = this.shards.shardIdForGuild(guildId)
    } catch (cause) {
      throw new ClientError(
        ClientErrorCode.NotReady,
        'The client has not connected, so it does not know how many shards there are and ' +
          'cannot route a member request. Await `login()` first.',
        { cause },
      )
    }

    const bridge = this.#bridges.get(shardId)
    if (bridge === undefined) {
      throw new ClientError(
        ClientErrorCode.ShardUnavailable,
        `Shard ${String(shardId)} is not connected, so it cannot fetch members for guild ` +
          `${guildId}. This is usually transient — the shard is reconnecting — so retrying ` +
          'shortly is reasonable, which is what the code is for.',
      )
    }
    return await bridge.members.request({ guildId, ...options })
  }

  /**
   * Sets what the bot appears to be doing.
   *
   * @param options - The status and activities to show.
   * @returns Once every connected shard has been told.
   *
   * @remarks
   * **Sent to every shard, because presence is per-connection.** Discord tracks it on the
   * gateway session rather than on the account, so telling one shard leaves the bot showing
   * one thing to the guilds on that shard and something else everywhere else. That is the bug
   * this method exists to make impossible.
   *
   * **Not persisted across a reconnect.** A shard that reconnects identifies afresh and comes
   * back with whatever presence the identify payload carried — `options.gateway.presence` —
   * not with what was last set here. Anything that must survive a reconnect belongs in the
   * client options; this is for changing it afterwards.
   *
   * Shards that are not currently connected are skipped rather than erroring. A fleet where
   * one shard is mid-reconnect is normal, and refusing to update the other hundred because of
   * it would make this unusable on exactly the bots that need it.
   *
   * **There is no way to read the result back.** Discord does not send a bot its own
   * `PRESENCE_UPDATE` — that event is about other members — and no REST route returns it.
   * Measured against the live gateway: setting several presences in a row with the
   * `GuildPresences` intent produced no dispatch about the bot at all. What this method can
   * confirm is that the payload was well formed, because a malformed opcode 3 closes the
   * socket with 4002; what the presence looks like is a thing to see in a Discord client.
   */
  async setPresence(options: PresenceOptions): Promise<void> {
    this.#assertUsable()

    const payload = presencePayload(options, Date.now())

    const sends: Promise<void>[] = []
    for (const shard of this.shards.shards.values()) {
      if (!isConnected(shard.state)) continue
      sends.push(shard.send(payload))
    }
    await Promise.all(sends)
  }

  /**
   * Refuses anything that needs a live client after it has been destroyed.
   *
   * @throws ClientError - If the client was destroyed.
   *
   * @remarks
   * Carries a code rather than only a message, because a caller deciding whether to retry has
   * to tell "this client is finished, build a new one" from "that shard is reconnecting, try
   * again shortly" — and matching on wording stops working the day somebody improves it.
   */
  #assertUsable(): void {
    if (!this.#destroyed) return
    throw new ClientError(
      ClientErrorCode.Destroyed,
      'This client was destroyed. Destroying is not reversible; build a new client.',
    )
  }

  #attachManager(): void {
    this.shards.on('shardSpawn', (shardId) => {
      const shard = this.shards.shards.get(shardId)
      if (shard === undefined) return
      this.#bridges.set(shardId, this.#buildBridge(shard))
    })

    this.shards.on('error', (error, shardId) => {
      this.#onShardError(error, shardId)
    })
  }

  #buildBridge(shard: Shard): ShardBridge {
    return new ShardBridge(shard, {
      router: this.#router,
      intents: this.options.intents,
      hooks: {
        onReady: (shardId) => {
          this.#onShardReady(shardId)
        },
        onResumed: () => undefined,
        onDisconnect: () => undefined,
        onGuildsReady: () => undefined,
        onError: (error, shardId) => {
          this.#onShardError(error, shardId)
        },
      },
    })
  }

  #onShardReady(shardId: number): void {
    // READY arrives once per shard, but `ready` promises once per client. Without this a
    // twenty-shard bot fires its startup listener twenty times, and the twenty-first thing
    // anybody writes is a boolean to suppress the extras.
    this.#readyShards.add(shardId)

    // The identity itself is the READY handler's job, and it has normally run by the time this
    // hook fires. Assigning it here as well would give two owners for one field.
    //
    // **The identity is checked before the flag is spent, not after.** The router emits `raw`
    // inside the same `try` as the handler, so a consumer `raw` listener that throws skips the
    // READY handler and leaves the identity unset — and burning the once-per-client flag on
    // that pass meant `ready` could never fire again. The fleet came up, the identity became
    // known on the next shard, and `login()` stayed pending forever: a consumer-side bug
    // wedging the client, which is the class `EventRouter` contains everywhere else.
    const user = this.#context.user
    if (user === undefined) return

    if (this.#announcedReady) return
    this.#announcedReady = true
    this.emit('ready', user)
  }

  #onShardError(error: Error, shardId: number): void {
    // A `FatalGatewayError` carrying a close code is a configuration fault and therefore
    // fleet-wide: a token wrong on shard 7 is wrong on all of them. One without a code is
    // backoff exhaustion — one shard lost its network — and tearing the client down for
    // that turns a transient fault on one connection into a total outage.
    const fleetFatal = error instanceof FatalGatewayError && error.code !== undefined

    this.emit('error', error, { event: 'shard', shardId })
    if (!fleetFatal) return

    void this.destroy(false)
  }

  /**
   * The promise `login()` resolves, plus a way to take it back down.
   *
   * @remarks
   * Both listeners are removed on every exit — resolve, reject and cancel — because each one
   * used to remove only the *other*. `onError` in particular stayed attached forever, so a
   * retry loop accumulated one pair per attempt until Node warned about the leak.
   */
  #firstReady(): { promise: Promise<ClientUser>; cancel: () => void } {
    let detach = (): void => undefined

    const promise = new Promise<ClientUser>((resolve, reject) => {
      const onReady = (user: ClientUser): void => {
        detach()
        resolve(user)
      }
      const onError = (error: Error): void => {
        // Only a fleet-wide fault ends the wait. One shard losing its network is not a login
        // failure, and rejecting on it would fail a fleet that is otherwise coming up.
        if (!(error instanceof FatalGatewayError) || error.code === undefined) return
        detach()
        reject(error)
      }

      detach = (): void => {
        this.off('ready', onReady)
        this.off('error', onError)
      }

      this.once('ready', onReady)
      this.on('error', onError)
    })

    return {
      promise,
      cancel: () => {
        detach()
        // Handled, so an orphan cannot surface later as an unhandled rejection.
        promise.catch(() => undefined)
      },
    }
  }
}
