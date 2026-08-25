import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import ts from 'typescript'

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
 * **Rewritten after an audit found the first version did not work.** It matched method names
 * as bare substrings of the concatenated sources, so a same-named call on any unrelated
 * receiver counted as reached — deleting the genuine `tracker.resolve(...)` wiring from
 * `ShardBridge` left it green, because `Promise.resolve(` contains `.resolve(`. It also
 * skipped every generic method, since the name had to be followed immediately by `(`, hiding
 * the whole of `REST.get/post/put/patch/delete`. The original mutation proof used
 * `handleRateLimited` — a name nothing else in the repository uses — and generalised from
 * that one case.
 *
 * Call sites now resolve through the type checker: a call counts only when the receiver's
 * type is the collaborator itself.
 *
 * **The narrow scope is deliberate and is not the whole story.** Route classes such as
 * `ChannelRoutes` are constructed by `REST` inside their own package and exist to be called by
 * *consumers*, so demanding that `src` call them would be wrong. Their coverage belongs to
 * their own tests.
 */

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const skipDirectories = new Set(['node_modules', 'dist', '.turbo', 'coverage'])

/** Collects `.ts` files beneath a directory. */
function collect(directory: string, into: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (skipDirectories.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      collect(path, into)
      continue
    }
    if (entry.name.endsWith('.ts')) into.push(path)
  }
}

/** Every published source file, and which package owns it. */
function sourceFiles(): { path: string; package: string }[] {
  const found: { path: string; package: string }[] = []
  const packages = join(repoRoot, 'packages')

  for (const entry of readdirSync(packages, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const root = join(packages, entry.name, 'src')
    try {
      if (!statSync(root).isDirectory()) continue
    } catch {
      continue
    }
    const paths: string[] = []
    collect(root, paths)
    for (const path of paths) found.push({ path, package: entry.name })
  }

  return found
}

const sources = sourceFiles()

const program = ts.createProgram(
  sources.map((source) => source.path),
  {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  },
)
const checker = program.getTypeChecker()

/** A class one package constructs from another. */
interface Collaborator {
  name: string
  owner: string
  methods: string[]
}

/**
 * The class names a type can be, if any.
 *
 * @param type - The type to inspect.
 * @returns Every class the type may be at runtime.
 *
 * @remarks
 * A union has to be walked rather than asked for its symbol. Nearly every collaborator in
 * this repository is held in an optional field and reached through `?.` — `this.#tracker` is
 * `GuildReadyTracker | undefined` — so a resolver that only handled the simple case reported
 * `GuildReadyTracker.resolve` as driven by nothing while the wiring sat two lines away.
 */
function classNames(type: ts.Type): string[] {
  const parts = type.isUnion() ? type.types : [type]
  const names: string[] = []

  for (const part of parts) {
    const declaration = part.getSymbol()?.declarations?.[0]
    if (declaration === undefined || !ts.isClassDeclaration(declaration)) continue
    const name = declaration.name?.text
    if (name !== undefined) names.push(name)
  }

  return names
}

/**
 * Every `receiver.method` access in the sources, as `ClassName.methodName`.
 *
 * @returns The set of methods actually reached.
 *
 * @remarks
 * Resolved through the checker rather than matched as text, which is the whole correction.
 * The previous version asked whether the string `.resolve(` appeared anywhere in the
 * concatenated sources — a question `Promise.resolve(` answers yes to.
 */
function reachedMethods(): Set<string> {
  const reached = new Set<string>()

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile) continue

    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node)) {
        for (const owner of classNames(checker.getTypeAtLocation(node.expression))) {
          reached.add(`${owner}.${node.name.text}`)
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(source)
  }

  return reached
}

/**
 * Public instance methods declared on a class, generics included.
 *
 * @param declaration - The class to read.
 * @returns The method names.
 *
 * @remarks
 * Getters and `#private` members are excluded deliberately: a getter has no call syntax to
 * look for, and a private member is a contract with nobody. `static` is excluded because a
 * static helper is not part of the driving relationship this checks.
 */
function publicMethods(declaration: ts.ClassDeclaration): string[] {
  const names: string[] = []

  for (const member of declaration.members) {
    if (!ts.isMethodDeclaration(member)) continue
    if (!ts.isIdentifier(member.name)) continue

    const hidden = (ts.getModifiers(member) ?? []).some(
      (modifier) =>
        modifier.kind === ts.SyntaxKind.PrivateKeyword ||
        modifier.kind === ts.SyntaxKind.ProtectedKeyword ||
        modifier.kind === ts.SyntaxKind.StaticKeyword,
    )
    if (hidden) continue

    names.push(member.name.text)
  }

  return [...new Set(names)]
}

/** Classes one package constructs from another, with their public methods. */
function findCollaborators(): Collaborator[] {
  const constructedIn = new Map<string, Set<string>>()
  const declarations = new Map<string, { owner: string; node: ts.ClassDeclaration }>()

  for (const { path, package: owner } of sources) {
    const source = program.getSourceFile(path)
    if (source === undefined) continue

    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) && node.name !== undefined) {
        const modifiers = ts.getModifiers(node) ?? []
        const abstract = modifiers.some((one) => one.kind === ts.SyntaxKind.AbstractKeyword)
        const exported = modifiers.some((one) => one.kind === ts.SyntaxKind.ExportKeyword)
        if (exported && !abstract) declarations.set(node.name.text, { owner, node })
      }

      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
        const name = node.expression.text
        const seen = constructedIn.get(name) ?? new Set<string>()
        seen.add(owner)
        constructedIn.set(name, seen)
      }

      ts.forEachChild(node, visit)
    }

    visit(source)
  }

  const found: Collaborator[] = []
  for (const [name, entry] of declarations) {
    const packages = constructedIn.get(name)
    if (packages === undefined) continue
    if (![...packages].some((from) => from !== entry.owner)) continue
    found.push({ name, owner: entry.owner, methods: publicMethods(entry.node) })
  }

  return found
}

const collaborators = findCollaborators()
const reached = reachedMethods()

describe('cross-package reachability', () => {
  it('RE1: finds the collaborators to check', () => {
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

  it('RE1b: extracts generic methods, which the first version silently dropped', () => {
    // `REST` is constructed by core, so it is a collaborator, and its entire verb surface is
    // generic. The old extraction required `(` immediately after the name and found only
    // [setToken, raw, sweep] — five public methods invisible, on the busiest class in the
    // repository.
    const rest = collaborators.find((entry) => entry.name === 'REST')
    assert.ok(rest !== undefined, 'REST is constructed by core and must be a collaborator')
    for (const verb of ['get', 'post', 'put', 'patch', 'delete']) {
      assert.ok(rest.methods.includes(verb), `REST.${verb} was not extracted; generics dropped`)
    }
  })

  it('RE2: drives every method of every collaborator', () => {
    const unreached = collaborators.flatMap((entry) =>
      entry.methods
        .filter((method) => !reached.has(`${entry.name}.${method}`))
        .map((method) => `${entry.name}.${method}() is driven by nothing`),
    )

    assert.deepEqual(
      unreached.sort(),
      [],
      'a class one package hands to another has a method nothing drives; it is either dead or ' +
        'unwired, and MemberChunker.handleRateLimited was the second kind',
    )
  })
})
