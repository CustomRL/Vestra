/**
 * What serial dispatch costs.
 *
 * `docs/design/phase-4-core.md` §4.8 asserted that "the serial path costs a microtask per
 * dispatch even with no async listeners". CLAUDE.md says a performance claim needs a
 * measurement rather than an argument about V8, and this is the measurement. It reports
 * three numbers per run:
 *
 *   - **direct** — the default path: the router called straight from the shard bridge.
 *   - **queued, sync listener** — serial mode where nothing returns a promise.
 *   - **queued, async listener** — serial mode where every dispatch yields.
 *
 * Usage:
 *   node --experimental-strip-types scripts/bench/dispatch-queue.ts [--iterations 200000]
 */

import { ShardState } from '@vestra/gateway'
import {
  DispatchQueue,
  collectListenerResult,
  type DispatchShard,
  type EventHandlerError,
} from '@vestra/core'
import { GatewayOpcodes, type GatewayDispatchPayload } from '@vestra/types'

const iterations = readIterations(process.argv.slice(2))

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }
const payload = {
  op: GatewayOpcodes.Dispatch,
  t: 'TYPING_START',
  s: 1,
  d: {},
} as unknown as GatewayDispatchPayload

/**
 * Reads `--iterations N`, defaulting high enough for the numbers to mean something.
 *
 * @param argv - Arguments after the script name.
 * @returns How many dispatches to push per case.
 */
function readIterations(argv: readonly string[]): number {
  const at = argv.indexOf('--iterations')
  if (at === -1) return 200_000
  const value = Number(argv[at + 1])
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('--iterations needs a positive number.')
  }
  return value
}

/**
 * Stands in for the client's emit seam.
 *
 * @param work - What the listener does.
 * @returns A function that invokes it the way `Client` does in serial mode.
 *
 * @remarks
 * Deliberately the same two steps the real seam takes — call the listener, hand the return
 * value to {@link collectListenerResult} — because the cost being measured is that pair and
 * not the router's own work. Running the real router here would bury a microtask under a
 * cache write.
 */
function seam(work: () => unknown): () => void {
  return () => {
    collectListenerResult(work())
  }
}

/** Runs one case and returns nanoseconds per dispatch. */
async function measure(name: string, run: () => Promise<void> | void): Promise<number> {
  // One untimed pass so the shapes are warm and the JIT has seen the loop.
  await run()

  const started = process.hrtime.bigint()
  await run()
  const elapsed = Number(process.hrtime.bigint() - started)

  const perDispatch = elapsed / iterations
  console.log(`${name.padEnd(28)} ${perDispatch.toFixed(1).padStart(8)} ns/dispatch`)
  return perDispatch
}

/** Builds a queue whose route step is the given emit seam. */
function queueOver(emit: () => void): DispatchQueue {
  return new DispatchQueue({
    maxQueued: iterations + 1,
    route: emit,
    onListenerError: (error: EventHandlerError) => {
      throw error
    },
    onDropped: () => {
      throw new Error('the bench overflowed its own queue')
    },
  })
}

let sink = 0

const direct = await measure('direct', () => {
  const emit = seam(() => {
    sink += 1
  })
  for (let index = 0; index < iterations; index += 1) emit()
})

const queuedSync = await measure('queued, sync listener', () => {
  const queue = queueOver(
    seam(() => {
      sink += 1
    }),
  )
  for (let index = 0; index < iterations; index += 1) queue.push(payload, shard, false)
})

const queuedAsync = await measure('queued, async listener', async () => {
  let settle: (() => void) | undefined
  const queue = queueOver(
    seam(async () => {
      sink += 1
      await Promise.resolve()
    }),
  )

  const finished = new Promise<void>((resolve) => {
    settle = resolve
  })
  for (let index = 0; index < iterations; index += 1) queue.push(payload, shard, false)
  // The last push leaves the drain mid-flight, so wait for the queue to empty rather than
  // timing a loop that has not finished.
  const poll = setInterval(() => {
    if (queue.depth === 0) {
      clearInterval(poll)
      settle?.()
    }
  }, 1)
  await finished
})

console.log()
console.log(`iterations: ${iterations.toLocaleString('en-US')}, sink: ${String(sink)}`)
console.log(`queue overhead, sync listeners:  ${(queuedSync - direct).toFixed(1)} ns/dispatch`)
console.log(`queue overhead, async listeners: ${(queuedAsync - direct).toFixed(1)} ns/dispatch`)
