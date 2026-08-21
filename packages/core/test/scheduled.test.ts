import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import {
  GatewayOpcodes,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventRecurrenceRuleFrequency,
  GuildScheduledEventRecurrenceRuleWeekday,
  GuildScheduledEventStatus,
  type APIGuildScheduledEvent,
  type APIGuildScheduledEventEntityMetadata,
  type APIGuildScheduledEventException,
  type APIGuildScheduledEventRecurrenceRule,
  type APIUser,
  type GatewayDispatchPayload,
} from '@vestra/types'
import {
  CacheRegistry,
  EventRouter,
  User,
  type CacheOptions,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'
// Not on the barrel yet — the registry wiring is somebody else's commit. Both come from
// `dist` rather than `src` so `instanceof` compares the same class the handlers built.
import { GuildScheduledEvent } from '../dist/structures/GuildScheduledEvent.js'
import {
  guildScheduledEventCreate,
  guildScheduledEventDelete,
  guildScheduledEventUpdate,
  guildScheduledEventUserAdd,
  guildScheduledEventUserRemove,
} from '../dist/events/handlers/scheduled.js'

/** A stand-in client. The structure only ever hands it back, so its shape is irrelevant. */
const client = { name: 'test-client' }

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }

const GUILD_ID = '613425648685547541'
const CHANNEL_ID = '41771983423143936'
const EVENT_ID = '840647391636226060'
const CREATOR_ID = '80351110224678912'
const SUBSCRIBER_ID = '155117677105512449'

const CREATOR: APIUser = {
  id: CREATOR_ID,
  username: 'nelly',
  discriminator: '0',
  global_name: 'Nelly',
  avatar: null,
}

/**
 * Every field a `GUILD_SCHEDULED_EVENT_*` dispatch carries, all at once.
 *
 * @remarks
 * Exhaustive over the gateway shape on purpose: SE1 derives what the structure must mirror
 * from this object's own keys, so a fixture missing a field would quietly narrow what is
 * checked. `user_count` and `user_rsvp` are absent because the gateway never sends them —
 * SE2 covers what happens when a REST-shaped payload carries them anyway.
 */
function eventPayload(extra: Partial<APIGuildScheduledEvent> = {}): APIGuildScheduledEvent {
  return {
    id: EVENT_ID,
    guild_id: GUILD_ID,
    channel_id: CHANNEL_ID,
    creator_id: CREATOR_ID,
    name: 'Release retro',
    description: 'What went wrong in 0.3',
    scheduled_start_time: '2026-09-01T17:00:00.000000+00:00',
    scheduled_end_time: null,
    privacy_level: GuildScheduledEventPrivacyLevel.GuildOnly,
    status: GuildScheduledEventStatus.Scheduled,
    entity_type: GuildScheduledEventEntityType.Voice,
    entity_id: null,
    entity_metadata: null,
    creator: CREATOR,
    image: 'a1b2c3',
    recurrence_rule: null,
    guild_scheduled_event_exceptions: [],
    ...extra,
  }
}

/** The mechanical rule the structure names its fields by. */
function toCamelCase(field: string): string {
  return field.replaceAll(/_(.)/g, (_match, next: string) => next.toUpperCase())
}

/**
 * Wire fields whose structure field is deliberately named something else.
 *
 * @remarks
 * Both are the timestamp suffix rule: the mechanical name is taken by the `Date` getter
 * beside it, which is what `Guild.joinedTimestamp` and `Invite.createdTimestamp` do.
 */
const RENAMED: Record<string, string> = {
  scheduled_start_time: 'scheduledStartTimestamp',
  scheduled_end_time: 'scheduledEndTimestamp',
}

/** What a structure built from `payload` must have as own properties. */
function expectedFields(payload: object): string[] {
  return Object.keys(payload)
    .map((field) => RENAMED[field] ?? toCamelCase(field))
    .sort()
}

/**
 * The payload with some fields left off entirely.
 *
 * @remarks
 * Absence is not the same as `null` here and the difference is the whole point of the patch
 * rule, so these fixtures build the field out rather than setting it to `undefined` — which
 * `Object.keys` would still report as present.
 */
function without(payload: APIGuildScheduledEvent, ...fields: string[]): APIGuildScheduledEvent {
  const kept = Object.entries(payload).filter(([field]) => !fields.includes(field))
  return Object.fromEntries(kept) as unknown as APIGuildScheduledEvent
}

describe('GuildScheduledEvent', () => {
  it('SE1: mirrors every field the dispatch carries and invents none', () => {
    // Own keys rather than the declared type, so a `declare`d field with no constructor
    // assignment fails here — the declaration alone emits nothing.
    const payload = eventPayload()
    assert.equal(Object.keys(payload).length, 17, 'the fixture must stay exhaustive')

    const event = new GuildScheduledEvent(payload, client)
    assert.deepEqual(Object.keys(event).sort(), expectedFields(payload))
  })

  it('SE2: mirrors neither user_count nor user_rsvp, which the gateway never sends', () => {
    // Both are REST-only: `user_count` needs `with_user_count`, `user_rsvp` needs an endpoint
    // with a user context. A field that is `undefined` on every object the library can build
    // reads as "nobody is interested" rather than "nobody asked", which is the Guild.nsfw
    // reasoning. Mirroring one later is additive; un-mirroring it would not be.
    const event = new GuildScheduledEvent(eventPayload({ user_count: 42, user_rsvp: null }), client)

    assert.deepEqual(Object.keys(event).sort(), expectedFields(eventPayload()))
    assert.equal('userCount' in event, false, 'user_count must not be mirrored')
    assert.equal('userRsvp' in event, false, 'user_rsvp must not be mirrored')
  })

  it('SE3: carries the payload values through unchanged', () => {
    const event = new GuildScheduledEvent(
      eventPayload({
        entity_type: GuildScheduledEventEntityType.External,
        channel_id: null,
        entity_id: '900000000000000000',
        entity_metadata: { location: 'The Sulaco' },
        scheduled_end_time: '2026-09-01T19:00:00.000000+00:00',
      }),
      client,
    )

    assert.equal(event.id, EVENT_ID)
    assert.equal(event.guildId, GUILD_ID)
    assert.equal(event.channelId, null)
    assert.equal(event.creatorId, CREATOR_ID)
    assert.equal(event.name, 'Release retro')
    assert.equal(event.description, 'What went wrong in 0.3')
    assert.equal(event.scheduledStartTimestamp, '2026-09-01T17:00:00.000000+00:00')
    assert.equal(event.scheduledEndTimestamp, '2026-09-01T19:00:00.000000+00:00')
    assert.equal(event.privacyLevel, GuildScheduledEventPrivacyLevel.GuildOnly)
    assert.equal(event.status, GuildScheduledEventStatus.Scheduled)
    assert.equal(event.entityType, GuildScheduledEventEntityType.External)
    assert.equal(event.entityId, '900000000000000000')
    assert.deepEqual(event.entityMetadata, { location: 'The Sulaco' })
    assert.equal(event.image, 'a1b2c3')
    assert.equal(event.client, client)
  })

  it('SE4: keeps the timestamps as raw strings and reads them back as dates', () => {
    // The naming rule, and the no-eager-parsing rule with it: the field is the string Discord
    // sent, the getter allocates. A constructor that parsed on the way in would fail the first
    // assertion, and a getter that handed the string back would fail the second.
    const event = new GuildScheduledEvent(
      eventPayload({ scheduled_end_time: '2026-09-01T19:00:00.000000+00:00' }),
      client,
    )

    assert.equal(typeof event.scheduledStartTimestamp, 'string')
    assert.equal(event.scheduledStartAt.getTime(), Date.parse('2026-09-01T17:00:00Z'))
    assert.equal(event.scheduledEndAt?.getTime(), Date.parse('2026-09-01T19:00:00Z'))
  })

  it('SE5: reports an event with no end time as a null date rather than the epoch', () => {
    // `new Date(null)` is the epoch, not an error, so getting this wrong produces a stage
    // event that appears to have finished in 1970.
    const event = new GuildScheduledEvent(eventPayload({ scheduled_end_time: null }), client)

    assert.equal(event.scheduledEndTimestamp, null)
    assert.equal(event.scheduledEndAt, null)
  })

  it('SE6: dates the event from its own snowflake', () => {
    const event = new GuildScheduledEvent(eventPayload(), client)

    assert.equal(event.createdTimestamp, 1620496356639)
    assert.equal(event.createdAt.getTime(), event.createdTimestamp)
  })

  it('SE7: builds the creator as a User', () => {
    const event = new GuildScheduledEvent(eventPayload(), client)

    assert.ok(event.creator instanceof User, 'the creator must be a User')
    assert.equal(event.creator.id, CREATOR_ID)
    assert.equal(event.creator.username, 'nelly')
    assert.equal(event.creator.client, client)
  })

  it('SE8: keeps the same shape when the optional fields are absent', () => {
    // The hot-path rule: every field assigned unconditionally, so an event created before
    // Discord recorded creators is the same hidden class as one created yesterday. A
    // conditional assignment in the constructor passes SE1 and fails here.
    const trimmed = without(eventPayload(), 'creator_id', 'description', 'creator', 'image')
    assert.equal(Object.keys(trimmed).length, 13, 'the trimmed payload must actually be smaller')

    const event = new GuildScheduledEvent(trimmed, client)

    assert.deepEqual(Object.keys(event).sort(), expectedFields(eventPayload()))
    assert.equal(event.creatorId, undefined)
    assert.equal(event.description, undefined)
    assert.equal(event.creator, undefined)
    assert.equal(event.image, undefined)
  })

  it('SE9: holds the nested payload objects by reference rather than converting them', () => {
    // §4.15: they came out of JSON.parse moments ago and nothing else aliases them. The
    // consequence a consumer sees is that their fields stay snake_case, which is the same
    // trade Message.attachments makes — asserted here so the decision is visible rather than
    // discovered.
    const metadata: APIGuildScheduledEventEntityMetadata = { location: 'The Sulaco' }
    const rule: APIGuildScheduledEventRecurrenceRule = {
      start: '2026-09-01T17:00:00.000000+00:00',
      end: null,
      frequency: GuildScheduledEventRecurrenceRuleFrequency.Weekly,
      interval: 2,
      by_weekday: [GuildScheduledEventRecurrenceRuleWeekday.Tuesday],
      by_n_weekday: null,
      by_month: null,
      by_month_day: null,
      by_year_day: null,
      count: null,
    }
    const exceptions: APIGuildScheduledEventException[] = [
      {
        event_id: EVENT_ID,
        event_exception_id: '900000000000000001',
        scheduled_start_time: null,
        scheduled_end_time: null,
        is_canceled: true,
      },
    ]

    const event = new GuildScheduledEvent(
      eventPayload({
        entity_metadata: metadata,
        recurrence_rule: rule,
        guild_scheduled_event_exceptions: exceptions,
      }),
      client,
    )

    assert.equal(event.entityMetadata, metadata)
    assert.equal(event.recurrenceRule, rule)
    assert.equal(event.guildScheduledEventExceptions, exceptions)
    // Read back through the structure, `snake_case` and all: that spelling is the visible
    // consequence of holding the payload object rather than converting it.
    assert.equal(
      event.recurrenceRule.by_weekday?.[0],
      GuildScheduledEventRecurrenceRuleWeekday.Tuesday,
    )
  })
})

describe('GuildScheduledEvent.patch', () => {
  it('SE10: applies a whole update, because the dispatch carries a whole event', () => {
    // The opposite of Message.patch and GuildMember.patch. `GUILD_SCHEDULED_EVENT_UPDATE`
    // sends the complete event, so skipping a field that arrived would keep a stale status on
    // the very update that cancelled the event.
    const event = new GuildScheduledEvent(eventPayload(), client)

    event.patch(
      eventPayload({
        name: 'Release retro (moved)',
        channel_id: null,
        status: GuildScheduledEventStatus.Canceled,
        entity_type: GuildScheduledEventEntityType.External,
        entity_id: '900000000000000000',
        entity_metadata: { location: 'The Sulaco' },
        scheduled_start_time: '2026-09-02T17:00:00.000000+00:00',
        scheduled_end_time: '2026-09-02T19:00:00.000000+00:00',
      }),
    )

    assert.equal(event.name, 'Release retro (moved)')
    assert.equal(event.channelId, null)
    assert.equal(event.status, GuildScheduledEventStatus.Canceled)
    assert.equal(event.entityType, GuildScheduledEventEntityType.External)
    assert.equal(event.entityId, '900000000000000000')
    assert.deepEqual(event.entityMetadata, { location: 'The Sulaco' })
    assert.equal(event.scheduledStartTimestamp, '2026-09-02T17:00:00.000000+00:00')
    assert.equal(event.scheduledEndTimestamp, '2026-09-02T19:00:00.000000+00:00')
    // The identity fields are not part of an update.
    assert.equal(event.id, EVENT_ID)
    assert.equal(event.guildId, GUILD_ID)
  })

  it('SE11: clears a field the update nulled rather than keeping the old value', () => {
    // Discord clears by sending null, not by omitting. A patch that guarded on "not null"
    // would leave an end time on an event whose end was removed.
    const event = new GuildScheduledEvent(
      eventPayload({
        scheduled_end_time: '2026-09-01T19:00:00.000000+00:00',
        description: 'What went wrong in 0.3',
      }),
      client,
    )

    event.patch(eventPayload({ scheduled_end_time: null, description: null, image: null }))

    assert.equal(event.scheduledEndTimestamp, null)
    assert.equal(event.description, null)
    assert.equal(event.image, null)
  })

  it('SE12: leaves the fields Discord may omit alone rather than blanking them', () => {
    // The four fields a payload can leave off entirely. Copying an absent one would blank the
    // creator of every event created before 25 October 2021 on its first update.
    const event = new GuildScheduledEvent(eventPayload(), client)

    event.patch(without(eventPayload(), 'creator_id', 'description', 'creator', 'image'))

    assert.equal(event.creatorId, CREATOR_ID, 'an absent creator_id must not blank it')
    assert.equal(
      event.description,
      'What went wrong in 0.3',
      'an absent description must not blank',
    )
    assert.equal(event.image, 'a1b2c3', 'an absent image must not blank it')
    assert.ok(event.creator instanceof User, 'an absent creator must not blank it')
  })

  it('SE13: patches a held creator rather than replacing it', () => {
    // A consumer keeping their own Map of events holds `event.creator` too. Replacing the
    // object would leave them reading a user that stops being updated.
    const event = new GuildScheduledEvent(eventPayload(), client)
    const held = event.creator

    event.patch(eventPayload({ creator: { ...CREATOR, username: 'ripley' } }))

    assert.equal(event.creator, held, 'the creator object must be the same one')
    assert.equal(event.creator?.username, 'ripley', 'and it must carry the new name')
  })

  it('SE14: builds a creator that arrives for the first time', () => {
    const event = new GuildScheduledEvent(without(eventPayload(), 'creator'), client)
    // Read into a local: asserting on `event.creator` itself narrows it to `undefined` for the
    // rest of the test, and the patch below is exactly what that narrowing would hide.
    const before = event.creator
    assert.equal(before, undefined, 'the fixture must start without a creator')

    event.patch(eventPayload())

    assert.ok(event.creator instanceof User, 'a creator that arrives later must be built')
    assert.equal(event.creator.id, CREATOR_ID)
  })
})

/** Every scope on, so a write to any of them is visible. */
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

function harness(options: CacheOptions = ALL_SCOPES): {
  router: EventRouter
  context: EventContext
  emitted: { event: string; args: unknown[] }[]
} {
  const emitted: { event: string; args: unknown[] }[] = []
  const context: EventContext = {
    cache: new CacheRegistry(options),
    rest: undefined as never,
    user: undefined,
    emit: (event: string, ...args: unknown[]) => {
      emitted.push({ event, args })
      return true
    },
    listenerCount: () => 0,
  } as EventContext

  // The registry is somebody else's commit, so this router holds exactly the five handlers
  // under test rather than `handlers`.
  const router = new EventRouter(context, [
    guildScheduledEventCreate,
    guildScheduledEventUpdate,
    guildScheduledEventDelete,
    guildScheduledEventUserAdd,
    guildScheduledEventUserRemove,
  ])

  return { router, context, emitted }
}

function dispatch(t: string, d: unknown): GatewayDispatchPayload {
  return { op: GatewayOpcodes.Dispatch, t, s: 1, d } as GatewayDispatchPayload
}

function userPayload(): unknown {
  return {
    guild_scheduled_event_id: EVENT_ID,
    user_id: SUBSCRIBER_ID,
    guild_id: GUILD_ID,
  }
}

describe('scheduled event handlers', () => {
  it('SH1: emits the new event as a structure', () => {
    const { router, emitted } = harness()
    router.route(dispatch('GUILD_SCHEDULED_EVENT_CREATE', eventPayload()), shard, false)

    const last = emitted.at(-1)
    assert.equal(last?.event, 'guildScheduledEventCreate')
    const event = last.args[0]
    assert.ok(event instanceof GuildScheduledEvent)
    assert.equal(event.id, EVENT_ID)
    assert.equal(event.guildId, GUILD_ID)
    assert.equal(event.name, 'Release retro')
  })

  it('SH2: emits the updated event, carrying the new status', () => {
    const { router, emitted } = harness()
    router.route(
      dispatch(
        'GUILD_SCHEDULED_EVENT_UPDATE',
        eventPayload({ status: GuildScheduledEventStatus.Active, name: 'Release retro (live)' }),
      ),
      shard,
      false,
    )

    const last = emitted.at(-1)
    assert.equal(last?.event, 'guildScheduledEventUpdate')
    const event = last.args[0]
    assert.ok(event instanceof GuildScheduledEvent)
    assert.equal(event.status, GuildScheduledEventStatus.Active)
    assert.equal(event.name, 'Release retro (live)')
  })

  it('SH3: emits the whole event on a delete, not just its ID', () => {
    // The delete dispatch carries the full object, so a listener gets the name and start time
    // of the event that was just removed. This is the half of the delete-handler rule
    // `channelDelete` cannot have — there the payload is a stub and only the cache can fill it
    // in. Emitting an ID here would throw away information that actually arrived.
    const { router, emitted } = harness()
    router.route(dispatch('GUILD_SCHEDULED_EVENT_DELETE', eventPayload()), shard, false)

    const last = emitted.at(-1)
    assert.equal(last?.event, 'guildScheduledEventDelete')
    const event = last.args[0]
    assert.ok(event instanceof GuildScheduledEvent, 'the delete must carry the structure')
    assert.equal(event.id, EVENT_ID)
    assert.equal(event.name, 'Release retro')
    assert.equal(event.scheduledStartTimestamp, '2026-09-01T17:00:00.000000+00:00')
  })

  it('SH4: emits three IDs on a subscription, in event-user-guild order', () => {
    // The dispatch carries nothing else — no user object, no member — and nothing is cached to
    // resolve them against, so the IDs are the event. The same reasoning as messageDelete.
    const { router, emitted } = harness()
    router.route(dispatch('GUILD_SCHEDULED_EVENT_USER_ADD', userPayload()), shard, false)

    const last = emitted.at(-1)
    assert.equal(last?.event, 'guildScheduledEventUserAdd')
    assert.deepEqual(last.args, [EVENT_ID, SUBSCRIBER_ID, GUILD_ID])
  })

  it('SH5: emits the same three IDs on an unsubscription, under its own event', () => {
    const { router, emitted } = harness()
    router.route(dispatch('GUILD_SCHEDULED_EVENT_USER_REMOVE', userPayload()), shard, false)

    const last = emitted.at(-1)
    assert.equal(last?.event, 'guildScheduledEventUserRemove')
    assert.deepEqual(last.args, [EVENT_ID, SUBSCRIBER_ID, GUILD_ID])
  })

  it('SH6: gives each dispatch its own event rather than one shared one', () => {
    // Five dispatches, five events. Registering a handler under the wrong dispatch name is the
    // failure `EventHandler.event` exists to catch, and this is what proves the five are wired
    // the way they are named.
    const { router, emitted } = harness()
    router.route(dispatch('GUILD_SCHEDULED_EVENT_CREATE', eventPayload()), shard, false)
    router.route(dispatch('GUILD_SCHEDULED_EVENT_UPDATE', eventPayload()), shard, false)
    router.route(dispatch('GUILD_SCHEDULED_EVENT_DELETE', eventPayload()), shard, false)
    router.route(dispatch('GUILD_SCHEDULED_EVENT_USER_ADD', userPayload()), shard, false)
    router.route(dispatch('GUILD_SCHEDULED_EVENT_USER_REMOVE', userPayload()), shard, false)

    // `raw` fires for every dispatch and is not what this is about.
    assert.deepEqual(
      emitted.map((entry) => entry.event).filter((event) => event !== 'raw'),
      [
        'guildScheduledEventCreate',
        'guildScheduledEventUpdate',
        'guildScheduledEventDelete',
        'guildScheduledEventUserAdd',
        'guildScheduledEventUserRemove',
      ],
    )
  })

  it('SH7: caches no scheduled event anywhere', () => {
    // There is no scheduledEvents scope. All three object-carrying dispatches send the whole
    // event, so a consumer that wants the live set can keep its own Map — the same position
    // StageInstance records.
    const { router, context } = harness()
    router.route(dispatch('GUILD_SCHEDULED_EVENT_CREATE', eventPayload()), shard, false)
    router.route(dispatch('GUILD_SCHEDULED_EVENT_UPDATE', eventPayload()), shard, false)
    router.route(dispatch('GUILD_SCHEDULED_EVENT_USER_ADD', userPayload()), shard, false)

    const filled = context.cache.stores
      .filter((store) => store.size > 0)
      .map((store) => store.scope)
    assert.deepEqual(filled, [], 'the scheduled event handlers must write to no scope')
  })
})
