/**
 * What hand-written structures buy, and what eager sub-structure conversion costs.
 *
 * Two of `docs/design/phase-4-core.md` §8's unresolved measurements:
 *
 *   - **D1.** §4.15 rejects a generic payload transform on a "~25–36x" figure taken from a
 *     scratch benchmark that was never committed, so the repository may not quote it. The
 *     decisive half of that argument is not speed at all — it is that a generic transform
 *     copies the keys that *arrived*, giving each partial payload its own hidden class and
 *     turning `message.content` in consumer code polymorphic. Both halves are measured here.
 *   - **D2.** `Message` allocates a `User` for its author whether or not anybody reads it.
 *     The retention argument against lazy conversion is a mechanism rather than a
 *     measurement: a lazy structure pins the raw payload. Both directions are measured, and
 *     with `--expose-gc` the retained bytes are measured too.
 *
 * Usage:
 *   node --experimental-strip-types scripts/bench/structure-construction.ts [--iterations N]
 *   node --experimental-strip-types --expose-gc scripts/bench/structure-construction.ts
 */

import type { APIUser, GatewayMessageCreateDispatchData } from '@vestra/types'
import { Message, User } from '@vestra/core'

const iterations = readIterations(process.argv.slice(2))

/**
 * Reads `--iterations N`.
 *
 * @param argv - Arguments after the script name.
 * @returns How many objects to build per pass.
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
 * Runs one case and returns the best nanoseconds-per-iteration of several passes.
 *
 * @param name - What to print.
 * @param run - The case, which must do `iterations` units of work.
 * @returns The fastest pass, per iteration.
 *
 * @remarks
 * The minimum rather than the mean. Every source of error here — a GC pause, the scheduler,
 * another process — makes a pass slower and none makes it faster.
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

  console.log(`  ${name.padEnd(34)} ${best.toFixed(1).padStart(8)} ns`)
  return best
}

/**
 * Where every built object goes, so V8 cannot delete the allocation being measured.
 *
 * @remarks
 * Not decoration. Without an escape, scalar replacement removes a constructor whose result
 * never leaves the loop: the first version of this benchmark timed the lazy message at
 * **1.6ns**, which is not a four-field allocation, it is no allocation at all. Real
 * structures go into a cache or out as an event argument, so escaping is also the honest
 * model of what happens to them.
 */
const escape: unknown[] = new Array<unknown>(1024)

/** Accumulates reads so a loop cannot be optimised away. */
let sink = 0

// --- D1. Hand-written against generic, and the shape divergence behind it. ---

/** Every key any variant can carry, with its camelCase name, in a fixed order. */
const FIELDS: readonly (readonly [string, string])[] = [
  ['id', 'id'],
  ['channel_id', 'channelId'],
  ['guild_id', 'guildId'],
  ['content', 'content'],
  ['timestamp', 'timestamp'],
  ['edited_timestamp', 'editedTimestamp'],
  ['tts', 'tts'],
  ['mention_everyone', 'mentionEveryone'],
  ['mention_roles', 'mentionRoles'],
  ['attachments', 'attachments'],
  ['embeds', 'embeds'],
  ['pinned', 'pinned'],
  ['webhook_id', 'webhookId'],
  ['type', 'type'],
  ['flags', 'flags'],
  ['nonce', 'nonce'],
  ['position', 'position'],
]

/** The complete payload, as a create carries it. */
const FULL: Record<string, unknown> = {
  id: '1',
  channel_id: '2',
  guild_id: '3',
  content: 'full',
  timestamp: '2024-01-01T00:00:00+00:00',
  edited_timestamp: null,
  tts: false,
  mention_everyone: false,
  mention_roles: [],
  attachments: [],
  embeds: [],
  pinned: false,
  webhook_id: undefined,
  type: 0,
  flags: 0,
  nonce: 'n',
  position: 0,
}

/**
 * The full payload plus eleven subsets of it, each a distinct key set.
 *
 * @remarks
 * Twelve rather than three, and the count is the whole point. V8's inline caches stay fast up
 * to four shapes and only go megamorphic past that — so the first version of this benchmark,
 * which used three variants, found the generic transform *faster* to read from than the
 * hand-written one. It was measuring polymorphism that costs nothing.
 *
 * A real bot sees far more than four `MESSAGE_UPDATE` subsets, since Discord sends whichever
 * fields changed. Twelve is the conservative end of realistic rather than a stacked deck.
 */
const VARIANTS: Record<string, unknown>[] = [
  FULL,
  ...Array.from({ length: 11 }, (_unused, index) => {
    const subset: Record<string, unknown> = { id: '1', channel_id: '2', content: 'edit' }
    for (let field = 0; field < FIELDS.length; field += 1) {
      const pair = FIELDS[field]
      if (pair === undefined) continue
      const [from] = pair
      if (from === 'id' || from === 'channel_id' || from === 'content') continue
      // A different, deterministic slice of the remaining fields for each variant.
      if ((field * (index + 2)) % 5 < 2) subset[from] = FULL[from]
    }
    return subset
  }),
]

/** What Vestra writes: every field, in a fixed order, present or not. */
class HandWritten {
  declare id: unknown
  declare channelId: unknown
  declare guildId: unknown
  declare content: unknown
  declare timestamp: unknown
  declare editedTimestamp: unknown
  declare tts: unknown
  declare mentionEveryone: unknown
  declare mentionRoles: unknown
  declare attachments: unknown
  declare embeds: unknown
  declare pinned: unknown
  declare webhookId: unknown
  declare type: unknown
  declare flags: unknown
  declare nonce: unknown
  declare position: unknown

  /**
   * @param data - The payload to mirror.
   */
  constructor(data: Record<string, unknown>) {
    this.id = data.id
    this.channelId = data.channel_id
    this.guildId = data.guild_id
    this.content = data.content
    this.timestamp = data.timestamp
    this.editedTimestamp = data.edited_timestamp
    this.tts = data.tts
    this.mentionEveryone = data.mention_everyone
    this.mentionRoles = data.mention_roles
    this.attachments = data.attachments
    this.embeds = data.embeds
    this.pinned = data.pinned
    this.webhookId = data.webhook_id
    this.type = data.type
    this.flags = data.flags
    this.nonce = data.nonce
    this.position = data.position
  }
}

/**
 * The obvious generic version: walk what arrived and camelCase it.
 *
 * @param data - The payload.
 * @returns The transformed object.
 *
 * @remarks
 * Deliberately naive on the string work, which is why {@link genericMapped} exists beside it.
 * On its own this number would confuse "converting names is slow" with "keyed stores are
 * slow", and only the second is an argument about the approach.
 */
function genericShallow(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key in data) {
    const camel = key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())
    out[camel] = data[key]
  }
  return out
}

/** The generic version with every trace of string work removed, to isolate what is left. */
function genericMapped(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const pair of FIELDS) {
    if (pair[0] in data) out[pair[1]] = data[pair[0]]
  }
  return out
}

console.log(`D1. Construction, 17 fields, ${String(VARIANTS.length)} payload variants`)

const handWritten = measure('hand-written, fixed order', () => {
  for (let index = 0; index < iterations; index += 1) {
    escape[index & 1023] = new HandWritten(VARIANTS[index % VARIANTS.length] as never)
  }
})

const shallow = measure('generic, camelCase per key', () => {
  for (let index = 0; index < iterations; index += 1) {
    escape[index & 1023] = genericShallow(VARIANTS[index % VARIANTS.length] as never)
  }
})

const mapped = measure('generic, precomputed key map', () => {
  for (let index = 0; index < iterations; index += 1) {
    escape[index & 1023] = genericMapped(VARIANTS[index % VARIANTS.length] as never)
  }
})

// --- D1b. What a consumer pays afterwards, which is the decisive half. ---

/**
 * Reads one field off each of a batch, the way a listener would.
 *
 * @param batch - What the transform produced.
 * @returns How many were non-empty, so the loop cannot be optimised away.
 *
 * @remarks
 * Separate from construction on purpose. A generic transform's real cost is not paid where it
 * runs — it is paid in every consumer that reads a field off what it produced, because each
 * payload variant left behind a different hidden class.
 */
function readContent(batch: readonly { content?: unknown }[]): number {
  let found = 0
  for (const item of batch) if (item.content !== undefined) found += 1
  return found
}

const BATCH = 3_000
const handBatch: HandWritten[] = []
const shallowBatch: Record<string, unknown>[] = []
const mappedBatch: Record<string, unknown>[] = []
for (let index = 0; index < BATCH; index += 1) {
  const variant = VARIANTS[index % VARIANTS.length]!
  handBatch.push(new HandWritten(variant))
  shallowBatch.push(genericShallow(variant))
  mappedBatch.push(genericMapped(variant))
}

console.log()
console.log(`D1b. A consumer reading one field, ${String(BATCH)} objects per pass`)

const reads = Math.ceil(iterations / BATCH)
const readHand = measure('hand-written, one hidden class', () => {
  for (let pass = 0; pass < reads; pass += 1) sink += readContent(handBatch)
})
const readShallow = measure('generic, one class per variant', () => {
  for (let pass = 0; pass < reads; pass += 1) sink += readContent(shallowBatch)
})
measure('generic mapped, same', () => {
  for (let pass = 0; pass < reads; pass += 1) sink += readContent(mappedBatch)
})

// --- D2. Eager sub-structure conversion. ---

const AUTHOR: APIUser = {
  id: '80351110224678912',
  username: 'nelly',
  discriminator: '0',
  global_name: null,
  avatar: '8342729096ea3675442027381ff50dfe',
}

/**
 * A message payload as Discord actually sends one.
 *
 * @remarks
 * Carries the fields `Message` does not model — `components`, `sticker_items`, `nonce`,
 * `referenced_message` and the rest — because those are exactly what a lazy structure would
 * pin and an eager one would drop. A trimmed fixture makes the retention argument look
 * weaker than it is by removing the part that is retained.
 */
const MESSAGE = {
  id: '334385199974967042',
  channel_id: '290926798999357250',
  guild_id: '290926798626357250',
  author: AUTHOR,
  content: 'Supa Hot',
  timestamp: '2024-01-01T00:00:00+00:00',
  edited_timestamp: null,
  tts: false,
  mention_everyone: false,
  mentions: [],
  mention_roles: [],
  attachments: [],
  embeds: [],
  pinned: false,
  type: 0,
  flags: 0,
  nonce: '334385199974967042',
  position: 0,
  components: [],
  sticker_items: [],
  reactions: [],
  message_reference: { channel_id: '290926798999357250', message_id: '3' },
  referenced_message: null,
  thread: null,
  resolved: null,
} as unknown as GatewayMessageCreateDispatchData

/** The same message, converting its author only when somebody asks for one. */
class LazyMessage {
  declare id: string
  declare channelId: string
  declare content: string | undefined
  readonly #data: GatewayMessageCreateDispatchData
  #author: User | undefined

  /**
   * @param data - The payload to mirror.
   */
  constructor(data: GatewayMessageCreateDispatchData) {
    this.id = data.id
    this.channelId = data.channel_id
    this.content = data.content
    this.#data = data
    this.#author = undefined
  }

  /** The author, built on first read. */
  get author(): User | undefined {
    this.#author ??= new User(this.#data.author, this)
    return this.#author
  }
}

console.log()
console.log('D2. Eager against lazy sub-structure conversion')

const user = measure('new User alone', () => {
  for (let index = 0; index < iterations; index += 1) {
    escape[index & 1023] = new User(AUTHOR, undefined)
  }
})

const eagerUnread = measure('eager Message, author unread', () => {
  for (let index = 0; index < iterations; index += 1) {
    escape[index & 1023] = new Message(MESSAGE, undefined)
  }
})

measure('eager Message, author read', () => {
  for (let index = 0; index < iterations; index += 1) {
    const built = new Message(MESSAGE, undefined)
    escape[index & 1023] = built
    if (built.author !== undefined) sink += 1
  }
})

const lazyUnread = measure('lazy Message, author unread', () => {
  for (let index = 0; index < iterations; index += 1) {
    escape[index & 1023] = new LazyMessage(MESSAGE)
  }
})

measure('lazy Message, author read', () => {
  for (let index = 0; index < iterations; index += 1) {
    const built = new LazyMessage(MESSAGE)
    // The message itself must escape, not just what the getter returned: storing only the
    // author let V8 delete the `LazyMessage` and time a bare `new User` instead.
    escape[index & 1023] = built
    if (built.author !== undefined) sink += 1
  }
})

// --- D2b. What lazy retains, which is the argument against it. ---

/**
 * Live heap after building and holding a batch, in bytes per object.
 *
 * @param build - Produces one object.
 * @returns Bytes per retained object, or `undefined` without `--expose-gc`.
 *
 * @remarks
 * Needs a forced collection to mean anything: without one the figure is whatever garbage
 * happened not to have been swept, which is not a measurement. Reported as unavailable
 * rather than printed misleadingly when the flag is absent.
 */
function retained(build: (index: number) => unknown): number | undefined {
  const collect = (globalThis as { gc?: () => void }).gc
  if (collect === undefined) return undefined

  const count = 100_000
  collect()
  const before = process.memoryUsage().heapUsed
  const held: unknown[] = new Array<unknown>(count)
  for (let index = 0; index < count; index += 1) held[index] = build(index)
  collect()
  const after = process.memoryUsage().heapUsed
  // Read it once here so the array cannot be collected before the measurement above.
  if (held.length !== count) throw new Error('unreachable')
  return (after - before) / count
}

console.log()
console.log('D2b. Retained bytes per message')

// A fresh payload per object, because one shared payload is retained once no matter how many
// structures point at it — and a real bot never sees the same payload object twice.
const eagerBytes = retained(() => new Message(structuredClone(MESSAGE), undefined))
const lazyBytes = retained(() => new LazyMessage(structuredClone(MESSAGE)))
const payloadBytes = retained(() => structuredClone(MESSAGE))

if (eagerBytes === undefined || lazyBytes === undefined || payloadBytes === undefined) {
  console.log('  unavailable: re-run with --expose-gc')
} else {
  console.log(`  the payload alone                  ${payloadBytes.toFixed(0).padStart(8)} bytes`)
  console.log(`  eager Message                      ${eagerBytes.toFixed(0).padStart(8)} bytes`)
  console.log(`  lazy Message, payload pinned       ${lazyBytes.toFixed(0).padStart(8)} bytes`)
}

console.log()
console.log(`iterations: ${iterations.toLocaleString('en-US')}, sink: ${String(sink)}`)
console.log(`D1  generic, camelCase per key:   ${(shallow / handWritten).toFixed(1)}x`)
console.log(`D1  generic, precomputed map:     ${(mapped / handWritten).toFixed(1)}x`)
console.log(`D1b consumer read, generic:       ${(readShallow / readHand).toFixed(1)}x`)
console.log(
  `D2  the eager User is             ${((user / eagerUnread) * 100).toFixed(0)}% of a Message`,
)
console.log(`D2  eager against lazy, unread:   ${(eagerUnread / lazyUnread).toFixed(1)}x`)
