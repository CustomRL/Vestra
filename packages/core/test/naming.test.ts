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
