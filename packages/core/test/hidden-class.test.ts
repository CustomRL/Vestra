import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { describe, it } from 'node:test'

/**
 * The single-hidden-class property, checked against V8 rather than argued from a mechanism.
 *
 * @remarks
 * **This is the claim the whole structure design rests on.** §4.15 rejects a generic payload
 * transform because it copies the keys that *arrived*, so each partial payload leaves behind a
 * different hidden class and `message.content` in consumer code goes megamorphic. The defence
 * is a fixed-order constructor that assigns every field unconditionally, `undefined` included —
 * and `patch()` that assigns only what arrived, on the grounds that writing an already-present
 * property is a store to a known offset rather than a map transition.
 *
 * Both halves were argued from how V8 works and probed against two or three payload variants
 * (§8-D6). Neither was ever asserted, so nothing stops a future contributor from adding a
 * `if (data.x !== undefined)` to a constructor and silently undoing it.
 *
 * `%HaveSameMap` answers it exactly, which is why these run out of process: the native needs
 * `--allow-natives-syntax`, and the test runner does not pass it. A wrong answer here is not a
 * slow structure, it is the argument for hand-writing forty of them.
 *
 * What this does **not** cover is §8-D6's other half — real captured traffic. Thirty subsets
 * generated from one field list is a stronger probe than the two or three that came before it,
 * and it is still synthetic.
 */

const CORE_ENTRY = new URL('../dist/index.js', import.meta.url).href

/** How many distinct payload subsets each case builds from. */
const VARIANTS = 30

/**
 * Runs a snippet in a fresh process with V8 natives enabled.
 *
 * @param source - The module source.
 * @returns Its output and exit code.
 */
async function run(source: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--allow-natives-syntax', '--input-type=module', '-e', source],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 0 })
    })
  })
}

/** The lines that build thirty `MESSAGE_UPDATE`-shaped subsets of one full payload. */
const SUBSETS = [
  `const AUTHOR = { id: '1', username: 'n', discriminator: '0', global_name: null, avatar: null }`,
  `const FULL = {`,
  `  id: '334385199974967042', channel_id: '2', guild_id: '3', author: AUTHOR,`,
  `  content: 'hi', timestamp: '2024-01-01T00:00:00+00:00', edited_timestamp: null,`,
  `  tts: false, mention_everyone: false, mentions: [], mention_roles: [],`,
  `  attachments: [], embeds: [], pinned: false, webhook_id: undefined, type: 0, flags: 0,`,
  `}`,
  `const KEYS = Object.keys(FULL)`,
  `const variants = [FULL]`,
  `for (let n = 1; n < ${String(VARIANTS)}; n += 1) {`,
  // Always id and channel_id, then a different deterministic slice of the rest. Discord sends
  // whichever fields changed, so no two updates need carry the same key set.
  `  const subset = { id: FULL.id, channel_id: FULL.channel_id }`,
  `  for (let k = 2; k < KEYS.length; k += 1) {`,
  `    if ((k * (n + 2)) % 5 < 2) subset[KEYS[k]] = FULL[KEYS[k]]`,
  `  }`,
  `  variants.push(subset)`,
  `}`,
].join(String.fromCharCode(10))

describe('structure hidden classes', () => {
  it('HC1: builds one hidden class from every payload variant', async () => {
    const script = [
      `import { Message } from '${CORE_ENTRY}'`,
      SUBSETS,
      `const built = variants.map((v) => new Message(v, undefined))`,
      // Compared against the first rather than pairwise: same-map is transitive, and naming
      // the index that diverged is what makes a failure actionable.
      `const diverged = []`,
      `for (let i = 1; i < built.length; i += 1) {`,
      `  if (!%HaveSameMap(built[0], built[i])) diverged.push(i)`,
      `}`,
      `console.log('SHAPES ' + (diverged.length === 0 ? 'ONE' : 'MANY ' + diverged.join(',')))`,
      `console.log('KEYS ' + new Set(built.map((m) => Object.keys(m).join(','))).size)`,
      `console.log('VARIANTS ' + variants.length)`,
    ].join(String.fromCharCode(10))

    const { stdout, stderr, code } = await run(script)

    assert.equal(code, 0, `the snippet failed: ${stderr}`)
    assert.match(stdout, /VARIANTS 30/, 'the payload variants were not built')
    // A single key set across thirty different payloads is the property, stated the way a
    // reader can check without V8 internals; `%HaveSameMap` is the exact form of it.
    assert.match(stdout, /KEYS 1/, `structures had more than one key set: ${stdout}`)
    assert.match(
      stdout,
      /SHAPES ONE/,
      `a payload variant produced its own hidden class: ${stdout}${stderr}`,
    )
  })

  it('HC2: keeps that one class through patch()', async () => {
    // The other half of the rule. `patch` assigns only what arrived — it has to, or an update
    // carrying one field would blank the rest — and that is only safe because the constructor
    // already created every property. If it ever ran on a structure it had not built, or if a
    // constructor stopped assigning a field, this is where it shows.
    const script = [
      `import { Message } from '${CORE_ENTRY}'`,
      SUBSETS,
      `const built = variants.map(() => new Message(FULL, undefined))`,
      `for (let i = 0; i < built.length; i += 1) built[i].patch(variants[i])`,
      `const diverged = []`,
      `for (let i = 1; i < built.length; i += 1) {`,
      `  if (!%HaveSameMap(built[0], built[i])) diverged.push(i)`,
      `}`,
      `console.log('SHAPES ' + (diverged.length === 0 ? 'ONE' : 'MANY ' + diverged.join(',')))`,
      `console.log('PATCHED ' + built.length)`,
    ].join(String.fromCharCode(10))

    const { stdout, stderr, code } = await run(script)

    assert.equal(code, 0, `the snippet failed: ${stderr}`)
    assert.match(stdout, /PATCHED 30/, 'the structures were not patched')
    assert.match(stdout, /SHAPES ONE/, `patch() split the hidden class: ${stdout}${stderr}`)
  })

  it('HC3: fails when a constructor skips an absent field', async () => {
    // The control. Without it the two cases above could be passing because `%HaveSameMap`
    // always returns true under `-e`, or because the variants are not actually different —
    // and a shape test that cannot fail is worse than none, because it looks like cover.
    const script = [
      SUBSETS,
      `class Conditional {`,
      `  constructor(data) {`,
      `    this.id = data.id`,
      `    this.channelId = data.channel_id`,
      `    if (data.content !== undefined) this.content = data.content`,
      `    if (data.pinned !== undefined) this.pinned = data.pinned`,
      `    if (data.flags !== undefined) this.flags = data.flags`,
      `  }`,
      `}`,
      `const built = variants.map((v) => new Conditional(v))`,
      `const diverged = []`,
      `for (let i = 1; i < built.length; i += 1) {`,
      `  if (!%HaveSameMap(built[0], built[i])) diverged.push(i)`,
      `}`,
      `console.log('SHAPES ' + (diverged.length === 0 ? 'ONE' : 'MANY ' + diverged.length))`,
    ].join(String.fromCharCode(10))

    const { stdout, stderr, code } = await run(script)

    assert.equal(code, 0, `the snippet failed: ${stderr}`)
    assert.match(
      stdout,
      /SHAPES MANY/,
      `conditional assignment produced one shape, so HC1 proves nothing: ${stdout}`,
    )
  })
})
