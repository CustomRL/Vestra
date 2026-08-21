import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import ts from 'typescript'

/**
 * The snake_case to camelCase rule structures convert payloads with.
 *
 * @remarks
 * `docs/design/phase-4-core.md` §4.15 fixes the rule as mechanical camelCase — split on
 * `_`, uppercase the following character — with a short allowlist for names where the
 * mechanical result would be ambiguous or misleading. §8-A14 recorded that whether the
 * rule is unambiguous across every payload file was **not** verified, and noted that "I saw
 * no digits or doubled underscores" is not the same as "there are none".
 *
 * This settles it, and keeps it settled. The spec says to write this before a single
 * structure is written, because the answer decides whether the rule can be mechanical at
 * all: one collision means every structure needs a hand-maintained field map instead.
 *
 * Reading the API types through the compiler API rather than by regex matters here — a
 * regex over the source cannot tell a property signature from a field name inside a
 * comment, a template literal, or a nested object type.
 */

/** Applies the mechanical rule. */
function toCamelCase(field: string): string {
  return field.replaceAll(/_(.)/g, (_match, next: string) => next.toUpperCase())
}

/**
 * Every field name declared by an exported `API*` type.
 *
 * @returns Field names mapped to the types that declare them.
 */
function readApiFieldNames(): Map<string, Set<string>> {
  const entry = fileURLToPath(new URL('../../types/src/index.ts', import.meta.url))
  const program = ts.createProgram([entry], {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  })

  const checker = program.getTypeChecker()
  const source = program.getSourceFile(entry)
  assert.ok(source !== undefined, `could not load ${entry}`)

  const moduleSymbol = checker.getSymbolAtLocation(source)
  assert.ok(moduleSymbol !== undefined, 'the types entry point exports nothing')

  const fields = new Map<string, Set<string>>()
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const name = exported.getName()
    if (!name.startsWith('API')) continue

    const declared = checker.getDeclaredTypeOfSymbol(exported)
    for (const property of checker.getPropertiesOfType(declared)) {
      const field = property.getName()
      const owners = fields.get(field) ?? new Set<string>()
      owners.add(name)
      fields.set(field, owners)
    }
  }
  return fields
}

const apiFields = readApiFieldNames()

describe('payload field naming', () => {
  it('N1: finds the API surface at all', () => {
    // Guards the test itself. If the compiler API stops resolving the entry point, every
    // assertion below passes over an empty set and proves nothing.
    assert.ok(
      apiFields.size > 300,
      `expected the payload surface to be large; got ${String(apiFields.size)} fields`,
    )
    assert.ok(apiFields.has('guild_id'), 'a known field is missing, so extraction is wrong')
  })

  it('N2: converts no two API fields to the same structure field', () => {
    // A collision would mean two wire fields wanting one property name, which the
    // mechanical rule cannot express. One is enough to sink the whole approach.
    const byCamel = new Map<string, string[]>()
    for (const field of apiFields.keys()) {
      const camel = toCamelCase(field)
      byCamel.set(camel, [...(byCamel.get(camel) ?? []), field])
    }

    const collisions = [...byCamel.entries()]
      .filter(([, raws]) => raws.length > 1)
      .map(([camel, raws]) => `${camel} <- ${raws.sort().join(', ')}`)

    assert.deepEqual(collisions, [], 'the mechanical rule must be injective')
  })

  it('N3: sees no field the mechanical rule handles ambiguously', () => {
    // The specific shapes that would make `_(.)` do something surprising: a digit after an
    // underscore has no uppercase form, a doubled underscore leaves one behind, and an edge
    // underscore has nothing to fold into.
    const awkward: string[] = []
    for (const field of apiFields.keys()) {
      if (field.includes('__')) awkward.push(`${field} (doubled underscore)`)
      if (field.startsWith('_') || field.endsWith('_')) awkward.push(`${field} (edge underscore)`)
      if (/_\d/.test(field)) awkward.push(`${field} (digit after underscore)`)
    }

    assert.deepEqual(awkward.sort(), [], 'these names need an allowlist entry')
  })

  it('N4: round-trips every field back to its wire name', () => {
    // The rule has to be reversible, or the drift check and any future codec cannot map a
    // structure field back to the payload it came from.
    const toSnake = (field: string): string =>
      field.replaceAll(/[A-Z]/g, (upper) => `_${upper.toLowerCase()}`)

    const broken = [...apiFields.keys()]
      .filter((field) => field === field.toLowerCase())
      .filter((field) => toSnake(toCamelCase(field)) !== field)

    assert.deepEqual(broken, [], 'camelCase must be reversible for all-lowercase wire names')
  })

  it('N5: leaves an already-camelCase field untouched', () => {
    // `@vestra/types` mirrors the wire format, which is snake_case, so a mixed-case field
    // name is either a mistake in the typings or a genuine Discord inconsistency. Either
    // way it needs a human, because the rule cannot know which.
    const mixed = [...apiFields.keys()].filter(
      (field) => field !== field.toLowerCase() && !field.startsWith('$'),
    )
    assert.deepEqual(mixed.sort(), [], 'a mixed-case wire field needs an allowlist decision')
  })
})

/**
 * Which API type each structure mirrors.
 *
 * @remarks
 * A structure absent from this table is simply not checked, which is why the test reports
 * its coverage count — an empty failure list over an empty table means nothing at all. Add
 * a row when you add a structure.
 */
const STRUCTURE_SOURCES: { structure: string; api: string }[] = [
  { structure: 'User', api: 'APIUser' },
  { structure: 'Role', api: 'APIRole' },
  { structure: 'GuildMember', api: 'APIGuildMember' },
]

/**
 * Structure fields whose name is not the mechanical camelCase of an API field.
 *
 * @remarks
 * Every entry needs a reason, because the bar for renaming is high: a rename is something
 * users must learn, and it breaks grep against Discord's own documentation. §4.15 sets the
 * bar at "the mechanical result is ambiguous or collides", not "the mechanical result is
 * ugly".
 *
 * Removing an entry is how you decide a rename was wrong.
 */
const RENAMES: Record<string, Record<string, string>> = {
  GuildMember: {
    guildId:
      'Not on the payload at all — Discord puts guild_id on the dispatch, not on the ' +
      'member. Supplied by the caller so the guildId:userId cache key is derivable.',
    userId:
      'Not on the payload. Read from user.id would be undefined for message.member, ' +
      'which is the most common member a bot touches.',
    joinedTimestamp:
      'joined_at. The mechanical result, joinedAt, collides with the Date getter of the ' +
      'same name — exactly the ambiguity §4.15 sets the renaming bar at.',
    premiumSinceTimestamp:
      'premium_since. Follows the same suffix rule as joinedTimestamp: a rule with one ' +
      'exception is harder to remember than a rule.',
    communicationDisabledUntilTimestamp:
      'communication_disabled_until. Same suffix rule, and the natural name is taken by ' +
      'the Date getter.',
  },
}

/**
 * The instance fields a structure class declares.
 *
 * @param className - The class to read.
 * @returns Its declared property names, excluding methods and accessors.
 */
const coreProgram = (() => {
  const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url))
  const program = ts.createProgram([entry], {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  })
  const source = program.getSourceFile(entry)
  assert.ok(source !== undefined, `could not load ${entry}`)
  return { checker: program.getTypeChecker(), source }
})()

function readStructureFields(className: string): string[] {
  const { checker, source } = coreProgram
  const moduleSymbol = checker.getSymbolAtLocation(source)
  assert.ok(moduleSymbol !== undefined)

  const exported = checker
    .getExportsOfModule(moduleSymbol)
    .find((symbol) => symbol.getName() === className)
  assert.ok(exported !== undefined, `${className} is not exported`)

  const declared = checker.getDeclaredTypeOfSymbol(exported)
  return (
    checker
      .getPropertiesOfType(declared)
      .filter((property) =>
        (property.getDeclarations() ?? []).some((declaration) =>
          ts.isPropertyDeclaration(declaration),
        ),
      )
      .map((property) => property.getName())
      // Private fields are implementation, not the mirrored surface. `#client` comes from
      // `Base` and has no payload to be named after.
      .filter((name) => !name.startsWith('#'))
  )
}

describe('structure field naming', () => {
  it('N6: names every structure field after the payload, or records why not', () => {
    // The rule is only mechanical if nothing quietly departs from it. Without this, a
    // rename is a comment in one class that nobody else ever sees.
    const unexplained: string[] = []
    let checked = 0

    for (const { structure, api } of STRUCTURE_SOURCES) {
      const allowed = RENAMES[structure] ?? {}
      const apiCamel = new Set([...apiFields.keys()].map(toCamelCase))

      for (const field of readStructureFields(structure)) {
        checked += 1
        if (apiCamel.has(field)) continue
        if (typeof allowed[field] === 'string' && allowed[field].length > 0) continue
        unexplained.push(`${structure}.${field} (mirrors nothing on ${api}, and has no reason)`)
      }
    }

    assert.ok(checked > 20, `expected to check a real surface; checked ${String(checked)}`)
    assert.deepEqual(unexplained.sort(), [], 'each of these needs a RENAMES entry with a reason')
  })

  it('N7: keeps no stale rename entries', () => {
    // A rename that no longer exists is worse than none: it documents a decision the code
    // has already walked back, and the next reader trusts it.
    const stale: string[] = []
    for (const { structure } of STRUCTURE_SOURCES) {
      const fields = new Set(readStructureFields(structure))
      for (const renamed of Object.keys(RENAMES[structure] ?? {})) {
        if (!fields.has(renamed)) stale.push(`${structure}.${renamed}`)
      }
    }
    assert.deepEqual(stale.sort(), [], 'these renames name fields that no longer exist')
  })
})
