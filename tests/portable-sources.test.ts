import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))

/** Where sources live. Everything outside these is build output, vendor code or config. */
const searchRoots = ['packages', 'tests', 'scripts']

/** Build output and vendor trees, which are full of absolute paths and are not ours. */
const skipDirectories = new Set(['node_modules', 'dist', '.turbo', 'coverage'])

/**
 * This file, excluded from its own sweep.
 *
 * @remarks
 * It has to spell the patterns out in order to search for them, so it is the one file where
 * they legitimately appear.
 */
const selfPath = fileURLToPath(import.meta.url)

/**
 * A Windows drive path with at least one directory after it — `D:/Projects/`, `C:\Users\`, or
 * either one inside a `file://` URL.
 *
 * @remarks
 * The trailing segment is required so that an object literal holding a regular expression
 * (`{ pattern: /foo/ }`) is not read as a drive letter, which a looser pattern does.
 */
const drivePath = /(?:^|[^A-Za-z0-9_])[A-Za-z]:[\\/]{1,2}[A-Za-z0-9._-]+[\\/]/

/** A path rooted in somebody's home directory on a POSIX machine. */
const homePath = /\/(?:home|Users|root)\/[A-Za-z0-9._-]+\//

function collect(dir: string, found: string[]): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!skipDirectories.has(entry.name)) collect(full, found)
    } else if (extname(entry.name) === '.ts' && full !== selfPath) {
      found.push(full)
    }
  }
  return found
}

function offendersIn(file: string): string[] {
  const lines = readFileSync(file, 'utf8').split('\n')
  const hits: string[] = []
  for (const [index, line] of lines.entries()) {
    if (drivePath.test(line) || homePath.test(line)) {
      hits.push(`${relative(repoRoot, file)}:${String(index + 1)}: ${line.trim()}`)
    }
  }
  return hits
}

/**
 * An absolute path is a hard-coded machine, and a test that carries one passes only on the
 * laptop it was written on.
 *
 * @remarks
 * This exists because two tests did exactly that. `ER8` and `ER9` in
 * `packages/core/test/errors.test.ts` run a snippet in a child process, and the snippet
 * imported the build through a literal `file:///D:/...` URL. On CI the import failed, the
 * snippet printed nothing, and both tests failed claiming a throw had escaped containment
 * when in truth nothing had run at all — a green local suite and a red remote one, for
 * eleven commits.
 *
 * The lesson generalises past that one file: anything a test hands to a child process, a
 * worker or a spawned tool has to be derived from `import.meta.url`, never written out.
 */
describe('sources are portable', () => {
  const files = searchRoots.flatMap((root) => collect(join(repoRoot, root), []))

  it('finds sources to check', () => {
    // Without this the sweep below passes by finding nothing, which is how a broken walker
    // reads exactly like a clean repository.
    assert.ok(files.length > 50, `only ${String(files.length)} sources found; the walk is broken`)
  })

  it('contains no absolute filesystem paths', () => {
    const offenders = files.flatMap(offendersIn)
    assert.deepEqual(
      offenders,
      [],
      'absolute paths found -- these only resolve on one machine. Derive them from ' +
        `import.meta.url instead:\n${offenders.join('\n')}`,
    )
  })
})
