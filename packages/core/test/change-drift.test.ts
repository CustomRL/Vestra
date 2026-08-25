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

/** Parses one structure's source, named relative to `src/structures`. */
function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(fileURLToPath(new URL(`../src/structures/${file}`, import.meta.url)), 'utf8'),
    ts.ScriptTarget.ES2023,
    true,
  )
}

/** The named methods declared in this file. Private names count, and are spelled with the `#`. */
function methods(source: ts.SourceFile, wanted: readonly string[]): ts.MethodDeclaration[] {
  const found: ts.MethodDeclaration[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isMethodDeclaration(node)) {
      const name = ts.isIdentifier(node.name)
        ? node.name.text
        : ts.isPrivateIdentifier(node.name)
          ? node.name.text
          : undefined
      if (name !== undefined && wanted.includes(name)) found.push(node)
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(source, visit)
  assert.equal(
    found.length,
    wanted.length,
    `expected ${wanted.join(', ')} in ${source.fileName}; found ${String(found.length)}`,
  )
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

/** Every field name the two readers above find in the given methods. */
function fieldsIn(bodies: readonly ts.Node[]): { recorded: Set<string>; assigned: Set<string> } {
  const recorded = new Set<string>()
  const assigned = new Set<string>()
  const visit = (node: ts.Node): void => {
    const record = recordedField(node)
    if (record !== undefined) recorded.add(record)
    const assign = assignedField(node)
    if (assign !== undefined) assigned.add(assign)
    ts.forEachChild(node, visit)
  }
  for (const body of bodies) visit(body)
  return { recorded, assigned }
}

/** The same, for one structure whose whole record lives in its `patch`. */
function fieldsInPatch(
  source: ts.SourceFile,
  name: string,
): { recorded: string[]; assigned: string[] } {
  void name
  const { recorded, assigned } = fieldsIn(methods(source, ['patch']))
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

/**
 * The channel classes, which share one record instead of declaring one each.
 *
 * @remarks
 * `channelUpdate` emits the base {@link Channel}, so the record has to hold every field any
 * subclass can report — see `ChannelChanges.ts`. That means the check is a different shape
 * from the one above: rather than one union per class, the fields recorded across the whole
 * hierarchy have to add up to exactly the keys of `ChannelFields`.
 *
 * `ThreadChannel` is listed with `#applyMetadata` beside its `patch`, because the six thread
 * metadata fields have one assignment site shared with the constructor and `patch` reads
 * across it rather than through it. Without that entry the assignment reader would find six
 * records with nothing assigning them.
 */
const CHANNEL_PATCHES: readonly { file: string; methods: readonly string[] }[] = [
  { file: 'channels/Channel.ts', methods: ['patch'] },
  { file: 'channels/GuildChannel.ts', methods: ['patch'] },
  { file: 'channels/GuildTextBasedChannel.ts', methods: ['patch'] },
  { file: 'channels/TextChannel.ts', methods: ['patch'] },
  { file: 'channels/AnnouncementChannel.ts', methods: ['patch'] },
  { file: 'channels/VoiceChannel.ts', methods: ['patch'] },
  { file: 'channels/ThreadOnlyChannel.ts', methods: ['patch'] },
  { file: 'channels/ForumChannel.ts', methods: ['patch'] },
  { file: 'channels/ThreadChannel.ts', methods: ['patch', '#applyMetadata'] },
  { file: 'channels/DMChannel.ts', methods: ['patch'] },
  { file: 'channels/GroupDMChannel.ts', methods: ['patch'] },
]

/**
 * Fields a channel patch writes and deliberately never reports.
 *
 * @remarks
 * `availableTags` is a list of tag definitions rather than IDs, so telling a renamed tag from
 * an unchanged one means comparing objects by value. `recipients` is rebuilt into fresh `User`
 * structures on every dispatch, and who is in a DM does not change — a bot cannot be added to
 * a group DM after the fact.
 */
const CHANNEL_UNREPORTABLE = ['availableTags', 'recipients']

/** The keys of the `ChannelFields` interface, which is what the record can hold. */
function channelFieldKeys(): string[] {
  const source = parse('channels/ChannelChanges.ts')
  let found: string[] | undefined
  ts.forEachChild(source, (node) => {
    if (!ts.isInterfaceDeclaration(node) || node.name.text !== 'ChannelFields') return
    found = node.members.map((member) => {
      assert.ok(
        ts.isPropertySignature(member) && ts.isIdentifier(member.name),
        'ChannelFields carries a member this guard cannot read',
      )
      return member.name.text
    })
  })
  assert.ok(found !== undefined, 'ChannelFields was not found')
  return [...found].sort()
}

/** Everything recorded and assigned across the whole channel hierarchy. */
function channelFields(): { recorded: string[]; assigned: string[] } {
  const recorded = new Set<string>()
  const assigned = new Set<string>()
  for (const target of CHANNEL_PATCHES) {
    const found = fieldsIn(methods(parse(target.file), target.methods))
    for (const field of found.recorded) recorded.add(field)
    for (const field of found.assigned) assigned.add(field)
  }
  return { recorded: [...recorded].sort(), assigned: [...assigned].sort() }
}

describe('the channel record covers the whole hierarchy', () => {
  it('CD3: every ChannelFields key is recorded by some patch, and no patch records more', () => {
    const keys = channelFieldKeys()
    // The canary. Eleven patches feed this, and a reader that stopped matching would leave two
    // sets agreeing on nothing.
    assert.ok(keys.length > 25, `expected the full channel field set; found ${String(keys.length)}`)

    assert.deepEqual(
      channelFields().recorded,
      keys,
      'ChannelFields and the channel patches disagree. A key nothing records is one the ' +
        'record offers and never fills; a field recorded without a key does not compile for ' +
        'a consumer.',
    )
  })

  it('CD4: no channel patch overwrites a value it neither reports nor excuses', () => {
    const { recorded, assigned } = channelFields()
    const silent = assigned.filter((field) => !recorded.includes(field))
    assert.deepEqual(
      silent,
      [...CHANNEL_UNREPORTABLE].sort(),
      'a field added to a channel patch is overwriting a value nobody can recover. Either ' +
        'record it and add it to ChannelFields, or list it above with the reason its ' +
        'previous value cannot be handed back.',
    )
  })
})
