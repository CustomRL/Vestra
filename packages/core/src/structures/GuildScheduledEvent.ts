import type {
  APIGuildScheduledEvent,
  APIGuildScheduledEventEntityMetadata,
  APIGuildScheduledEventException,
  APIGuildScheduledEventRecurrenceRule,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  ISO8601Timestamp,
  Snowflake,
} from '@vestra/types'
import { Base } from './Base.js'
import { snowflakeDate, snowflakeTimestamp } from './snowflake.js'
import { User } from './User.js'

/**
 * An event scheduled in a guild.
 *
 * @remarks
 * **`entityType` decides which location fields mean anything**, and Discord enforces the
 * combination rather than leaving it to convention: a `StageInstance` or `Voice` event has a
 * non-null {@link GuildScheduledEvent.channelId} and a null
 * {@link GuildScheduledEvent.entityMetadata}, while an `External` event has the reverse plus a
 * non-null {@link GuildScheduledEvent.scheduledEndTimestamp}. No type can express that split
 * without splitting the class, so check `entityType` before reading either.
 *
 * **Not cached, and there is no scheduledEvents scope.** All three of the object-carrying
 * dispatches — including the delete — send the whole event, so nothing here needs a cache to
 * be readable, which is the same reason {@link StageInstance} has no scope. A consumer that
 * wants the live set can keep its own `Map` keyed by `id` and feed it from the three events;
 * {@link GuildScheduledEvent.patch} exists so a reference held in one stays live.
 *
 * **Timestamp naming.** A raw ISO string carries a `Timestamp` suffix and the natural name is
 * the `Date` getter beside it: `scheduledStartTimestamp` is the string Discord sent,
 * `scheduledStartAt` allocates a `Date`. The same rule {@link Guild.joinedTimestamp} and
 * {@link GuildMember.joinedTimestamp} follow, applied to every ISO field rather than only the
 * ones that would collide.
 *
 * **The nested payload objects are held by reference, so their fields are `snake_case`** —
 * `entityMetadata`, `recurrenceRule` and `guildScheduledEventExceptions` are `API*` types
 * rather than converted ones. §4.15 holds arrays and nested objects by reference (they came
 * out of `JSON.parse` moments ago and nothing else aliases them) and §4.17's criterion ships
 * no structure for a shape with no identity, no route and no cache entry. The inconsistency
 * with the rest of the surface is real and recorded, and it is the same one
 * {@link Message.attachments} carries.
 *
 * **`user_count` and `user_rsvp` are not mirrored.** Neither ever arrives here. Discord sends
 * `user_count` only when a REST request asks for it with `with_user_count`, `user_rsvp` only
 * from an endpoint with a user context, and `@vestra/rest` has no scheduled-event routes — so
 * both would be `undefined` on every object this library can build, which reads as "this event
 * has nobody interested" rather than "nobody asked". A bot that needs the count maintains it
 * from `guildScheduledEventUserAdd` and `guildScheduledEventUserRemove`.
 */
export class GuildScheduledEvent<Client = unknown> extends Base<Client> {
  /** The event's ID. */
  declare readonly id: Snowflake
  /**
   * The guild the event belongs to.
   *
   * @remarks
   * Readonly because an event cannot move guilds; everything below it can change, which is
   * what a `GUILD_SCHEDULED_EVENT_UPDATE` carries.
   */
  declare readonly guildId: Snowflake
  /**
   * The channel the event is hosted in, or `null` for an external event.
   *
   * @remarks
   * `null` is not "unknown" — it is what an `External` event has, and reading it as a missing
   * channel is the trap {@link GuildScheduledEvent.entityType} exists to steer around.
   */
  declare channelId: Snowflake | null
  /**
   * Who created the event.
   *
   * @remarks
   * `null` on events created before 25 October 2021, when Discord started recording it, and
   * absent on a payload that never carried it at all.
   */
  declare creatorId: Snowflake | null | undefined
  /** The event's name. */
  declare name: string
  /** The event's description. */
  declare description: string | null | undefined
  /** When the event starts, as the raw ISO string. */
  declare scheduledStartTimestamp: ISO8601Timestamp
  /**
   * When the event ends, as the raw ISO string, or `null` if Discord was never told.
   *
   * @remarks
   * Required on an external event, since nothing else can tell Discord when it finishes. A
   * stage or voice event usually leaves this `null` and ends when the channel empties.
   */
  declare scheduledEndTimestamp: ISO8601Timestamp | null
  /** Who can see the event. */
  declare privacyLevel: GuildScheduledEventPrivacyLevel
  /**
   * How far along the event is.
   *
   * @remarks
   * `Completed` and `Canceled` are terminal — an event in either can never be updated again,
   * so an update carrying one is the last thing a listener will hear about it.
   */
  declare status: GuildScheduledEventStatus
  /** Where the event takes place. */
  declare entityType: GuildScheduledEventEntityType
  /** The ID of the entity hosting the event. */
  declare entityId: Snowflake | null
  /**
   * Extra location data, for an event that is not tied to a channel.
   *
   * @remarks
   * The payload object rather than a converted one, so its one field is `location`. `null` on
   * a stage or voice event, where {@link GuildScheduledEvent.channelId} already says where the
   * event is.
   */
  declare entityMetadata: APIGuildScheduledEventEntityMetadata | null
  /**
   * The user who created the event.
   *
   * @remarks
   * Absent on an event created before 25 October 2021, and on any payload Discord chose not to
   * put it on — {@link GuildScheduledEvent.creatorId} is the field that is usually there.
   */
  declare creator: User<Client> | undefined
  /**
   * The hash of the event's cover image.
   *
   * @remarks
   * A hash rather than a URL, and there is no `coverImageUrl()` yet: `cdn.ts` has no
   * `guild-events` route, and adding one is a change to the CDN module rather than to this
   * structure.
   */
  declare image: string | null | undefined
  /**
   * How often the event repeats, or `null` if it happens once.
   *
   * @remarks
   * The payload object, held by reference, so its fields are `snake_case`. Which of the `by_*`
   * fields may be set depends on `frequency` in ways the type system cannot express —
   * `APIGuildScheduledEventRecurrenceRule` documents the combinations.
   */
  declare recurrenceRule: APIGuildScheduledEventRecurrenceRule | null
  /**
   * The occurrences of a recurring event that depart from its recurrence rule.
   *
   * @remarks
   * Always sent, and empty for an event that does not recur. A recurrence rule alone does not
   * describe the schedule: one occurrence can be moved or cancelled without touching the rule,
   * and only these record that.
   *
   * Named mechanically after `guild_scheduled_event_exceptions` rather than shortened to
   * `exceptions`. The prefix is redundant on a class already called `GuildScheduledEvent`, but
   * §4.15 sets the renaming bar at "the mechanical result is ambiguous or collides", not at
   * "the mechanical result is ugly" — the same reason {@link StageInstance.guildScheduledEventId}
   * keeps its.
   */
  declare guildScheduledEventExceptions: readonly APIGuildScheduledEventException[]

  /**
   * @param data - The payload to mirror.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIGuildScheduledEvent, client: Client) {
    super(client)

    this.id = data.id
    this.guildId = data.guild_id
    this.channelId = data.channel_id
    this.creatorId = data.creator_id
    this.name = data.name
    this.description = data.description
    this.scheduledStartTimestamp = data.scheduled_start_time
    this.scheduledEndTimestamp = data.scheduled_end_time
    this.privacyLevel = data.privacy_level
    this.status = data.status
    this.entityType = data.entity_type
    this.entityId = data.entity_id
    this.entityMetadata = data.entity_metadata
    this.creator = data.creator === undefined ? undefined : new User(data.creator, client)
    this.image = data.image
    this.recurrenceRule = data.recurrence_rule
    this.guildScheduledEventExceptions = data.guild_scheduled_event_exceptions
  }

  /** When the event was created, in epoch milliseconds. */
  get createdTimestamp(): number {
    return snowflakeTimestamp(this.id)
  }

  /** When the event was created. Allocates. */
  get createdAt(): Date {
    return snowflakeDate(this.id)
  }

  /** When the event starts. Allocates. */
  get scheduledStartAt(): Date {
    return new Date(this.scheduledStartTimestamp)
  }

  /**
   * When the event ends, or `null` if Discord was never told. Allocates.
   *
   * @remarks
   * `null` for most stage and voice events, which end when the channel empties rather than at
   * an announced time. Only an external event is guaranteed to have one.
   */
  get scheduledEndAt(): Date | null {
    const raw = this.scheduledEndTimestamp
    return raw === null ? null : new Date(raw)
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   *
   * @remarks
   * **`GUILD_SCHEDULED_EVENT_UPDATE` carries a whole event, so this assigns unconditionally** —
   * unlike {@link Message.patch} and {@link GuildMember.patch}, whose dispatches carry only
   * what changed and which must therefore skip absent fields or turn an edit into data loss.
   * The rule is about what the dispatch sends, not about the method name: here a conditional
   * assignment would be the mistake, because it would keep a stale `status` on the update that
   * cancelled the event.
   *
   * The four fields Discord may leave off a payload entirely — `creator_id`, `description`,
   * `creator` and `image` — are the exception, and are left alone when absent rather than
   * blanked. Clearing one still works: Discord clears by sending `null`, which is not
   * `undefined`, so only genuine absence is skipped.
   *
   * A creator who arrives again is patched rather than replaced, so a consumer holding
   * `event.creator` keeps a live object.
   */
  patch(data: APIGuildScheduledEvent): void {
    this.channelId = data.channel_id
    if (data.creator_id !== undefined) this.creatorId = data.creator_id
    this.name = data.name
    if (data.description !== undefined) this.description = data.description
    this.scheduledStartTimestamp = data.scheduled_start_time
    this.scheduledEndTimestamp = data.scheduled_end_time
    this.privacyLevel = data.privacy_level
    this.status = data.status
    this.entityType = data.entity_type
    this.entityId = data.entity_id
    this.entityMetadata = data.entity_metadata
    if (data.creator !== undefined) {
      if (this.creator === undefined) {
        this.creator = new User(data.creator, this.client)
      } else {
        this.creator.patch(data.creator)
      }
    }
    if (data.image !== undefined) this.image = data.image
    this.recurrenceRule = data.recurrence_rule
    this.guildScheduledEventExceptions = data.guild_scheduled_event_exceptions
  }
}
