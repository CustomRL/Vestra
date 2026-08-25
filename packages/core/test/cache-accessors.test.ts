import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import ts from 'typescript'

/**
 * Every cache-backed accessor admits a miss in its return type.
 *
 * @remarks
 * ADR 4's central promise, checked mechanically rather than by review. Caching is opt-in per
 * scope, so `guild.roles()` on a client configured with `roles: false` has nothing to return
 * and has to say so. An accessor that asserted would turn cache configuration into runtime
 * exceptions in code that never mentions caching; one that fetched would make a property
 * access an await.
 *
 * §7.4 **CU5** asks for this at compile time, on a hand-written list. A list is the wrong
 * shape: it passes forever once somebody adds an accessor and forgets to append to it, which
 * is the only way this rule actually gets broken. This finds the accessors instead — every
 * method whose `this` is constrained on `CacheCapable` is one by construction — so a new one
 * is covered the moment it is written.
 *
 * `Array` counts as admitting a miss: a disabled scope returns an empty one, which is the
 * same statement made in the shape a group accessor has to use.
 */

/**
 * Accessors that return a total value on purpose, and why.
 *
 * @remarks
 * An allowlist rather than an exemption in the rule, so joining it is a deliberate edit that
 * shows up in a diff. Each entry is asserted to still exist, so an accessor that later starts
 * admitting a miss does not leave a stale excuse behind it.
 */
const TOTAL_BY_DESIGN: Readonly<Record<string, string>> = {
  'GuildMember.permissionsIn':
    'Understates rather than returning nothing. A role the cache has not seen contributes ' +
    'no permissions, so an incomplete cache denies rather than answers `undefined` — and a ' +
    'caller forced to handle `undefined` on a permission check tends to write `?? ALL`, ' +
    'which is the unsafe direction. See its own TSDoc.',
}

const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url))

const program = ts.createProgram([entry], {
  target: ts.ScriptTarget.ES2023,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
})
const checker = program.getTypeChecker()

/** One accessor found in the sources. */
interface Accessor {
  owner: string
  name: string
  returns: string
}

/**
 * Whether a type is one that carries a cache, however it was spelled.
 *
 * @param type - The candidate constraint or type argument.
 * @returns Whether reaching the cache through it is possible.
 *
 * @remarks
 * The **structural** question rather than the textual one, and that is the correction. The
 * first version compared `constraint.getText()` to the literal string `CacheCapable`, so
 * three legal spellings escaped it silently — an intersection (`C extends CacheCapable &
 * RestCapable`), any alias or renamed import, and the plainest form of all,
 * `this: Message<CacheCapable>`, which has no method type parameter to inspect. Each
 * compiles, reads the cache, and was invisible; an audit added all three to `Message` and
 * this file still reported 3/3 green.
 *
 * Asking whether the type has a `cache` property answers all of them at once, because that
 * is what "can reach the cache" actually means.
 */
function carriesCache(type: ts.Type): boolean {
  const parts = type.isIntersection() ? type.types : [type]
  return parts.some((part) => checker.getPropertyOfType(part, 'cache') !== undefined)
}

/**
 * Whether a method can reach the cache through its `this`.
 *
 * @param method - The declaration to inspect.
 * @returns Whether it is a cache-backed accessor.
 *
 * @remarks
 * Both routes are checked: a constrained method type parameter (`roles<C extends
 * CacheCapable>(this: Guild<C>)`) and a `this` parameter whose type arguments carry the
 * capability directly (`channel(this: Message<CacheCapable>)`). Only the first existed
 * before, which is why the second was an escape hatch rather than a style choice.
 */
function readsCache(method: ts.MethodDeclaration): boolean {
  for (const parameter of method.typeParameters ?? []) {
    if (parameter.constraint === undefined) continue
    if (carriesCache(checker.getTypeFromTypeNode(parameter.constraint))) return true
  }

  const self = method.parameters.find(
    (parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === 'this',
  )
  if (self?.type === undefined) return false

  const reference = checker.getTypeFromTypeNode(self.type) as ts.TypeReference
  for (const argument of checker.getTypeArguments(reference)) {
    if (carriesCache(argument)) return true
  }

  return false
}

/** Every cache-backed accessor across the package's sources. */
function findAccessors(): Accessor[] {
  const found: Accessor[] = []

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile) continue
    if (!source.fileName.includes('/src/structures/')) continue

    ts.forEachChild(source, (node) => {
      if (!ts.isClassDeclaration(node) || node.name === undefined) return
      const owner = node.name.text

      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !readsCache(member)) continue
        const signature = checker.getSignatureFromDeclaration(member)
        if (signature === undefined) continue
        found.push({
          owner,
          name: member.name.getText(),
          returns: checker.typeToString(checker.getReturnTypeOfSignature(signature)),
        })
      }
    })
  }

  return found
}

const accessors = findAccessors()

describe('cache-backed accessors', () => {
  it('CU5a: finds the accessors to check', () => {
    // The sweep's own guard. A selector that quietly matched nothing would make the case
    // below pass on an empty list, which is the one way a test like this fails silently.
    assert.ok(
      accessors.length >= 5,
      `expected several cache-backed accessors; found ${String(accessors.length)}`,
    )
    assert.ok(
      accessors.some((accessor) => accessor.owner === 'Guild' && accessor.name === 'roles'),
      'Guild.roles was not found, so the selector is not matching what it should',
    )
  })

  it('CU5: never promises a cached entity it may not have', () => {
    const asserting = accessors
      .filter((accessor) => !(`${accessor.owner}.${accessor.name}` in TOTAL_BY_DESIGN))
      .filter((accessor) => !/undefined|\[\]|Array<|null/.test(accessor.returns))
      .map((accessor) => `${accessor.owner}.${accessor.name}(): ${accessor.returns}`)

    assert.deepEqual(
      asserting.sort(),
      [],
      'a cache-backed accessor promises an entity the cache may not hold; ADR 4 says it must ' +
        'return `T | undefined` or a possibly-empty array, or join TOTAL_BY_DESIGN with a ' +
        'reason',
    )
  })

  it('CU5b: keeps no stale excuses in the allowlist', () => {
    // An entry that no longer describes anything is worse than no entry: it reads as a
    // considered exception when it is a leftover.
    const names = new Set(accessors.map((accessor) => `${accessor.owner}.${accessor.name}`))
    const stale = Object.keys(TOTAL_BY_DESIGN).filter((name) => !names.has(name))

    assert.deepEqual(
      stale,
      [],
      'an allowlisted accessor no longer exists or no longer reads the cache',
    )
  })
})
