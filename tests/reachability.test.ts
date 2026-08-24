import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * A collaborator one package hands to another is actually driven by it.
 *
 * @remarks
 * **The shape this project has shipped four times.** `GuildReadyTracker` and `MemberChunker`
 * were exported from `@vestra/gateway`, documented, unit-tested — and constructed by nobody,
 * until the shard bridge was written. Then `MemberChunker.handleRateLimited` was wired by
 * nobody for a further phase: a rate-limited member fetch hung for its full sixty-second
 * timeout and reported the wrong cause, while the method's own unit tests passed.
 *
 * Unit tests prove a component works. Nothing but reachability proves it is reached, and the
 * failure is silent by construction: the piece that is never called cannot fail.
 *
 * The rule is deliberately narrow, because the broad version does not work. "Every public
 * method is called somewhere in `src`" flags fifteen things that are simply consumer API —
 * `guild.iconUrl()`, `client.setPresence()`, every REST route — and a rule with fifteen
 * standing exceptions is one nobody trusts. Restricted to **classes one package constructs
 * from another**, it flags nothing today and would have flagged `handleRateLimited`: those
 * classes exist precisely to be driven from above, so a method of one that nothing calls is
 * either dead or unwired, and both are worth a failing test.
 */

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const skipDirectories = new Set(['node_modules', 'dist', '.turbo', 'coverage'])

/** One source file, with the package that owns it. */
interface Source {
  package: string
  path: string
  text: string
}

/** Every TypeScript file under a package's `src`. */
function readSources(): Source[] {
  const found: Source[] = []
  const packages = `${repoRoot}packages`

  for (const name of readdirSync(packages)) {
    const root = `${packages}/${name}/src`
    try {
      if (!statSync(root).isDirectory()) continue
    } catch {
      continue
    }
    walk(root, name, found)
  }

  return found
}

/** Collects TypeScript files beneath a directory. */
function walk(directory: string, owner: string, into: Source[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (skipDirectories.has(entry.name)) continue
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) {
      walk(path, owner, into)
      continue
    }
    if (!entry.name.endsWith('.ts')) continue
    into.push({ package: owner, path, text: readFileSync(path, 'utf8') })
  }
}

const sources = readSources()
const everything = sources.map((source) => source.text).join('\n')

/** A class one package constructs from another. */
interface Collaborator {
  name: string
  owner: string
  methods: string[]
}

/**
 * Finds the cross-package collaborators and their public methods.
 *
 * @returns One entry per collaborator.
 *
 * @remarks
 * Abstract classes are skipped: nothing constructs one directly, so "constructed from another
 * package" cannot be asked about them. `constructor` is skipped for the same reason in
 * reverse — it is reached through `new`, not through a call.
 *
 * Private `#` members and getters are not matched at all, which is the point: a getter has no
 * call syntax to look for, and a private member is not a contract with anybody.
 */
function findCollaborators(): Collaborator[] {
  const found: Collaborator[] = []

  for (const source of sources) {
    for (const match of source.text.matchAll(/^export (abstract )?class (\w+)/gm)) {
      if (match[1] !== undefined) continue
      const name = match[2]
      if (name === undefined) continue

      const constructedElsewhere = sources.some(
        (other) =>
          other.package !== source.package &&
          (other.text.includes(`new ${name}(`) || other.text.includes(`new ${name}<`)),
      )
      if (!constructedElsewhere) continue

      // The class body runs to the next top-level class in the same file.
      const after = source.text.slice(match.index + match[0].length)
      const next = /^export (?:abstract )?class /m.exec(after)
      const body = next === null ? after : after.slice(0, next.index)

      const methods = [...body.matchAll(/^ {2}(?:override )?(?:async )?([a-z]\w*)\(/gm)]
        .map((method) => method[1])
        .filter((method): method is string => method !== undefined && method !== 'constructor')

      found.push({ name, owner: source.package, methods: [...new Set(methods)] })
    }
  }

  return found
}

const collaborators = findCollaborators()

describe('cross-package reachability', () => {
  it('RE1: finds the collaborators to check', () => {
    // Without this the case below passes on an empty list, which is how a reachability test
    // stops testing reachability.
    assert.ok(
      collaborators.length >= 3,
      `expected several cross-package collaborators; found ${String(collaborators.length)}`,
    )
    assert.ok(
      collaborators.some((entry) => entry.name === 'MemberChunker'),
      'MemberChunker was not found, so the selector is not matching what it should',
    )
    assert.ok(
      collaborators.every((entry) => entry.methods.length > 0),
      'a collaborator was found with no public methods, which means the body scan is wrong',
    )
  })

  it('RE2: drives every method of every collaborator', () => {
    const unreached = collaborators.flatMap((entry) =>
      entry.methods
        .filter((method) => !everything.includes(`.${method}(`))
        .map((method) => `${entry.name}.${method}() is called by nothing in packages/*/src`),
    )

    assert.deepEqual(
      unreached.sort(),
      [],
      'a class one package hands to another has a method nothing drives; it is either dead or ' +
        'unwired, and MemberChunker.handleRateLimited was the second kind',
    )
  })
})
