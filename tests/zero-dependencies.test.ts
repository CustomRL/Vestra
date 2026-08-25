import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const packagesDir = fileURLToPath(new URL('../packages/', import.meta.url))

interface Manifest {
  name: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  /** Installed by default by npm and pnpm alike, so a runtime dependency in every sense. */
  optionalDependencies?: Record<string, string>
  /** Shipped inside the tarball, which is a runtime dependency that does not even resolve. */
  bundleDependencies?: string[] | boolean
}

function readManifests(): Manifest[] {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const raw = readFileSync(join(packagesDir, entry.name, 'package.json'), 'utf8')
      return JSON.parse(raw) as Manifest
    })
}

/** One module specifier found in a published source file. */
interface Specifier {
  file: string
  line: number
  specifier: string
}

/**
 * Every module specifier under a package's `src`, parsed rather than pattern-matched.
 *
 * @remarks
 * The compiler API rather than a regular expression, because a regular expression over these
 * sources finds three specifiers that do not exist: TSDoc prose containing the word "from"
 * followed by a quoted phrase. A guard with false positives is one somebody weakens rather
 * than obeys.
 *
 * Static imports, re-exports, dynamic `import()` and `require()` are all collected. Type-only
 * imports are included deliberately — they erase from the JavaScript, but a third-party type
 * in a published declaration file is still something a consumer has to install, which is the
 * same promise broken a different way.
 */
function readSpecifiers(): Specifier[] {
  const found: Specifier[] = []

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      if (!entry.name.endsWith('.ts')) continue

      const text = readFileSync(path, 'utf8')
      const source = ts.createSourceFile(path, text, ts.ScriptTarget.ES2023, true)

      const record = (node: ts.Node, specifier: string): void => {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart())
        found.push({ file: path, line: line + 1, specifier })
      }

      const visit = (node: ts.Node): void => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier !== undefined &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          record(node, node.moduleSpecifier.text)
        }

        if (ts.isCallExpression(node)) {
          const callee = node.expression
          const dynamic =
            callee.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(callee) && callee.text === 'require')
          const first = node.arguments[0]
          if (dynamic && first !== undefined && ts.isStringLiteral(first)) {
            record(node, first.text)
          }
        }

        ts.forEachChild(node, visit)
      }

      visit(source)
    }
  }

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const root = join(packagesDir, entry.name, 'src')
    try {
      if (!statSync(root).isDirectory()) continue
    } catch {
      continue
    }
    walk(root)
  }

  return found
}

/**
 * Whether a specifier is one the zero-dependency rule permits.
 *
 * @param specifier - The module specifier as written.
 * @returns Whether it resolves inside the allowed set.
 *
 * @remarks
 * Node built-ins must carry the `node:` prefix. A bare `fs` resolves too, but by inspection
 * it is indistinguishable from a third-party package named `fs`, and the prefix is already
 * the house style in every source file here.
 */
function isPermitted(specifier: string): boolean {
  return (
    specifier.startsWith('node:') ||
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier === 'vestra' ||
    specifier.startsWith('@vestra/')
  )
}

/**
 * "Lightweight" is the whole point of this library, and the way it stops being true
 * is one convenient dependency at a time. This asserts the property directly rather
 * than trusting review to notice.
 *
 * @remarks
 * Manifests are half the story and were previously the whole of it. A `package.json` says
 * nothing about what the code imports, and pnpm hoists the workspace root's devDependencies
 * to a `node_modules` every package resolves through — so `import ts from 'typescript'` inside
 * `packages/rest/src` type-checks, lints, satisfies every manifest assertion, passes
 * `publint --strict`, and lands verbatim in the shipped `dist`. Verified by doing exactly
 * that, which is why the import scan below exists.
 */
describe('published packages', () => {
  const manifests = readManifests()
  const specifiers = readSpecifiers()

  it('finds every workspace package', () => {
    assert.ok(manifests.length > 0, 'no packages discovered')
  })

  it('finds the sources to check', () => {
    // The canary. A walk that quietly found nothing would make the rule below pass on an empty
    // list, which is how a guard stops guarding without anybody noticing.
    assert.ok(
      specifiers.length > 100,
      `expected hundreds of module specifiers; found ${String(specifiers.length)}`,
    )
    assert.ok(
      specifiers.some((entry) => entry.specifier.startsWith('node:')),
      'no node: builtin was seen, so the parser is not reading what it should',
    )
  })

  it('imports nothing but Node built-ins, relatives and @vestra packages', () => {
    const foreign = specifiers
      .filter((entry) => !isPermitted(entry.specifier))
      .map((entry) => `${entry.file}:${String(entry.line)} imports '${entry.specifier}'`)

    assert.deepEqual(
      foreign.sort(),
      [],
      'published source imports something outside the allowed set. Node built-ins, relative ' +
        'paths and @vestra packages only — see docs/adr/0001-zero-runtime-dependencies.md.',
    )
  })

  for (const manifest of manifests) {
    it(`${manifest.name} has no third-party runtime dependencies`, () => {
      const deps = Object.keys(manifest.dependencies ?? {})
      const thirdParty = deps.filter((dep) => dep !== 'vestra' && !dep.startsWith('@vestra/'))
      assert.deepEqual(
        thirdParty,
        [],
        `${manifest.name} declares third-party runtime dependencies: ${thirdParty.join(', ')}. ` +
          'Node built-ins and globals only -- see docs/adr/0001-zero-runtime-dependencies.md.',
      )
    })

    it(`${manifest.name} declares no optional or bundled dependencies`, () => {
      // Both install by default — `optionalDependencies` by npm and pnpm alike, and
      // `bundleDependencies` by riding inside the tarball. Neither was read at all before, so
      // a third-party entry in either passed the whole suite untouched.
      const optional = Object.keys(manifest.optionalDependencies ?? {})
      const bundled = Array.isArray(manifest.bundleDependencies) ? manifest.bundleDependencies : []
      const thirdParty = [...optional, ...bundled].filter(
        (dep) => dep !== 'vestra' && !dep.startsWith('@vestra/'),
      )

      assert.deepEqual(
        thirdParty.sort(),
        [],
        `${manifest.name} smuggles runtime dependencies past the declared list: ${thirdParty.join(', ')}`,
      )
      assert.notEqual(
        manifest.bundleDependencies,
        true,
        `${manifest.name} bundles its whole dependency tree into the tarball`,
      )
    })

    it(`${manifest.name} declares no peer dependencies`, () => {
      const peers = Object.keys(manifest.peerDependencies ?? {})
      const thirdParty = peers.filter((dep) => !dep.startsWith('@vestra/'))
      assert.deepEqual(
        thirdParty,
        [],
        `${manifest.name} pushes install burden onto consumers via peers: ${thirdParty.join(', ')}`,
      )
    })
  }
})
