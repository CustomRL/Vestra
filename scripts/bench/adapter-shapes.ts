/**
 * What a pluggable cache adapter costs at the call site every read goes through.
 *
 * `docs/design/phase-4-core.md` §4.11 leaves a note for exactly this file: "three adapter
 * implementations at a shared call site is polymorphic, not megamorphic, and a fourth (a
 * user's) may cross V8's threshold. That is an assertion about V8, so per CLAUDE.md it stays
 * out of any claim until a benchmark measures it" (§8-D4).
 *
 * `CacheStore.prototype.get` is one function, so `this.#adapter.get(key)` inside it is **one
 * call site shared by every store in the process**. Whatever mix of adapter classes a
 * deployment uses trains that one site. This walks the mix from one class up to eight and
 * reports what each costs.
 *
 * Usage:
 *   node --experimental-strip-types scripts/bench/adapter-shapes.ts [--iterations N]
 */

import type { CacheAdapter, CacheScopeContext } from '@vestra/core'
import { CacheScope, CacheStore, resolveCachePolicy } from '@vestra/core'

const iterations = readIterations(process.argv.slice(2))

/**
 * Reads `--iterations N`.
 *
 * @param argv - Arguments after the script name.
 * @returns How many reads to perform per pass.
 */
function readIterations(argv: readonly string[]): number {
  const at = argv.indexOf('--iterations')
  if (at === -1) return 2_000_000
  const value = Number(argv[at + 1])
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('--iterations needs a positive number.')
  }
  return value
}

/**
 * Runs one case and returns the best nanoseconds-per-read of several passes.
 *
 * @param name - What to print.
 * @param run - The case, which must perform `iterations` reads.
 * @returns The fastest pass, per read.
 */
function measure(name: string, run: () => void): number {
  const passes = 5
  let best = Number.POSITIVE_INFINITY

  run()
  for (let pass = 0; pass < passes; pass += 1) {
    const started = process.hrtime.bigint()
    run()
    best = Math.min(best, Number(process.hrtime.bigint() - started) / iterations)
  }

  console.log(`  ${name.padEnd(30)} ${best.toFixed(2).padStart(8)} ns/read`)
  return best
}

/** A value with nothing interesting in it, so the adapter is what is being timed. */
interface Entry {
  id: string
}

/**
 * Builds a distinct adapter class with identical behaviour.
 *
 * @param label - Only there to make each class distinguishable in a heap dump.
 * @returns A fresh class, and so a fresh hidden class at the call site.
 *
 * @remarks
 * Identical bodies on purpose. If the implementations differed the measurement would confound
 * "V8 has more shapes to check" with "one of them is slower", and only the first is the
 * question §4.11 asks. A real deployment's adapters would of course differ — this is the
 * floor, the cost of plurality alone.
 */
function adapterClass(
  label: string,
): new (context: CacheScopeContext<Entry>) => CacheAdapter<Entry> {
  return class Adapter implements CacheAdapter<Entry> {
    static readonly label = label
    readonly #values = new Map<string, Entry>()

    /**
     * @param context - What the store hands every adapter.
     */
    constructor(context: CacheScopeContext<Entry>) {
      void context
    }

    get(key: string): Entry | undefined {
      return this.#values.get(key)
    }

    set(key: string, value: Entry): void {
      this.#values.set(key, value)
    }

    delete(key: string): boolean {
      return this.#values.delete(key)
    }

    has(key: string): boolean {
      return this.#values.has(key)
    }

    clear(): void {
      this.#values.clear()
    }

    get size(): number {
      return this.#values.size
    }

    keys(): IterableIterator<string> {
      return this.#values.keys()
    }

    values(): IterableIterator<Entry> {
      return this.#values.values()
    }

    entries(): IterableIterator<[string, Entry]> {
      return this.#values.entries()
    }

    sweep(): number {
      return 0
    }
  }
}

const KEYS = 512
const keys: string[] = Array.from({ length: KEYS }, (_unused, index) => `k${String(index)}`)

/** How many stores every case builds, whatever the class count. */
const STORES = 8

/**
 * Eight stores drawing on a pool of `shapes` distinct adapter classes.
 *
 * @param shapes - How many distinct adapter classes the pool holds.
 * @returns Eight stores, in order.
 *
 * @remarks
 * Always eight, so the working set is identical in every case and only the *number of
 * classes* varies. Building one store per class instead made the three-class case walk three
 * times as many `Map`s as the one-class case, which is a cache-locality difference wearing an
 * inline-cache costume.
 */
function storesFor(shapes: number): CacheStore<Entry>[] {
  const classes = Array.from({ length: shapes }, (_unused, index) =>
    adapterClass(`adapter-${String(index)}`),
  )
  return Array.from({ length: STORES }, (_unused, index) => {
    const Adapter = classes[index % shapes] as new (
      context: CacheScopeContext<Entry>,
    ) => CacheAdapter<Entry>
    const store = new CacheStore<Entry>({
      scope: CacheScope.Users,
      policy: resolveCachePolicy<Entry>(CacheScope.Users, true, true),
      keyOf: (entry) => entry.id,
      // The factory is generic over the store's value type; this store's is `Entry`.
      adapter: (context) => new Adapter(context as unknown as CacheScopeContext<Entry>) as never,
    })
    for (const key of keys) store.set(key, { id: key })
    return store
  })
}

let sink = 0

console.log('Reads through CacheStore.get, by how many adapter classes share the call site')

const costs: number[] = []
for (const shapes of [1, 2, 3, 4, 5, 6, 8]) {
  const stores = storesFor(shapes)
  // Precomputed so picking a store costs the same in every case. Selecting with
  // `index % shapes` made 1 and 2 look twice as fast as 3, which was the modulo rather than
  // the inline cache -- the exact confound this benchmark exists to avoid.
  const rotation: CacheStore<Entry>[] = Array.from(
    { length: KEYS },
    (_unused, index) => stores[index % STORES]!,
  )
  const label = `${String(shapes)} adapter class${shapes === 1 ? '' : 'es'}`
  costs.push(
    measure(label, () => {
      for (let index = 0; index < iterations; index += 1) {
        const slot = index & (KEYS - 1)
        if (rotation[slot]!.get(keys[slot]!) !== undefined) {
          sink += 1
        }
      }
    }),
  )
}

const monomorphic = costs[0]
console.log()
console.log(`iterations: ${iterations.toLocaleString('en-US')}, sink: ${String(sink)}`)
if (monomorphic !== undefined) {
  const against = costs.map(
    (cost, index) => `${String([1, 2, 3, 4, 5, 6, 8][index])}:${(cost / monomorphic).toFixed(2)}x`,
  )
  console.log(`against one class — ${against.join('  ')}`)
}
