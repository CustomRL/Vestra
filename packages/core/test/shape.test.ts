import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * No structure emits a redundant field definition.
 *
 * @remarks
 * CONTRIBUTING's rule — "declare structure fields with `declare` and assign them in the
 * constructor, so no redundant field initialisation is emitted before your assignment" — was
 * a sentence in a document and nothing more. This is the sentence, checked.
 *
 * **What goes wrong without it.** `useDefineForClassFields` is on, so a bare `name: string`
 * compiles to `name;` in the class body: every instance gets the property defined as
 * `undefined` and then immediately assigned in the constructor. Two writes per field per
 * object, on the objects the library creates most. `declare` emits nothing and the constructor
 * assignment creates the property once.
 *
 * **Checked against the compiled output, not the source.** The source is where the mistake is
 * made, but the emit is where it matters, and reading the emit means this cannot be fooled by
 * a spelling of the declaration nobody anticipated.
 *
 * Scoped to `structures/`, which is what the rule says. `Client` and `CacheRegistry` have bare
 * fields and keep them: they are constructed once per process, so the redundant define is
 * paid once and `declare` there would be cargo-culting a hot-path rule onto cold code.
 */

const DIST = fileURLToPath(new URL('../dist/structures', import.meta.url))

/** Every compiled file under `dist/structures`, including the channels directory. */
async function compiledStructures(directory: string): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) found.push(...(await compiledStructures(path)))
    else if (entry.name.endsWith('.js')) found.push(path)
  }
  return found
}

/**
 * Field definitions emitted into a class body.
 *
 * @remarks
 * A bare declaration compiles to the field name alone on its own line, indented inside the
 * class. `#private` fields are excluded: they cannot be `declare`d, they are genuine storage
 * rather than a mirrored payload field, and several hold a real initialiser.
 */
function bareFields(source: string): string[] {
  const found: string[] = []
  let inClass = false

  for (const line of source.split('\n')) {
    if (/^(export )?(abstract )?class /.test(line)) inClass = true
    else if (line === '}') inClass = false
    if (!inClass) continue

    const match = /^ {4}([A-Za-z_$][A-Za-z0-9_$]*);$/.exec(line)
    if (match?.[1] !== undefined) found.push(match[1])
  }

  return found
}

describe('structure shape', () => {
  it('SH1: reads a real set of compiled structures', () => {
    // Guards the guard. Pointed at a directory that does not exist, or run before a build,
    // this would find nothing and pass.
    return compiledStructures(DIST).then((files) => {
      assert.ok(
        files.length > 15,
        `expected the compiled structures; found ${String(files.length)}`,
      )
    })
  })

  it('SH2: emits no field definition before the constructor assigns it', async () => {
    const offenders: string[] = []

    for (const file of await compiledStructures(DIST)) {
      const fields = bareFields(await readFile(file, 'utf8'))
      const name = file.slice(DIST.length + 1)
      for (const field of fields) offenders.push(`${name}: ${field}`)
    }

    assert.deepEqual(
      offenders.sort(),
      [],
      `these fields need \`declare\`, or they are defined as undefined on every instance:\n${offenders.join('\n')}`,
    )
  })
})
