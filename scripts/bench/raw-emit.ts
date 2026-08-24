/**
 * What the extra `raw` emit costs.
 *
 * `docs/design/phase-4-core.md` §8-D5 records that every dispatch pays one additional `emit`
 * "whether or not anyone listens", and that per CLAUDE.md the claim needs a measurement —
 * including the claim that it is free. This is that measurement.
 *
 * It reports four numbers:
 *
 *   - **emit, no listeners** — what the `raw` emit costs when nobody is watching, which is
 *     the case the design is defending.
 *   - **emit, one listener** — the same call with a consumer attached.
 *   - **route, raw emitted** — a full `EventRouter.route`, which is the figure the emit has
 *     to be read against.
 *   - **route, raw suppressed** — the same route with no `raw` listener *and* the emit
 *     skipped, so the difference is the emit itself rather than the listener.
 *
 * Usage:
 *   node --experimental-strip-types scripts/bench/raw-emit.ts [--iterations 500000]
 */

import { EventEmitter } from 'node:events'
import { ShardState } from '@vestra/gateway'
import {
  CacheRegistry,
  EventRouter,
  handlers,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'
import { GatewayOpcodes, type GatewayDispatchPayload } from '@vestra/types'

const iterations = readIterations(process.argv.slice(2))

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }

/**
 * A `CHANNEL_UPDATE`, chosen for being an ordinary cache write with no sub-structures.
 *
 * @remarks
 * A `MESSAGE_CREATE` would fold author and member conversion into the same number and make
 * the emit look cheaper than it is by comparison. The point here is the emit, so the handler
 * beside it should be a plain one.
 */
const payload = {
  op: GatewayOpcodes.Dispatch,
  t: 'CHANNEL_UPDATE',
  s: 1,
  d: {
    id: '3',
    type: 0,
    guild_id: '613425648685547541',
    name: 'general',
    position: 0,
    nsfw: false,
    parent_id: null,
    permission_overwrites: [],
  },
} as unknown as GatewayDispatchPayload

/**
 * Reads `--iterations N`.
 *
 * @param argv - Arguments after the script name.
 * @returns How many times to run each case.
 */
function readIterations(argv: readonly string[]): number {
  const at = argv.indexOf('--iterations')
  if (at === -1) return 500_000
  const value = Number(argv[at + 1])
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('--iterations needs a positive number.')
  }
  return value
}

/**
 * Runs one case and returns the best nanoseconds-per-iteration of several passes.
 *
 * @param name - What to print.
 * @param run - The case, which must do `iterations` units of work.
 * @returns The fastest pass, per iteration.
 *
 * @remarks
 * The minimum rather than the mean, which is the usual choice for a microbenchmark: every
 * source of error here — a GC pause, the scheduler, another process — makes a pass slower and
 * none makes it faster, so the fastest pass is the one least contaminated. Taking the mean of
 * a single pass each gave a 133–246ns spread on the route cases and made a 10ns difference
 * unreadable.
 */
function measure(name: string, run: () => void): number {
  const passes = 5
  let best = Number.POSITIVE_INFINITY

  // One untimed pass first, so the shapes are warm and the JIT has seen the loop.
  run()
  for (let pass = 0; pass < passes; pass += 1) {
    const started = process.hrtime.bigint()
    run()
    best = Math.min(best, Number(process.hrtime.bigint() - started) / iterations)
  }

  console.log(`${name.padEnd(24)} ${best.toFixed(1).padStart(8)} ns`)
  return best
}

/** A context backed by a real emitter, so `emit` costs what it costs in a client. */
function contextOver(emitter: EventEmitter, emitRaw: boolean): EventContext {
  return {
    cache: new CacheRegistry({ channels: true, guilds: true }),
    rest: undefined,
    user: undefined,
    emit: (event: string, ...args: unknown[]) => {
      if (event === 'raw' && !emitRaw) return false
      return emitter.emit(event, ...args)
    },
    listenerCount: (event: string) => emitter.listenerCount(event),
  } as unknown as EventContext
}

let sink = 0

const bare = new EventEmitter()
const emitNoListeners = measure('emit, no listeners', () => {
  for (let index = 0; index < iterations; index += 1) bare.emit('raw', payload, 0, false)
})

const watched = new EventEmitter()
watched.on('raw', () => {
  sink += 1
})
const emitOneListener = measure('emit, one listener', () => {
  for (let index = 0; index < iterations; index += 1) watched.emit('raw', payload, 0, false)
})

const withRaw = new EventRouter(contextOver(new EventEmitter(), true), handlers)
const routeWithRaw = measure('route, raw emitted', () => {
  for (let index = 0; index < iterations; index += 1) withRaw.route(payload, shard, false)
})

const withoutRaw = new EventRouter(contextOver(new EventEmitter(), false), handlers)
const routeWithoutRaw = measure('route, raw suppressed', () => {
  for (let index = 0; index < iterations; index += 1) withoutRaw.route(payload, shard, false)
})

console.log()
console.log(`iterations: ${iterations.toLocaleString('en-US')}, sink: ${String(sink)}`)
console.log(`the emit alone, unwatched:  ${emitNoListeners.toFixed(1)} ns`)
console.log(`with a listener attached:   ${emitOneListener.toFixed(1)} ns`)
const share = ((routeWithRaw - routeWithoutRaw) / routeWithRaw) * 100
console.log(`a dispatch, with it:        ${routeWithRaw.toFixed(1)} ns`)
console.log(`its share of a dispatch:    ${share.toFixed(1)}%`)
