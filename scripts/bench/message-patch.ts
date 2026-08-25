/**
 * What recording a change record costs a patch.
 *
 * `messageUpdate` now carries the previous values of whatever the edit displaced, which means
 * every `patch` compares before it assigns and allocates a record when the comparison says
 * something moved. That is work the old `patch` did not do, on a path that runs once per
 * message edit, so the decision to extend the same treatment to the other ten update events
 * should rest on a number rather than on an intuition about V8.
 *
 * Three shapes, because they cost differently and the middle one is the common case:
 *
 *   - **scalar edit** — the payload a content edit produces: two identifiers and one changed
 *     field. One comparison fires, one record is allocated.
 *   - **no-op** — an embed resolving server-side, or a dispatch replayed after a resume.
 *     Every comparison fires and none of them records, so this measures the comparisons alone
 *     with the allocation removed.
 *   - **full** — every field present and every one different. The worst case, and not a case
 *     Discord actually sends.
 *
 * Each is run against a plain assign-only patch of the same fields, which is exactly what
 * `Message.patch` was before, so the difference is the feature and not the field count.
 *
 * Usage:
 *   node --experimental-strip-types scripts/bench/message-patch.ts [--iterations N]
 */

import type { GatewayMessageUpdateDispatchData } from '@vestra/types'
import { Message } from '@vestra/core'

const iterations = readIterations(process.argv.slice(2))

/**
 * Reads `--iterations N`.
 *
 * @param argv - Arguments after the script name.
 * @returns How many patches to apply per pass.
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
 * The minimum rather than the mean, for the reason `structure-construction.ts` gives: every
 * source of error here makes a pass slower and none makes it faster.
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

  console.log(`  ${name.padEnd(30)} ${best.toFixed(1).padStart(8)} ns`)
  return best
}

/**
 * Where every record goes, so V8 cannot delete the allocation being measured.
 *
 * @remarks
 * A change record is returned to the handler and handed to a listener, so it escapes in
 * production too. Without this the recording cases measure a patch whose allocation was
 * removed entirely, which is the one thing the comparison is about.
 */
const escape: unknown[] = new Array<unknown>(1024)
let slot = 0

/** The fields both probes below carry, in the order `Message` declares them. */
interface Fields {
  guildId: string | undefined
  content: string | undefined
  sentTimestamp: string | undefined
  editedTimestamp: string | null | undefined
  tts: boolean | undefined
  mentionEveryone: boolean | undefined
  mentionRoles: readonly string[] | undefined
  attachments: readonly unknown[] | undefined
  embeds: readonly unknown[] | undefined
  pinned: boolean | undefined
  webhookId: string | undefined
  type: number | undefined
  flags: number | undefined
}

/** What a payload can carry, in the same order. */
interface Payload {
  guild_id?: string
  content?: string
  timestamp?: string
  edited_timestamp?: string | null
  tts?: boolean
  mention_everyone?: boolean
  mention_roles?: readonly string[]
  attachments?: readonly unknown[]
  embeds?: readonly unknown[]
  pinned?: boolean
  webhook_id?: string
  type?: number
  flags?: number
}

/**
 * The two patches, side by side on identical state.
 *
 * @remarks
 * A local class rather than `Message` itself, so the only difference between the two methods
 * is the recording. Comparing `Message.patch` against a remembered number from before the
 * change would fold in every other edit the file has had.
 */
class Probe implements Fields {
  guildId: string | undefined = '3'
  content: string | undefined = 'before'
  sentTimestamp: string | undefined = '2024-01-01T00:00:00+00:00'
  editedTimestamp: string | null | undefined = null
  tts: boolean | undefined = false
  mentionEveryone: boolean | undefined = false
  mentionRoles: readonly string[] | undefined = []
  attachments: readonly unknown[] | undefined = []
  embeds: readonly unknown[] | undefined = []
  pinned: boolean | undefined = false
  webhookId: string | undefined = undefined
  type: number | undefined = 0
  flags: number | undefined = 0

  /** Assigns whatever arrived, which is what `patch` did before change records existed. */
  plain(data: Payload): void {
    if (data.guild_id !== undefined) this.guildId = data.guild_id
    if (data.content !== undefined) this.content = data.content
    if (data.timestamp !== undefined) this.sentTimestamp = data.timestamp
    if (data.edited_timestamp !== undefined) this.editedTimestamp = data.edited_timestamp
    if (data.tts !== undefined) this.tts = data.tts
    if (data.mention_everyone !== undefined) this.mentionEveryone = data.mention_everyone
    if (data.mention_roles !== undefined) this.mentionRoles = data.mention_roles
    if (data.attachments !== undefined) this.attachments = data.attachments
    if (data.embeds !== undefined) this.embeds = data.embeds
    if (data.pinned !== undefined) this.pinned = data.pinned
    if (data.webhook_id !== undefined) this.webhookId = data.webhook_id
    if (data.type !== undefined) this.type = data.type
    if (data.flags !== undefined) this.flags = data.flags
  }

  /** The same, recording what it displaced. */
  recording(data: Payload): Partial<Fields> | null {
    let changes: Partial<Fields> | null = null

    if (data.guild_id !== undefined && data.guild_id !== this.guildId) {
      ;(changes ??= {}).guildId = this.guildId
      this.guildId = data.guild_id
    }
    if (data.content !== undefined && data.content !== this.content) {
      ;(changes ??= {}).content = this.content
      this.content = data.content
    }
    if (data.timestamp !== undefined && data.timestamp !== this.sentTimestamp) {
      ;(changes ??= {}).sentTimestamp = this.sentTimestamp
      this.sentTimestamp = data.timestamp
    }
    if (data.edited_timestamp !== undefined && data.edited_timestamp !== this.editedTimestamp) {
      ;(changes ??= {}).editedTimestamp = this.editedTimestamp
      this.editedTimestamp = data.edited_timestamp
    }
    if (data.tts !== undefined && data.tts !== this.tts) {
      ;(changes ??= {}).tts = this.tts
      this.tts = data.tts
    }
    if (data.mention_everyone !== undefined && data.mention_everyone !== this.mentionEveryone) {
      ;(changes ??= {}).mentionEveryone = this.mentionEveryone
      this.mentionEveryone = data.mention_everyone
    }
    if (data.mention_roles !== undefined) {
      ;(changes ??= {}).mentionRoles = this.mentionRoles
      this.mentionRoles = data.mention_roles
    }
    if (data.attachments !== undefined) {
      ;(changes ??= {}).attachments = this.attachments
      this.attachments = data.attachments
    }
    if (data.embeds !== undefined) {
      ;(changes ??= {}).embeds = this.embeds
      this.embeds = data.embeds
    }
    if (data.pinned !== undefined && data.pinned !== this.pinned) {
      ;(changes ??= {}).pinned = this.pinned
      this.pinned = data.pinned
    }
    if (data.webhook_id !== undefined && data.webhook_id !== this.webhookId) {
      ;(changes ??= {}).webhookId = this.webhookId
      this.webhookId = data.webhook_id
    }
    if (data.type !== undefined && data.type !== this.type) {
      ;(changes ??= {}).type = this.type
      this.type = data.type
    }
    if (data.flags !== undefined && data.flags !== this.flags) {
      ;(changes ??= {}).flags = this.flags
      this.flags = data.flags
    }

    return changes
  }
}

/** A content edit, alternating so the comparison never stops firing. */
const EDITS: readonly Payload[] = [{ content: 'a' }, { content: 'b' }]

/** A payload that repeats what the probe already holds. */
const NO_OP: Payload = {
  guild_id: '3',
  content: 'before',
  timestamp: '2024-01-01T00:00:00+00:00',
  edited_timestamp: null,
  tts: false,
  mention_everyone: false,
  pinned: false,
  type: 0,
  flags: 0,
}

/** Every field, all different, alternating so nothing settles. */
const FULL: readonly Payload[] = [0, 1].map((n) => ({
  guild_id: `g${String(n)}`,
  content: `c${String(n)}`,
  timestamp: `2024-01-0${String(n + 1)}T00:00:00+00:00`,
  edited_timestamp: `2024-02-0${String(n + 1)}T00:00:00+00:00`,
  tts: n === 0,
  mention_everyone: n === 0,
  mention_roles: [],
  attachments: [],
  embeds: [],
  pinned: n === 0,
  webhook_id: `w${String(n)}`,
  type: n,
  flags: n,
}))

/**
 * Runs one payload shape through both probes.
 *
 * @param label - What the shape is called in the output.
 * @param payloads - Applied round-robin, so no comparison settles into always-false.
 */
function compare(label: string, payloads: readonly Payload[]): void {
  const plain = new Probe()
  const recording = new Probe()

  // Both loops escape once per iteration. An earlier version escaped the plain probe once per
  // pass instead, which charged the recording case for an array store its rival never paid and
  // made the no-op difference look twice its size.
  const before = measure(`${label} — assign only`, () => {
    for (let index = 0; index < iterations; index += 1) {
      plain.plain(payloads[index % payloads.length]!)
      escape[slot++ & 1023] = plain.content
    }
  })

  const after = measure(`${label} — recording`, () => {
    for (let index = 0; index < iterations; index += 1) {
      escape[slot++ & 1023] = recording.recording(payloads[index % payloads.length]!)
    }
  })

  console.log(`  ${'→ recording costs'.padEnd(30)} ${(after - before).toFixed(1).padStart(8)} ns\n`)
}

console.log(`\nmessage patch, ${iterations.toLocaleString()} iterations per pass\n`)

compare('scalar edit', EDITS)
compare('no-op', [NO_OP])
compare('full payload', FULL)

// The real thing, so the numbers above have something absolute to sit beside. Not comparable
// to the probes: `Message.patch` also handles `author` and rebuilds `mentions` into `User`s.
const message = new Message({ id: '1', channel_id: '2', content: 'before' }, undefined)
const REAL: readonly GatewayMessageUpdateDispatchData[] = [
  { id: '1', channel_id: '2', content: 'a' },
  { id: '1', channel_id: '2', content: 'b' },
]

measure('Message.patch — content edit', () => {
  for (let index = 0; index < iterations; index += 1) {
    escape[slot++ & 1023] = message.patch(REAL[index % REAL.length]!)
  }
})

console.log()
