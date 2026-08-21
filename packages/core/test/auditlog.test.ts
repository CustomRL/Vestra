import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import { AuditLogEvent, GatewayOpcodes, type GatewayDispatchPayload } from '@vestra/types'
import {
  CacheRegistry,
  EventRouter,
  type CacheOptions,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'
import { guildAuditLogEntryCreate } from '../dist/events/handlers/auditlog.js'
import { AuditLogEntry } from '../dist/structures/AuditLogEntry.js'

/**
 * The audit log entry structure and its dispatch.
 *
 * @remarks
 * **The router is built here rather than taken from `handlers`**, because
 * `GUILD_AUDIT_LOG_ENTRY_CREATE` is not on the registry yet — the same pattern
 * `errors.test.ts` uses to route a handler that exists only inside a test. The structure and
 * the handler are imported from `dist` for the same reason: neither is on the barrel, and
 * `src` cannot be imported directly because its `.js` specifiers only resolve after a build.
 *
 * What is worth testing here is almost entirely about *faithfulness*: an audit log entry is
 * the only record a moderation bot gets of an action, and every field this structure quietly
 * dropped, renamed or normalised would be a fact about a ban that nothing else can recover.
 */

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }

const GUILD_ID = '613425648685547541'
/** Discord's own documented example snowflake, so the expected timestamp is not self-derived. */
const ENTRY_ID = '175928847299117063'
const ENTRY_CREATED = 1_462_015_105_796
const MOD_ID = '80351110224678912'
const TARGET_ID = '41771983423143936'

/** Every scope on, so "nothing was cached" is a claim about the handler and not the config. */
const ALL_SCOPES: CacheOptions = {
  guilds: true,
  channels: true,
  threads: true,
  roles: true,
  members: true,
  users: true,
  messages: true,
  emojis: true,
  stickers: true,
  presences: true,
  voiceStates: true,
}

function harness(): {
  router: EventRouter
  context: EventContext
  emitted: { event: string; args: unknown[] }[]
} {
  const emitted: { event: string; args: unknown[] }[] = []
  const context: EventContext = {
    cache: new CacheRegistry(ALL_SCOPES),
    rest: undefined as never,
    user: undefined,
    emit: (event: string, ...args: unknown[]) => {
      emitted.push({ event, args })
      return true
    },
    listenerCount: () => 0,
  } as EventContext

  return { router: new EventRouter(context, [guildAuditLogEntryCreate]), context, emitted }
}

function dispatch(t: string, d: unknown): GatewayDispatchPayload {
  return { op: GatewayOpcodes.Dispatch, t, s: 1, d } as GatewayDispatchPayload
}

/** A member-update entry: changes, options and a reason all present. */
function entryPayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ENTRY_ID,
    guild_id: GUILD_ID,
    action_type: AuditLogEvent.MemberRoleUpdate,
    user_id: MOD_ID,
    target_id: TARGET_ID,
    reason: 'Raid cleanup',
    changes: [{ key: '$add', new_value: [{ id: '4', name: 'Muted' }] }],
    options: { integration_type: 'discord', delete_member_days: '7' },
    ...extra,
  }
}

/**
 * Everything the router emitted except `raw`, which it emits for every dispatch and which
 * says nothing about this handler.
 */
function typed(emitted: { event: string; args: unknown[] }[]): {
  event: string
  args: unknown[]
}[] {
  return emitted.filter((record) => record.event !== 'raw')
}

/**
 * The same payload with one key left out.
 *
 * @remarks
 * Rebuilt rather than `delete`d, because `delete` is banned repo-wide — and the point of
 * these fixtures is a payload Discord never sent the key on at all, which is a different
 * object from one that had it removed.
 */
function without(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([name]) => name !== key))
}

/** The one entry a routed dispatch emitted. */
function routeOne(payload: unknown): {
  entry: AuditLogEntry
  emit: { event: string; args: unknown[] }
  context: EventContext
} {
  const { router, context, emitted } = harness()
  router.route(dispatch('GUILD_AUDIT_LOG_ENTRY_CREATE', payload), shard, false)

  const records = typed(emitted)
  assert.equal(records.length, 1, 'expected exactly one emit')
  const [emit] = records
  assert.ok(emit !== undefined)
  const entry = emit.args[0]
  assert.ok(entry instanceof AuditLogEntry, 'the emitted argument was not an AuditLogEntry')

  return { entry, emit, context }
}

describe('the audit log dispatch', () => {
  it('AL1: emits the entry as a structure under guildAuditLogEntryCreate', () => {
    const { emit } = routeOne(entryPayload())

    assert.equal(emit.event, 'guildAuditLogEntryCreate')
    // The entry names its own guild, so it is emitted alone rather than as a (guildId, entry)
    // pair. A second argument here would mean the two spellings had diverged.
    assert.equal(emit.args.length, 1)
  })

  it('AL2: reaches who did what to whom without a lookup', () => {
    // The whole audience for this event. Each of these being a plain field is the feature.
    const { entry } = routeOne(entryPayload())

    assert.equal(entry.id, ENTRY_ID)
    assert.equal(entry.actionType, AuditLogEvent.MemberRoleUpdate)
    assert.equal(entry.userId, MOD_ID)
    assert.equal(entry.targetId, TARGET_ID)
    assert.equal(entry.reason, 'Raid cleanup')
  })

  it('AL3: takes the guild from the dispatch, which the resource does not carry', () => {
    const { entry } = routeOne(entryPayload())
    assert.equal(entry.guildId, GUILD_ID)
  })

  it('AL4: keeps a null actor and a null target null rather than dropping them', () => {
    // Discord uses null for "no single target" and for actions it attributes to nobody.
    // Turning either into undefined would make an unattributed action indistinguishable from
    // a field this structure forgot.
    const { entry } = routeOne(entryPayload({ user_id: null, target_id: null }))

    assert.equal(entry.userId, null)
    assert.equal(entry.targetId, null)
  })

  it('AL5: reports an undocumented action type unchanged', () => {
    // Discord ships audit log actions before documenting them, and the numbering has gaps it
    // has filled before. Normalising an unknown number would discard the only evidence.
    const { entry } = routeOne(entryPayload({ action_type: 9_999 }))
    assert.equal(entry.actionType, 9_999)
  })

  it('AL6: dates the action from its snowflake', () => {
    const { entry } = routeOne(entryPayload())

    assert.equal(entry.createdTimestamp, ENTRY_CREATED)
    assert.equal(entry.createdAt.getTime(), ENTRY_CREATED)
  })

  it('AL7: caches nothing, with every scope switched on', () => {
    // An audit log is an append-only stream. A scope for it would grow without bound and
    // answer no lookup, so the handler must write to none of them.
    const { context } = routeOne(entryPayload())

    const written = [...context.cache.stores].filter((store) => store.size > 0)
    assert.deepEqual(
      written.map((store) => store.scope),
      [],
      'an audit log entry reached the cache',
    )
  })

  it('AL8: treats a replayed dispatch exactly as a fresh one', () => {
    // A resume replays the tail of the stream. Nothing here is stateful, so the only correct
    // behaviour is to build and emit again — and, in particular, still cache nothing.
    const { router, context, emitted } = harness()
    const payload = dispatch('GUILD_AUDIT_LOG_ENTRY_CREATE', entryPayload())

    router.route(payload, shard, false)
    router.route(payload, shard, true)

    assert.equal(typed(emitted).length, 2)
    assert.deepEqual(
      [...context.cache.stores].filter((store) => store.size > 0),
      [],
    )
  })
})

describe('the changes array', () => {
  it('AL9: converts the change envelope to camelCase', () => {
    // `old_value` and `new_value` are read by every consumer of every change, so leaving them
    // on the wire spelling would put snake_case in user code — the one thing the conversion
    // rule exists to prevent.
    const { entry } = routeOne(
      entryPayload({ changes: [{ key: 'name', old_value: 'nelly', new_value: 'nel' }] }),
    )

    assert.ok(entry.changes !== undefined)
    assert.deepEqual([...entry.changes], [{ key: 'name', oldValue: 'nelly', newValue: 'nel' }])
  })

  it('AL10: leaves the values themselves alone, by reference', () => {
    // The value's type is decided by `key` — here an array of partial roles, elsewhere a
    // permission overwrite — so nothing can convert it faithfully and nothing tries. The
    // identity check is the point: a copy would mean something walked it.
    const roles = [{ id: '4', name: 'Muted' }]
    const { entry } = routeOne(entryPayload({ changes: [{ key: '$add', new_value: roles }] }))

    assert.ok(entry.changes !== undefined)
    const [change] = entry.changes
    assert.ok(change !== undefined)
    assert.equal(change.key, '$add')
    assert.equal(change.newValue, roles, 'the value was copied rather than held')
  })

  it('AL11: keeps "the payload did not send this" distinguishable', () => {
    // Presence carries meaning: new_value without old_value means the property was null
    // before. Both properties are always defined, so `in` cannot answer that — but JSON has no
    // undefined to send, so `=== undefined` answers exactly what `in` would have on the wire.
    const { entry } = routeOne(
      entryPayload({ changes: [{ key: 'nick', new_value: 'muted user' }] }),
    )

    assert.ok(entry.changes !== undefined)
    const [change] = entry.changes
    assert.ok(change !== undefined)
    assert.equal(change.oldValue, undefined)
    assert.ok('oldValue' in change, 'the absent value was omitted rather than left undefined')
  })

  it('AL12: reports no changes as undefined rather than an empty array', () => {
    // Discord omits the array for actions that record no field-level change — a kick, a ban,
    // a prune — and never sends it empty, so undefined is the whole of "nothing here".
    const { entry } = routeOne(
      without(entryPayload({ action_type: AuditLogEvent.MemberKick }), 'changes'),
    )

    assert.equal(entry.changes, undefined)
    // Still a property, so the object has one shape whether or not the payload carried it.
    assert.ok('changes' in entry)
  })
})

describe('the options grab-bag', () => {
  it('AL13: holds options by reference, unconverted', () => {
    // Deliberate, and the reason is drift: Discord grows this bag whenever it ships an action
    // needing a new field, and a hand-maintained camelCase copy would silently drop whatever
    // it added this morning. Identity is what proves nothing was rebuilt.
    const options = { delete_member_days: '7', members_removed: '13' }
    const payload = entryPayload({ action_type: AuditLogEvent.MemberPrune, options })

    const { entry } = routeOne(payload)

    // `assert.equal` is an assertion signature, so it narrows `options` away from undefined
    // for the reads below — no redundant guard needed.
    assert.equal(entry.options, options, 'options were rebuilt rather than mirrored')
    assert.equal(entry.options.delete_member_days, '7')
    // Counts stay decimal strings, because that is what Discord sends. Parsing them here would
    // be an invention with no way back to what arrived.
    assert.equal(typeof entry.options.members_removed, 'string')
  })

  it('AL14: reports absent options as undefined, keeping the property', () => {
    const { entry } = routeOne(without(entryPayload(), 'options'))

    assert.equal(entry.options, undefined)
    assert.ok('options' in entry)
  })
})

describe('the structure on its own', () => {
  it('AL15: takes the guild as an argument, not from the payload', () => {
    // The reason `guildId` is a constructor parameter at all: the resource has no guild_id on
    // it, only the dispatch does. Building one from a bare entry must still produce a usable
    // structure — the same contract `Role` has.
    const bare = without(entryPayload(), 'guild_id')
    const entry = new AuditLogEntry(bare as never, '42', undefined)

    assert.equal(entry.guildId, '42')
    assert.equal(entry.id, ENTRY_ID)
  })

  it('AL16: carries the client it was built with', () => {
    const client = { marker: true }
    const entry = new AuditLogEntry(entryPayload() as never, GUILD_ID, client)

    assert.equal(entry.client, client)
  })

  it('AL17: has no reason when the acting app supplied none', () => {
    // The common case — actions taken in the Discord client carry no reason — so a missing
    // reason must not read as a missing field.
    const payload = without(entryPayload(), 'reason')
    const entry = new AuditLogEntry(payload as never, GUILD_ID, undefined)

    assert.equal(entry.reason, undefined)
    assert.ok('reason' in entry)
  })
})
