import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import ts from 'typescript'

/**
 * The public event surface, snapshotted so it cannot change by accident.
 *
 * @remarks
 * **Event names are the whole consumer contract.** A bot is `client.on('messageCreate', …)`
 * and almost nothing else, so a rename is the most breaking change this library can make —
 * and it was the change nothing could see. `ClientEvents` is hand-written, but its argument
 * types come from `@vestra/types`, and §7's N-series checks *field* naming rather than event
 * naming. Nothing compared the event surface to anything.
 *
 * **What this asserts is change, not correctness.** A snapshot cannot tell a good name from a
 * bad one; it can only refuse to let one move quietly. Adding an event is a one-line edit
 * here and reviewable as such. Renaming or removing one fails, and should — after publication
 * that is a major version, and this is where somebody is asked to notice.
 *
 * Arity is included because a signature change breaks a consumer just as hard as a rename and
 * is even easier to make by accident: appending a parameter to a tuple looks additive and is
 * not, since a listener written against the old shape still compiles while receiving an
 * argument it does not expect to be there.
 */

/** The published events, as `name` to argument count. */
const SURFACE: Readonly<Record<string, number>> = {
  autoModerationActionExecution: 1,
  autoModerationRuleCreate: 1,
  autoModerationRuleDelete: 1,
  autoModerationRuleUpdate: 1,
  channelCreate: 1,
  channelDelete: 1,
  channelPinsUpdate: 3,
  channelUpdate: 1,
  dispatchDropped: 3,
  error: 2,
  guildAuditLogEntryCreate: 1,
  guildBanAdd: 2,
  guildBanRemove: 2,
  guildCreate: 1,
  guildDelete: 1,
  guildEmojisUpdate: 3,
  guildMemberAdd: 1,
  guildMemberRemove: 2,
  guildMemberUpdate: 1,
  guildScheduledEventCreate: 1,
  guildScheduledEventDelete: 1,
  guildScheduledEventUpdate: 1,
  guildScheduledEventUserAdd: 3,
  guildScheduledEventUserRemove: 3,
  guildStickersUpdate: 3,
  guildUnavailable: 1,
  guildUpdate: 1,
  interactionCreate: 1,
  inviteCreate: 1,
  inviteDelete: 3,
  messageCreate: 1,
  messageDelete: 3,
  messageDeleteBulk: 3,
  messageReactionAdd: 5,
  messageReactionRemove: 5,
  messageReactionRemoveAll: 3,
  messageReactionRemoveEmoji: 4,
  messageUpdate: 2,
  presenceUpdate: 1,
  raw: 3,
  ready: 1,
  roleCreate: 2,
  roleDelete: 2,
  roleUpdate: 2,
  shardGuildsReady: 2,
  stageInstanceCreate: 1,
  stageInstanceDelete: 1,
  stageInstanceUpdate: 1,
  threadCreate: 1,
  threadDelete: 1,
  threadListSync: 2,
  threadMembersUpdate: 3,
  threadUpdate: 1,
  typingStart: 4,
  userUpdate: 1,
  voiceStateUpdate: 4,
}

const entry = fileURLToPath(new URL('../src/events/ClientEvents.ts', import.meta.url))

const program = ts.createProgram([entry], {
  target: ts.ScriptTarget.ES2023,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
})

/**
 * The event surface as it is declared today.
 *
 * @returns Each event name and how many arguments it carries.
 *
 * @remarks
 * Read from the declaration rather than from a runtime value, because `ClientEvents` is an
 * interface and erases entirely — there is nothing at runtime to enumerate.
 */
function declaredSurface(): Record<string, number> {
  const source = program.getSourceFile(entry)
  assert.ok(source !== undefined, 'could not load ClientEvents.ts')

  const found: Record<string, number> = {}

  ts.forEachChild(source, (node) => {
    if (!ts.isInterfaceDeclaration(node) || node.name.text !== 'ClientEvents') return

    for (const member of node.members) {
      if (!ts.isPropertySignature(member) || member.type === undefined) continue
      if (!ts.isIdentifier(member.name)) continue
      assert.ok(
        ts.isTupleTypeNode(member.type),
        `${member.name.text} is not declared as a tuple, so its arity cannot be read`,
      )
      found[member.name.text] = member.type.elements.length
    }
  })

  return found
}

const declared = declaredSurface()

describe('public event surface', () => {
  it('ES1: finds the events to check', () => {
    // The canary. A selector that matched nothing would make the comparison below pass on two
    // empty objects, which is how a snapshot test stops testing anything.
    assert.ok(
      Object.keys(declared).length > 40,
      `expected the full event surface; found ${String(Object.keys(declared).length)}`,
    )
    assert.ok('messageCreate' in declared, 'messageCreate is missing, so the parse is wrong')
  })

  it('ES2: matches the snapshot, name and arity', () => {
    // A single deepEqual rather than two loops, so a rename shows as one removal beside one
    // addition — which is what a rename actually is, and what a reviewer needs to see.
    assert.deepEqual(
      declared,
      SURFACE,
      'the public event surface changed. Adding an event means adding a line above. ' +
        'Renaming, removing or re-arging one is a breaking change for every consumer, ' +
        'and this is the place to decide that deliberately.',
    )
  })
})
