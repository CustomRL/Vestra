import type { ISO8601Timestamp, Snowflake } from '../globals.js'
import type {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventRecurrenceRuleFrequency,
  GuildScheduledEventRecurrenceRuleMonth,
  GuildScheduledEventRecurrenceRuleWeekday,
  GuildScheduledEventStatus,
} from '../enums/scheduled-event.js'
import type { APIGuildMember } from './member.js'
import type { APIUser } from './user.js'

/**
 * An event scheduled in a guild.
 *
 * @remarks
 * `entity_type` decides which of the location fields are populated, and Discord enforces
 * the combination rather than leaving it to convention:
 *
 * - `StageInstance` and `Voice` events carry a non-null `channel_id` and a null
 *   `entity_metadata`.
 * - `External` events carry a null `channel_id`, an `entity_metadata` with a `location`,
 *   and a non-null `scheduled_end_time`.
 *
 * The type system cannot express that split without splitting the interface, so check
 * `entity_type` before dereferencing `channel_id` or `entity_metadata.location`.
 */
export interface APIGuildScheduledEvent {
  /** The event's ID. */
  id: Snowflake
  /** The ID of the guild the event belongs to. */
  guild_id: Snowflake
  /** The ID of the channel the event is hosted in, or `null` for an external event. */
  channel_id: Snowflake | null
  /**
   * The ID of the user who created the event.
   *
   * @remarks
   * `null` on events created before 25 October 2021, when Discord started recording the
   * creator. Those events also omit `creator` entirely.
   */
  creator_id?: Snowflake | null
  /** The event's name, 1-100 characters. */
  name: string
  /** The event's description, 1-1000 characters. */
  description?: string | null
  /** When the event starts. */
  scheduled_start_time: ISO8601Timestamp
  /**
   * When the event ends.
   *
   * @remarks
   * Required on external events, since nothing else can tell Discord when they finish.
   * Stage and voice events usually leave this `null` and end when the channel empties.
   */
  scheduled_end_time: ISO8601Timestamp | null
  /** Who can see the event. */
  privacy_level: GuildScheduledEventPrivacyLevel
  /** How far along the event is. */
  status: GuildScheduledEventStatus
  /** Where the event takes place. */
  entity_type: GuildScheduledEventEntityType
  /** The ID of the entity associated with the event. */
  entity_id: Snowflake | null
  /**
   * Extra location data for the event.
   *
   * @remarks
   * `null` on stage and voice events, where `channel_id` already says where the event is.
   * External events always have this set with a `location`.
   */
  entity_metadata: APIGuildScheduledEventEntityMetadata | null
  /**
   * The user who created the event.
   *
   * @remarks
   * Absent on events created before 25 October 2021. See `creator_id`.
   */
  creator?: APIUser
  /**
   * How many users have subscribed to the event.
   *
   * @remarks
   * Only sent when the request asked for it with `with_user_count`. It is never present
   * on gateway payloads, so a bot tracking subscriber counts has to maintain them from
   * `GUILD_SCHEDULED_EVENT_USER_ADD` and `GUILD_SCHEDULED_EVENT_USER_REMOVE`.
   */
  user_count?: number
  /** The hash of the event's cover image. */
  image?: string | null
  /** How often the event repeats, or `null` if it happens once. */
  recurrence_rule: APIGuildScheduledEventRecurrenceRule | null
}

/**
 * Location data for an event that is not tied to a channel.
 */
export interface APIGuildScheduledEventEntityMetadata {
  /**
   * Where the event happens, 1-100 characters.
   *
   * @remarks
   * Free text, not a structured address or a URL. Required on external events; it is
   * marked optional only because a stage or voice event can carry an entity metadata
   * object with no fields in it at all.
   */
  location?: string
}

/**
 * How often a scheduled event repeats.
 *
 * @remarks
 * A deliberately narrow subset of the iCalendar recurrence rule, constrained by what the
 * Discord client can display. The restrictions are not expressible in the type system:
 *
 * - `by_weekday`, `by_n_weekday`, and the pair `by_month` with `by_month_day` are
 *   mutually exclusive; at most one of the three is non-null.
 * - `by_weekday` is only valid for `Daily` and `Weekly` events, and on a `Weekly` event
 *   it may hold exactly one day. On a `Daily` event it must be one of a fixed set of
 *   weekday runs, not an arbitrary selection.
 * - `by_n_weekday` is only valid for `Monthly` events and may hold exactly one entry.
 * - `by_month` and `by_month_day` are only valid for `Yearly` events, must both be
 *   supplied, and must both hold exactly one entry.
 * - `interval` may only be something other than `1` when `frequency` is `Weekly`, where
 *   `2` gives an every-other-week event.
 *
 * `end`, `by_year_day` and `count` are returned but cannot be set by an application.
 */
export interface APIGuildScheduledEventRecurrenceRule {
  /** When the recurrence interval starts. */
  start: ISO8601Timestamp
  /** When the recurrence interval stops, or `null` if it does not. */
  end: ISO8601Timestamp | null
  /** The unit `interval` is counted in. */
  frequency: GuildScheduledEventRecurrenceRuleFrequency
  /**
   * How many `frequency` units pass between occurrences.
   *
   * @remarks
   * A `Weekly` frequency with an `interval` of `2` is an every-other-week event.
   */
  interval: number
  /** The days of the week the event recurs on. */
  by_weekday: GuildScheduledEventRecurrenceRuleWeekday[] | null
  /** The nth weekday of the month the event recurs on. */
  by_n_weekday: APIGuildScheduledEventRecurrenceRuleNWeekday[] | null
  /** The months the event recurs in. */
  by_month: GuildScheduledEventRecurrenceRuleMonth[] | null
  /** The days of the month the event recurs on. */
  by_month_day: number[] | null
  /** The days of the year the event recurs on, 1-364. */
  by_year_day: number[] | null
  /** How many times the event may recur before it stops, or `null` for no limit. */
  count: number | null
}

/**
 * A specific weekday within a specific week of the month.
 */
export interface APIGuildScheduledEventRecurrenceRuleNWeekday {
  /** Which week of the month, 1-5. */
  n: number
  /** Which day of that week. */
  day: GuildScheduledEventRecurrenceRuleWeekday
}

/**
 * A user subscribed to a scheduled event.
 *
 * @remarks
 * This is the REST shape, returned by the endpoint listing an event's subscribers. The
 * `GUILD_SCHEDULED_EVENT_USER_ADD` and `GUILD_SCHEDULED_EVENT_USER_REMOVE` gateway events
 * carry a much smaller payload of bare IDs instead, and are not this type.
 */
export interface APIGuildScheduledEventUser {
  /** The ID of the event the user subscribed to. */
  guild_scheduled_event_id: Snowflake
  /**
   * The ID of the subscribed user.
   *
   * @remarks
   * Subscribers are always returned in ascending order of this ID, and the `before` and
   * `after` pagination parameters are compared against it rather than against the
   * subscription time.
   */
  user_id: Snowflake
  /** The subscribed user. */
  user: APIUser
  /**
   * The user's membership of the event's guild.
   *
   * @remarks
   * Only sent when the request asked for it with `with_member`, and then only if the
   * member data exists — a subscriber who has since left the guild has none.
   */
  member?: APIGuildMember
}
