import {
  GuildReadyTracker,
  MemberChunker,
  ShardState,
  SystemTimers,
  type Shard,
  type Timers,
} from '@vestra/gateway'
import { GatewayIntentBits, GatewayOpcodes, type GatewayDispatchPayload } from '@vestra/types'
import type { DispatchShard } from '../events/EventHandler.js'
import type { EventRouter } from '../events/EventRouter.js'

/**
 * How long the guild stream may go quiet before startup is called finished.
 *
 * @remarks
 * Invented Vestra policy, not protocol — Discord publishes no timing guarantee for the
 * `GUILD_CREATE` stream. Idle rather than absolute, so a large fleet that streams slowly is
 * not cut off partway through.
 */
const GUILD_STREAM_IDLE_MS = 15_000

/**
 * What the bridge reports back to the client.
 *
 * @remarks
 * Callbacks rather than an emitter. The bridge is per-connection and short-lived, and an
 * emitter would add a listener-lifecycle problem to a class whose whole job is to be
 * discarded cleanly — the same reasoning `Transport` gives for its own listener contract.
 */
export interface ShardBridgeHooks {
  /** A shard finished identifying, and the READY dispatch has already been handled. */
  onReady: (shardId: number) => void
  /** A shard resumed an existing session. */
  onResumed: (shardId: number) => void
  /** A shard's socket closed. */
  onDisconnect: (shardId: number, code: number, reason: string) => void
  /** A shard's initial guild stream finished draining. */
  onGuildsReady: (shardId: number, unresolved: readonly string[]) => void
  /** Something went wrong on the shard itself. */
  onError: (error: Error, shardId: number) => void
}

/** What the bridge needs beyond the shard. */
export interface ShardBridgeOptions {
  /** Where dispatches go once the session mechanics have run. */
  router: EventRouter
  /** What to report back. */
  hooks: ShardBridgeHooks
  /** The intents, so the chunker can refuse a request Discord would silently drop. */
  intents: number
  /** Timer sources. */
  timers?: Timers
}

/**
 * Everything per-shard that must not survive a reconnect.
 *
 * @remarks
 * One per shard, built from the `shardSpawn` listener before `connect()` is called, and
 * destroyed with the client. It owns the two gateway companions nothing else wires up —
 * {@link GuildReadyTracker} and {@link MemberChunker} — which are exported, documented and
 * unit-tested in `@vestra/gateway` and constructed by nobody there.
 *
 * On each dispatch it runs exactly two things, in order: the session mechanics, then the
 * router. The mechanics are deliberately **not** handlers. They have no cache effect and
 * emit no client event, they must run before any consumer sees the dispatch, and — the
 * decisive reason — they must keep working even if their event is later moved out of the
 * handled set. Putting `chunker.handleChunk` in a handler would make the opt-out list
 * capable of breaking `guild.members.fetch()`.
 */
export class ShardBridge {
  readonly #shard: Shard
  readonly #router: EventRouter
  readonly #hooks: ShardBridgeHooks
  readonly #timers: Timers
  readonly #intents: number
  readonly #chunker: MemberChunker

  /**
   * The guild-stream tracker for the current connection.
   *
   * @remarks
   * Replaced rather than re-seeded on a fresh identify. The tracker is one-shot: it sets a
   * done flag it never clears, so calling `seed()` on a completed instance does nothing at
   * all and the completion signal never fires again.
   */
  #tracker: GuildReadyTracker | undefined
  #guildsPending = false
  #destroyed = false

  /**
   * @param shard - The shard to bridge.
   * @param options - Where dispatches go, and what to report back.
   */
  constructor(shard: Shard, options: ShardBridgeOptions) {
    this.#shard = shard
    this.#router = options.router
    this.#hooks = options.hooks
    this.#timers = options.timers ?? SystemTimers
    this.#intents = options.intents

    this.#chunker = new MemberChunker(
      async (data) => {
        await shard.send({ op: GatewayOpcodes.RequestGuildMembers, d: data })
      },
      this.#timers,
      this.#intents,
    )

    this.#attach()
  }

  /** The narrowed view handlers receive. */
  get view(): DispatchShard {
    return {
      id: this.#shard.id,
      state: this.#shard.state,
      guildsPending: this.#guildsPending,
    }
  }

  /** Requests guild members over the gateway. */
  get members(): MemberChunker {
    return this.#chunker
  }

  /**
   * Rejects anything outstanding and stops bridging.
   *
   * @param reason - Why, which is what pending member requests reject with.
   *
   * @remarks
   * Idempotent. `destroy()` may run more than once — a client shutting down after a fatal
   * close, say — and a bridge that threw the second time would turn one failure into two.
   */
  destroy(reason: Error): void {
    if (this.#destroyed) return
    this.#destroyed = true

    this.#tracker?.stop()
    this.#tracker = undefined
    this.#chunker.reset(reason)
  }

  #attach(): void {
    const shard = this.#shard

    shard.on('resumed', () => {
      // Deliberately no tracker restart: the guild stream does not replay on a resume, so
      // seeding one here would leave a pending set that never drains.
      this.#hooks.onResumed(shard.id)
    })

    shard.on('closed', (code, reason) => {
      this.#hooks.onDisconnect(shard.id, code, reason)
    })

    shard.on('error', (error) => {
      this.#hooks.onError(error, shard.id)
    })

    shard.on('dispatch', (payload, replayed) => {
      this.#onDispatch(payload, replayed)
    })
  }

  #startTracker(guildIds: readonly string[]): void {
    this.#tracker?.stop()

    // Without the Guilds intent no GUILD_CREATE ever arrives, so a tracker would hold a
    // pending set that can never drain. The gateway's tracker already encodes that; this
    // just avoids arming one at all.
    const enabled = (this.#intents & GatewayIntentBits.Guilds) !== 0
    if (!enabled || guildIds.length === 0) {
      this.#guildsPending = false
      this.#hooks.onGuildsReady(this.#shard.id, [])
      return
    }

    this.#guildsPending = true
    const tracker = new GuildReadyTracker(
      { idleMs: GUILD_STREAM_IDLE_MS, enabled: true },
      this.#timers,
      (unresolved) => {
        this.#guildsPending = false
        this.#hooks.onGuildsReady(this.#shard.id, unresolved)
      },
    )
    tracker.seed([...guildIds])
    this.#tracker = tracker
  }

  #onDispatch(payload: GatewayDispatchPayload, replayed: boolean): void {
    if (this.#destroyed) return

    // Session mechanics first, and never as handlers. They have no cache effect, emit no
    // client event, and must keep working regardless of which events are handled.
    if (payload.t === 'READY') {
      // A fresh identify means a new session, so anything scoped to the old one is dead:
      // outstanding member requests reject rather than hanging, and the tracker is replaced
      // rather than re-seeded, because it is one-shot and cannot be re-used.
      this.#chunker.reset(new Error('The session was replaced by a fresh identify.'))
      this.#startTracker(payload.d.guilds.map((guild) => guild.id))
    }

    switch (payload.t) {
      case 'GUILD_CREATE':
      case 'GUILD_DELETE':
        this.#tracker?.resolve(payload.d.id)
        break
      case 'GUILD_MEMBERS_CHUNK':
        this.#chunker.handleChunk(payload.d)
        break
      default:
        break
    }

    this.#router.route(payload, this.view, replayed)

    // Reported *after* routing, deliberately. `Shard` emits its own `ready` before the
    // matching `dispatch`, so a bridge that reported readiness from that event told the
    // client a shard was up before the READY handler had set the identity — and a client
    // announcing readiness with no identity to announce hangs `login()` forever.
    if (payload.t === 'READY') this.#hooks.onReady(this.#shard.id)
  }
}

/** Whether a shard is in a state that can still carry traffic. */
export function isConnected(state: ShardState): boolean {
  return state === ShardState.Ready || state === ShardState.Resuming
}
