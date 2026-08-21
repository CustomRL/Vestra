/**
 * Guild scheduled event and stage instance enumerations.
 */

/**
 * Who can see a scheduled event.
 *
 * @remarks
 * Only one level is documented, and it is numbered `2` rather than `0`. The value lines
 * up with {@link StageInstancePrivacyLevel}, but the two are separate enumerations and
 * neither constrains the other.
 */
export const GuildScheduledEventPrivacyLevel = {
  /** Only members of the guild the event belongs to can see it. */
  GuildOnly: 2,
} as const

/**
 * A scheduled event privacy level.
 */
export type GuildScheduledEventPrivacyLevel =
  (typeof GuildScheduledEventPrivacyLevel)[keyof typeof GuildScheduledEventPrivacyLevel]

/**
 * Where a scheduled event takes place.
 *
 * @remarks
 * This decides which of `channel_id`, `entity_metadata` and `scheduled_end_time` are
 * populated on the event: `StageInstance` and `Voice` require `channel_id` and leave
 * `entity_metadata` null, while `External` requires the reverse plus an end time.
 */
export const GuildScheduledEventEntityType = {
  /**
   * No hosting entity.
   *
   * @remarks
   * Present in Discord's OpenAPI specification but absent from the documentation, and
   * not creatable. Modelled so that narrowing on `entity_type` stays exhaustive if it
   * ever arrives on a payload.
   */
  None: 0,
  /** A stage channel, which gets a stage instance when the event goes live. */
  StageInstance: 1,
  /** A voice channel. */
  Voice: 2,
  /** Somewhere outside Discord, described by `entity_metadata.location`. */
  External: 3,
} as const

/**
 * A scheduled event entity type.
 */
export type GuildScheduledEventEntityType =
  (typeof GuildScheduledEventEntityType)[keyof typeof GuildScheduledEventEntityType]

/**
 * How far along a scheduled event is.
 *
 * @remarks
 * The only transitions Discord permits are `Scheduled` to `Active`, `Active` to
 * `Completed` and `Scheduled` to `Canceled`. `Completed` and `Canceled` are terminal —
 * an event in either state can never be updated again.
 */
export const GuildScheduledEventStatus = {
  /** Created but not started. */
  Scheduled: 1,
  /** Currently happening. */
  Active: 2,
  /** Finished. Terminal. */
  Completed: 3,
  /** Called off before it started. Terminal. */
  Canceled: 4,
} as const

/**
 * A scheduled event status.
 */
export type GuildScheduledEventStatus =
  (typeof GuildScheduledEventStatus)[keyof typeof GuildScheduledEventStatus]

/**
 * The unit a recurrence rule's interval is counted in.
 *
 * @remarks
 * Note the ordering: the values descend from the longest period to the shortest, so
 * `Yearly` is `0` and `Daily` is `3` rather than the other way round.
 *
 * Each frequency admits a different subset of the `by_*` fields — see
 * `APIGuildScheduledEventRecurrenceRule`.
 */
export const GuildScheduledEventRecurrenceRuleFrequency = {
  /** Once a year, on the date given by `by_month` and `by_month_day`. */
  Yearly: 0,
  /** Once a month, on the day given by `by_n_weekday`. */
  Monthly: 1,
  /** Once a week, on the day given by `by_weekday`. */
  Weekly: 2,
  /** Every day, or on the set of weekdays given by `by_weekday`. */
  Daily: 3,
} as const

/**
 * A recurrence rule frequency.
 */
export type GuildScheduledEventRecurrenceRuleFrequency =
  (typeof GuildScheduledEventRecurrenceRuleFrequency)[keyof typeof GuildScheduledEventRecurrenceRuleFrequency]

/**
 * A day of the week a recurrence rule can land on.
 *
 * @remarks
 * The week starts on Monday, following the iCalendar recurrence rules this is modelled
 * on. These values are not interchangeable with `Date.prototype.getDay`, which starts on
 * Sunday at `0` — converting between the two is off by one and wraps.
 */
export const GuildScheduledEventRecurrenceRuleWeekday = {
  /** Monday. */
  Monday: 0,
  /** Tuesday. */
  Tuesday: 1,
  /** Wednesday. */
  Wednesday: 2,
  /** Thursday. */
  Thursday: 3,
  /** Friday. */
  Friday: 4,
  /** Saturday. */
  Saturday: 5,
  /** Sunday. */
  Sunday: 6,
} as const

/**
 * A recurrence rule weekday.
 */
export type GuildScheduledEventRecurrenceRuleWeekday =
  (typeof GuildScheduledEventRecurrenceRuleWeekday)[keyof typeof GuildScheduledEventRecurrenceRuleWeekday]

/**
 * A month a recurrence rule can land on.
 *
 * @remarks
 * One-based, unlike `Date.prototype.getMonth`.
 */
export const GuildScheduledEventRecurrenceRuleMonth = {
  /** January. */
  January: 1,
  /** February. */
  February: 2,
  /** March. */
  March: 3,
  /** April. */
  April: 4,
  /** May. */
  May: 5,
  /** June. */
  June: 6,
  /** July. */
  July: 7,
  /** August. */
  August: 8,
  /** September. */
  September: 9,
  /** October. */
  October: 10,
  /** November. */
  November: 11,
  /** December. */
  December: 12,
} as const

/**
 * A recurrence rule month.
 */
export type GuildScheduledEventRecurrenceRuleMonth =
  (typeof GuildScheduledEventRecurrenceRuleMonth)[keyof typeof GuildScheduledEventRecurrenceRuleMonth]

/**
 * Who can see a stage instance.
 *
 * @remarks
 * Numerically distinct from {@link GuildScheduledEventPrivacyLevel} despite sharing the
 * `GuildOnly: 2` member — the two are separate enumerations and should not be mixed.
 */
export const StageInstancePrivacyLevel = {
  /**
   * Visible to everybody, including outside the guild.
   *
   * @deprecated Discord marks this level as deprecated. It is still a documented value
   * and still arrives on payloads, so it must be handled.
   */
  Public: 1,
  /** Visible only to members of the guild. */
  GuildOnly: 2,
} as const

/**
 * A stage instance privacy level.
 */
export type StageInstancePrivacyLevel =
  (typeof StageInstancePrivacyLevel)[keyof typeof StageInstancePrivacyLevel]

/**
 * A user's answer to a scheduled event invitation.
 *
 * @remarks
 * Only two values, and neither means "attending". Discord tracks interest rather than
 * attendance, so a bot cannot learn from this who actually turned up.
 */
export const GuildScheduledEventUserResponse = {
  /** The user is not interested. */
  Uninterested: 0,
  /** The user is interested. */
  Interested: 1,
} as const

/**
 * A scheduled event RSVP.
 */
export type GuildScheduledEventUserResponse =
  (typeof GuildScheduledEventUserResponse)[keyof typeof GuildScheduledEventUserResponse]
