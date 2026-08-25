import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { GatewayIntentBits } from '@vestra/types'
import type { Message, MessageChanges } from '@vestra/core'
import ts from 'typescript'
import { scriptedClient, tick, type ScriptedTransport } from './scripted-client.ts'

/**
 * What `messageUpdate` reports instead of an old message.
 *
 * @remarks
 * The gap this closes was a loss of information, not a difference of convention. `patch`
 * overwrote the cached message in place and returned nothing, so the previous content was
 * gone the instant the edit arrived — unrecoverable by any means the library offered. A
 * logging bot, the commonest reason anybody listens to this event at all, could report that
 * a message had been edited and never what it used to say.
 *
 * Driven through a real shard rather than by calling `patch` directly, because the handler
 * has its own half of this: it must pass the record through on the cached path and pass
 * `null` on the uncached one, and a unit test on `patch` would prove neither.
 */

const CHANNEL = '290926798999357250'
const MESSAGE = '334385199974967042'

const AUTHOR = { id: '80351110224678912', username: 'nelly', discriminator: '0', avatar: null }

/** A `MESSAGE_CREATE` payload, complete enough to cache. */
function created(content: string): Record<string, unknown> {
  return {
    id: MESSAGE,
    channel_id: CHANNEL,
    author: AUTHOR,
    content,
    timestamp: '2024-01-01T00:00:00.000000+00:00',
    edited_timestamp: null,
    tts: false,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0,
  }
}

/** A client that actually holds messages, since the default policy does not. */
async function cachingClient(): Promise<{
  client: Awaited<ReturnType<typeof scriptedClient>>['client']
  transport: ScriptedTransport
}> {
  const { client, transports } = await scriptedClient({
    intents: [GatewayIntentBits.GuildMessages],
    cache: { messages: true },
  })
  const transport = transports[0]
  assert.ok(transport !== undefined)
  return { client, transport }
}

/** Collects every `messageUpdate` the client emits. */
function record(
  client: Awaited<ReturnType<typeof scriptedClient>>['client'],
): { message: Message; changes: MessageChanges | null }[] {
  const seen: { message: Message; changes: MessageChanges | null }[] = []
  client.on('messageUpdate', (message, changes) => {
    seen.push({ message, changes })
  })
  return seen
}

/** The one update the client emitted. */
function only(seen: { message: Message; changes: MessageChanges | null }[]): {
  message: Message
  changes: MessageChanges | null
} {
  assert.equal(seen.length, 1, `expected exactly one messageUpdate, got ${String(seen.length)}`)
  const entry = seen[0]
  assert.ok(entry !== undefined)
  return entry
}

describe('message update changes', () => {
  it('CG1: reports the previous content and nothing that did not change', async () => {
    const { client, transport } = await cachingClient()
    const seen = record(client)

    try {
      transport.dispatch('MESSAGE_CREATE', created('before'), 10)
      await tick()
      transport.dispatch(
        'MESSAGE_UPDATE',
        { id: MESSAGE, channel_id: CHANNEL, content: 'after' },
        11,
      )
      await tick()

      const { message, changes } = only(seen)
      assert.equal(message.content, 'after', 'the message should carry the new content')
      assert.ok(changes !== null, 'a cached message that changed must report what it displaced')
      assert.equal(changes.content, 'before', 'the previous content was not reported')
      // Only what changed. A record listing every field the payload happened to omit would
      // make "was this edited" unanswerable without diffing it against the message.
      assert.deepEqual(Object.keys(changes), ['content'])
    } finally {
      await client.destroy()
    }
  })

  it('CG2: reports null for a message it never held', async () => {
    // The design's EV12, and the case the default cache policy makes universal. There is no
    // earlier state, so the honest answer is that the library does not know — never a
    // fabricated previous message and never an empty record, which would read as "unchanged".
    const { client, transport } = await cachingClient()
    const seen = record(client)

    try {
      transport.dispatch(
        'MESSAGE_UPDATE',
        { id: MESSAGE, channel_id: CHANNEL, content: 'only ever seen edited' },
        10,
      )
      await tick()

      const { message, changes } = only(seen)
      assert.equal(changes, null, 'an uncached message cannot report a previous value')
      assert.equal(message.content, 'only ever seen edited')
      assert.equal(message.partial, true, 'built from the partial, not fabricated')
    } finally {
      await client.destroy()
    }
  })

  it('CG3: reports null when the payload repeats what is already held', async () => {
    // An embed resolving server-side, or a dispatch replayed after a resume, produces an
    // update that changes nothing. Allocating a record for it would make `changes !== null`
    // useless as a "did anything happen" test, which is the cheapest thing a listener can ask.
    const { client, transport } = await cachingClient()
    const seen = record(client)

    try {
      transport.dispatch('MESSAGE_CREATE', created('unchanged'), 10)
      await tick()
      transport.dispatch(
        'MESSAGE_UPDATE',
        // Includes the author deliberately: it is patched in place, so if it were reported
        // this record would be non-null on every update that carries one, which is all of them.
        { id: MESSAGE, channel_id: CHANNEL, author: AUTHOR, content: 'unchanged', pinned: false },
        11,
      )
      await tick()

      const { changes } = only(seen)
      assert.equal(changes, null, 'a payload that changed nothing must report nothing')
    } finally {
      await client.destroy()
    }
  })

  it('CG4: reports an array field whenever the payload carries it', async () => {
    // The documented imprecision, pinned so it stays documented. `embeds` here is deep-equal
    // to what is already held and still reports as changed, because a freshly parsed array is
    // never the object it replaces and deep comparison on a dispatch path is not worth its
    // cost. Somebody who decides otherwise has to come here and change this on purpose.
    const { client, transport } = await cachingClient()
    const seen = record(client)

    try {
      transport.dispatch('MESSAGE_CREATE', created('same'), 10)
      await tick()
      transport.dispatch('MESSAGE_UPDATE', { id: MESSAGE, channel_id: CHANNEL, embeds: [] }, 11)
      await tick()

      const { changes } = only(seen)
      assert.ok(changes !== null, 'a carried array must be reported')
      assert.deepEqual(Object.keys(changes), ['embeds'])
      assert.deepEqual(changes.embeds, [], 'the previous array is the one that was displaced')
    } finally {
      await client.destroy()
    }
  })
})

const source = ts.createSourceFile(
  'Message.ts',
  readFileSync(fileURLToPath(new URL('../src/structures/Message.ts', import.meta.url)), 'utf8'),
  ts.ScriptTarget.ES2023,
  true,
)

/** The `patch` method, as declared. */
function patchMethod(): ts.MethodDeclaration {
  let found: ts.MethodDeclaration | undefined
  const visit = (node: ts.Node): void => {
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'patch') {
      found = node
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(source, visit)
  assert.ok(found !== undefined, 'Message.patch was not found, so this guard reads nothing')
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

/** Every field name the two readers above find in `patch`. */
function fieldsInPatch(): { recorded: string[]; assigned: string[] } {
  const recorded = new Set<string>()
  const assigned = new Set<string>()
  const visit = (node: ts.Node): void => {
    const record = recordedField(node)
    if (record !== undefined) recorded.add(record)
    const assign = assignedField(node)
    if (assign !== undefined) assigned.add(assign)
    ts.forEachChild(node, visit)
  }
  visit(patchMethod())
  return { recorded: [...recorded].sort(), assigned: [...assigned].sort() }
}

/** The members of the `MessageChangeField` union, as declared. */
function declaredFields(): string[] {
  let found: string[] | undefined
  ts.forEachChild(source, (node) => {
    if (!ts.isTypeAliasDeclaration(node) || node.name.text !== 'MessageChangeField') return
    assert.ok(ts.isUnionTypeNode(node.type), 'MessageChangeField is no longer a union of literals')
    found = node.type.types.map((member) => {
      assert.ok(
        ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal),
        'MessageChangeField carries a member that is not a string literal',
      )
      return member.literal.text
    })
  })
  assert.ok(found !== undefined, 'MessageChangeField was not found')
  return [...found].sort()
}

/**
 * Fields `patch` writes and deliberately never reports.
 *
 * @remarks
 * One entry, and it needs its reason here rather than only in the TSDoc: `author` is patched
 * in place, so the object a record would hand back is the same object with the new values
 * already in it. Reporting it would be worse than omitting it — it would look like history
 * and be a mirror.
 */
const UNREPORTABLE = ['author']

describe('the change record cannot drift from what patch does', () => {
  it('CG5: every field patch records is declared, and every declared field is recorded', () => {
    const { recorded } = fieldsInPatch()
    // The canary. Both readers below match on AST shape, so a change to how the record is
    // written — a helper, a different operator — would make them find nothing and let two
    // empty sets agree with each other.
    assert.ok(
      recorded.length > 5,
      `expected patch to record several fields; found ${String(recorded.length)}`,
    )

    assert.deepEqual(
      recorded,
      declaredFields(),
      'MessageChangeField and the body of Message.patch disagree. A field recorded but not ' +
        'declared will not type-check for a consumer; a field declared but not recorded is a ' +
        'key the record offers and never fills.',
    )
  })

  it('CG6: every field patch writes is either reported or listed as unreportable', () => {
    const { recorded, assigned } = fieldsInPatch()
    assert.ok(assigned.length > recorded.length, 'the assignment reader found nothing extra')

    const silent = assigned.filter((field) => !recorded.includes(field))
    assert.deepEqual(
      silent,
      UNREPORTABLE,
      'a field added to Message.patch is overwriting a value nobody can recover. Either ' +
        'record it and add it to MessageChangeField, or add it to UNREPORTABLE with the ' +
        'reason its previous value cannot be handed back.',
    )
  })
})
