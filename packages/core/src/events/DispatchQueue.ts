import type { GatewayDispatchPayload } from '@vestra/types'
import { EventHandlerError } from '../errors/EventHandlerError.js'
import type { DispatchShard } from './EventHandler.js'

/** How many payloads a queue holds before it starts discarding. */
export const DEFAULT_MAX_QUEUED = 1024

/**
 * The batch being filled while a queue routes a dispatch.
 *
 * @remarks
 * Module-level, and safe because the window it is set for is strictly synchronous: a queue
 * assigns it, calls `route`, and restores it before yielding. JavaScript is single-threaded,
 * so no second queue can be inside that window at the same time, and the save-and-restore
 * means a nested route — which cannot happen today — would still not lose the outer batch.
 *
 * The alternative was threading a collector from the shard's queue, through the client's
 * `emit` override, to a listener invocation several frames away. That plumbing would exist
 * only to re-derive the fact that there is exactly one queue running at any instant.
 */
let activeBatch: PromiseLike<unknown>[] | undefined

/**
 * Hands a listener's return value to the queue currently draining, if there is one.
 *
 * @param result - Whatever the listener returned.
 *
 * @remarks
 * Anything that is not thenable is ignored, so a listener returning `false` or a number
 * costs one `typeof`. Outside a drain this does nothing at all, which is what keeps the
 * default path free: a client with serial mode off never calls it.
 */
export function collectListenerResult(result: unknown): void {
  if (activeBatch === undefined || result === null || typeof result !== 'object') return
  const then = (result as { then?: unknown }).then
  if (typeof then === 'function') activeBatch.push(result as PromiseLike<unknown>)
}

/** One dispatch, waiting its turn. */
interface Queued {
  payload: GatewayDispatchPayload
  shard: DispatchShard
  replayed: boolean
  after: (() => void) | undefined
}

/** What a queue needs from the client that owns it. */
export interface DispatchQueueOptions {
  /** Routes one dispatch. Synchronous, as handlers are. */
  route: (payload: GatewayDispatchPayload, shard: DispatchShard, replayed: boolean) => void
  /** Reports a listener whose promise rejected. */
  onListenerError: (error: EventHandlerError, event: string, shardId: number) => void
  /** Reports a payload discarded by overflow. */
  onDropped: (payload: GatewayDispatchPayload, shardId: number, depth: number) => void
  /** How many payloads may wait. */
  maxQueued?: number
}

/**
 * Delivers dispatches to listeners one at a time.
 *
 * @remarks
 * One per shard, never one globally. Sequence ordering is only defined within a session, so
 * a global queue would serialise a forty-shard fleet behind one consumer's slow listener and
 * make an unrelated shard's heartbeat collateral damage.
 *
 * **What it awaits is what the client's `emit` collected.** `EventEmitter.prototype.emit`
 * returns `boolean` and returns before an `async` listener settles, so there is nothing in
 * it to wait on. Serial mode's `Client.emit` invokes `rawListeners(event)` itself and passes
 * each return value to {@link collectListenerResult}; this class awaits that batch before
 * dequeuing the next payload. That is the whole mechanism.
 *
 * **A promise a listener returns stops being ignored.** In the default path it is discarded;
 * here it is a completion signal, so an `async` listener written for some unrelated reason
 * starts holding up the queue simply by being `async`. That is a real behavioural change and
 * the reason the mode is opt-in.
 *
 * **With no async listeners it does not yield at all.** The batch is empty, the `await` is
 * skipped, and the drain runs to completion inside `push`, so §4.8's claim that the serial
 * path "costs a microtask per dispatch even with no async listeners" is not true of this
 * implementation. `scripts/bench/dispatch-queue.ts` measures what it does cost: about **65ns**
 * per dispatch over the direct path with a synchronous listener, and about **300ns** with an
 * `async` one, on Node 25 on the machine that ran it. Both are noise beside a socket read.
 */
export class DispatchQueue {
  readonly #options: DispatchQueueOptions
  readonly #maxQueued: number
  /**
   * The backlog, read from {@link DispatchQueue.#head} rather than the front.
   *
   * @remarks
   * A moving head index instead of `shift()`. `Array.prototype.shift` moves every remaining
   * element, so draining a full queue is quadratic in its depth — measured at 40µs per
   * dispatch on a 50,000-deep queue, against 190ns when it does not grow. A backlog is
   * exactly the situation this class exists for, so paying most for it was backwards.
   */
  #pending: Queued[] = []
  #head = 0
  #draining = false

  /**
   * @param options - Where dispatches go, and what to report.
   */
  constructor(options: DispatchQueueOptions) {
    this.#options = options
    this.#maxQueued = options.maxQueued ?? DEFAULT_MAX_QUEUED
  }

  /** How many payloads are waiting. */
  get depth(): number {
    return this.#pending.length - this.#head
  }

  /**
   * Adds a dispatch, and starts draining if nothing else is.
   *
   * @param payload - The dispatch, as it arrived.
   * @param shard - Which shard delivered it.
   * @param replayed - Whether this is a replay after a resume.
   * @param after - Run once this payload has been routed, before its listeners are awaited.
   *
   * @remarks
   * `after` exists for READY and nothing else. The bridge announces a shard ready only once
   * the READY handler has set the client's identity, and in serial mode that no longer
   * happens inside the shard's dispatch event. Running it after `route` rather than after
   * the await is deliberate: `login()` must not be held open by a slow listener.
   *
   * **Overflow drops the newest.** Drop-oldest silently reorders causality — a
   * `MESSAGE_DELETE` surviving while its `MESSAGE_CREATE` is discarded is worse than a
   * contiguous gap. Closing the shard and resuming looks symmetric with the gateway's own
   * back-pressure handling and is not: the replay lands in this same queue behind the same
   * slow listener, turning a backlog into a reconnect loop.
   */
  push(
    payload: GatewayDispatchPayload,
    shard: DispatchShard,
    replayed: boolean,
    after?: () => void,
  ): void {
    if (this.depth >= this.#maxQueued) {
      this.#options.onDropped(payload, shard.id, this.depth)
      return
    }

    this.#pending.push({ payload, shard, replayed, after })
    if (!this.#draining) void this.#drain()
  }

  /**
   * Discards everything waiting.
   *
   * @param reason - Why. Decides nothing here; it is what the caller reports.
   * @returns How many payloads were discarded.
   *
   * @remarks
   * Called on a fresh identify and on destroy, never on a resume. A backlog belonging to a
   * dead session carries sequence numbers that no longer mean anything; a resumed session's
   * backlog is still in order and still wanted.
   *
   * The payload being routed right now is not affected — it has already left the queue, and
   * abandoning a dispatch halfway through its handler would leave the cache holding half of
   * it.
   */
  clear(reason: 'identify' | 'destroy'): number {
    void reason
    const discarded = this.depth
    this.#pending = []
    this.#head = 0
    return discarded
  }

  async #drain(): Promise<void> {
    this.#draining = true
    try {
      for (let next = this.#take(); next !== undefined; next = this.#take()) {
        const batch = this.#routeCollecting(next)
        if (batch.length === 0) continue
        await this.#settle(batch, next.payload.t, next.shard.id)
      }
    } finally {
      this.#draining = false
    }
  }

  /**
   * Removes the oldest payload, or returns `undefined` when the backlog is empty.
   *
   * @remarks
   * The consumed slot is released so a long-lived payload cannot be pinned by an array the
   * queue is still using, and the array is only rebuilt once it is entirely consumed —
   * which is the common case, since a drain runs until the backlog is empty.
   */
  #take(): Queued | undefined {
    if (this.#head >= this.#pending.length) {
      if (this.#head > 0) {
        this.#pending = []
        this.#head = 0
      }
      return undefined
    }

    const next = this.#pending[this.#head]
    this.#pending[this.#head] = undefined as unknown as Queued
    this.#head += 1
    return next
  }

  /** Routes one payload with the collector armed, and returns what listeners handed back. */
  #routeCollecting(next: Queued): PromiseLike<unknown>[] {
    const batch: PromiseLike<unknown>[] = []
    const outer = activeBatch
    activeBatch = batch
    try {
      this.#options.route(next.payload, next.shard, next.replayed)
    } finally {
      activeBatch = outer
    }
    next.after?.()
    return batch
  }

  /**
   * Waits for one dispatch's listeners, reporting any that rejected.
   *
   * @param batch - What the listeners returned.
   * @param event - The dispatch they were emitted for.
   * @param shardId - Which shard delivered it.
   *
   * @remarks
   * `allSettled` rather than `all`, because one listener rejecting must not cancel the wait
   * on the others — they are unrelated consumers who happen to share an event.
   *
   * Every rejection is then reported rather than dropped. Awaiting a promise marks it
   * handled, so a rejection that reached `unhandledRejection` on the default path would
   * disappear the moment serial mode was switched on. The router's own policy applies
   * instead: to an `error` listener if there is one, and loudly on a clean tick if not.
   */
  async #settle(batch: PromiseLike<unknown>[], event: string, shardId: number): Promise<void> {
    // One listener is the common case by a wide margin, and `allSettled` is not cheap for
    // it: it allocates a wrapper promise and a result object per entry on top of the one
    // promise that actually needed waiting on. `scripts/bench/dispatch-queue.ts` measured
    // roughly 2.5x: 1,159ns per dispatch through `allSettled` against 450ns for a bare await,
    // on the single-pass timing in use when the fast path was added.
    const only = batch.length === 1 ? batch[0] : undefined
    if (only !== undefined) {
      try {
        await only
      } catch (reason) {
        this.#options.onListenerError(new EventHandlerError(event, reason), event, shardId)
      }
      return
    }

    const results = await Promise.allSettled(batch)
    for (const result of results) {
      if (result.status !== 'rejected') continue
      this.#options.onListenerError(new EventHandlerError(event, result.reason), event, shardId)
    }
  }
}
