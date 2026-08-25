import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import ts from 'typescript'

/**
 * Every change record agrees with the `patch` that fills it.
 *
 * @remarks
 * A change record is two halves that have to stay in step: a `patch` that writes
 * `;(changes ??= {}).field = this.field`, and a `*ChangeField` union naming what it may write.
 * Nothing in the type system connects them. A field declared but never recorded is a key the
 * record offers and never fills; a field recorded but not declared does not type-check for a
 * consumer; and — the one that matters — a field added to `patch` and recorded nowhere is a
 * value being overwritten that nobody can get back, which is the exact defect change records
 * were built to fix.
 *
 * So both halves are read off the source and compared. The readers match on AST shape rather
 * than on text, and each structure declares how many fields it expects, because a reader that
 * silently found nothing would let two empty sets agree with each other.
 */

/** A structure that reports what its patch displaced. */
interface Recording {
  /** What to call it in a failure. */
  name: string
  /** Its source file, under `src/structures`. */
  file: string
  /** The union naming what its `patch` may report. */
  union: string
  /** How many literal members that union declares. The canary. */
  declares: number
  /**
   * Fields the `patch` writes and deliberately never reports.
   *
   * @remarks
   * Every entry needs a reason, and there are only two kinds. A sub-structure patched in place
   * — `Message.author`, `GuildMember.user` — leaves no previous object to hand back, because
   * the one a record would carry is the same object with the new values already in it.
   * `Presence.activities` is the other kind and the only exclusion made on cost: it is rebuilt
   * on the highest-volume dispatch Discord sends, so reporting it would make the record
   * non-null every time while comparing it deeply would run on the busiest path in the library.
   */
  unreportable: readonly string[]
}

const RECORDING: readonly Recording[] = [
  {
    name: 'Message',
    file: 'Message.ts',
    union: 'MessageChangeField',
    declares: 14,
    unreportable: ['author'],
  },
  { name: 'Guild', file: 'Guild.ts', union: 'GuildChangeField', declares: 27, unreportable: [] },
  {
    name: 'GuildMember',
    file: 'GuildMember.ts',
    union: 'GuildMemberChangeField',
    declares: 12,
    unreportable: ['user'],
  },
  { name: 'Role', file: 'Role.ts', union: 'RoleChangeField', declares: 11, unreportable: [] },
  { name: 'User', file: 'User.ts', union: 'UserChangeField', declares: 10, unreportable: [] },
  {
    name: 'ClientUser',
    file: 'ClientUser.ts',
    union: 'ClientUserChangeField',
    // Two literals of its own; the rest arrive as a reference to `UserChangeField`, and the
    // fields behind that reference are recorded by `User.patch` rather than by this one.
    declares: 2,
    unreportable: [],
  },
  {
    name: 'Presence',
    file: 'Presence.ts',
    union: 'PresenceChangeField',
    declares: 2,
    unreportable: ['activities'],
  },
]

/** Parses one structure's source. */
function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(fileURLToPath(new URL(`../src/structures/${file}`, import.meta.url)), 'utf8'),
    ts.ScriptTarget.ES2023,
    true,
  )
}

/** The `patch` method declared in this file. */
function patchMethod(source: ts.SourceFile, name: string): ts.MethodDeclaration {
  let found: ts.MethodDeclaration | undefined
  const visit = (node: ts.Node): void => {
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'patch') {
      found = node
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(source, visit)
  assert.ok(found !== undefined, `${name}.patch was not found, so this guard reads nothing`)
  return found
}

/** The field name in `;(changes ??= {}).field = …`, if this node is one. */
function recordedField(node: ts.Node): string | undefined {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return undefined
  }
  if (!ts.isPropertyAccessExpression(node.left)) return undefined
  const receiver = ts.isParenthesizedExpression(node.left.expression)
    ? node.left.expression.expression
    : node.left.expression
  if (
    !ts.isBinaryExpression(receiver) ||
    receiver.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionEqualsToken
  ) {
    return undefined
  }
  if (!ts.isIdentifier(receiver.left) || receiver.left.text !== 'changes') return undefined
  return node.left.name.text
}

/** The field name in `this.field = …`, if this node is one. */
function assignedField(node: ts.Node): string | undefined {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return undefined
  }
  if (!ts.isPropertyAccessExpression(node.left)) return undefined
  if (node.left.expression.kind !== ts.SyntaxKind.ThisKeyword) return undefined
  return node.left.name.text
}

/** Every field name the two readers above find in one `patch`. */
function fieldsInPatch(
  source: ts.SourceFile,
  name: string,
): { recorded: string[]; assigned: string[] } {
  const recorded = new Set<string>()
  const assigned = new Set<string>()
  const visit = (node: ts.Node): void => {
    const record = recordedField(node)
    if (record !== undefined) recorded.add(record)
    const assign = assignedField(node)
    if (assign !== undefined) assigned.add(assign)
    ts.forEachChild(node, visit)
  }
  visit(patchMethod(source, name))
  return { recorded: [...recorded].sort(), assigned: [...assigned].sort() }
}

/**
 * The string-literal members of one change union.
 *
 * @param source - The parsed structure file.
 * @param union - The union's name.
 * @returns Its literal members, sorted.
 *
 * @remarks
 * A member that is not a literal has to be a reference to another change union — `ClientUser`
 * extends `User`'s — and is skipped here because the fields behind it are recorded by the
 * parent's `patch` rather than by this one. Anything else is rejected rather than ignored: a
 * mapped or conditional type in this position would make the union unreadable and the guard
 * would quietly stop covering it.
 */
function declaredFields(source: ts.SourceFile, union: string): string[] {
  let found: string[] | undefined
  ts.forEachChild(source, (node) => {
    if (!ts.isTypeAliasDeclaration(node) || node.name.text !== union) return
    const members = ts.isUnionTypeNode(node.type) ? node.type.types : [node.type]
    const literals: string[] = []
    for (const member of members) {
      if (ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal)) {
        literals.push(member.literal.text)
        continue
      }
      assert.ok(
        ts.isTypeReferenceNode(member),
        `${union} carries a member that is neither a string literal nor a reference to ` +
          'another change union, so this guard can no longer read what it declares',
      )
    }
    found = literals
  })
  assert.ok(found !== undefined, `${union} was not found`)
  return [...found].sort()
}

describe('change records cannot drift from the patches that fill them', () => {
  for (const target of RECORDING) {
    it(`CD1 ${target.name}: records exactly what its change union declares`, () => {
      const source = parse(target.file)
      const declared = declaredFields(source, target.union)

      // The canary, twice over. Both readers match on AST shape, so a change to how a record
      // is written would make them find nothing and let two empty sets agree.
      assert.equal(
        declared.length,
        target.declares,
        `${target.union} declares ${String(declared.length)} fields, not ${String(target.declares)}. ` +
          'If that is deliberate, change the count here so the change is reviewed.',
      )

      const { recorded } = fieldsInPatch(source, target.name)
      assert.deepEqual(
        recorded,
        declared,
        `${target.union} and the body of ${target.name}.patch disagree. A field recorded but ` +
          'not declared will not type-check for a consumer; a field declared but not recorded ' +
          'is a key the record offers and never fills.',
      )
    })

    it(`CD2 ${target.name}: writes nothing it neither reports nor excuses`, () => {
      const source = parse(target.file)
      const { recorded, assigned } = fieldsInPatch(source, target.name)
      assert.ok(assigned.length > 0, `no assignments found in ${target.name}.patch`)
      assert.ok(
        assigned.length >= recorded.length,
        'every recorded field is also assigned, so the assignment reader missing some means ' +
          'it has stopped matching',
      )

      const silent = assigned.filter((field) => !recorded.includes(field))
      assert.deepEqual(
        silent,
        [...target.unreportable].sort(),
        `a field added to ${target.name}.patch is overwriting a value nobody can recover. ` +
          `Either record it and add it to ${target.union}, or list it as unreportable with ` +
          'the reason its previous value cannot be handed back.',
      )
    })
  }
})
