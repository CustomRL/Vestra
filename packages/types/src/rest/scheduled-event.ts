import type { ISO8601Timestamp, Snowflake } from '../globals.js'
import type {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
} from '../enums/scheduled-event.js'
import type {
  APIGuildScheduledEvent,
  APIGuildScheduledEventEntityMetadata,
  APIGuildScheduledEventRecurrenceRule,
  APIGuildScheduledEventUser,
} from '../payloads/scheduled-event.js'

/**
 * Guild scheduled event bodies, queries and results.
 *
 * @remarks
 * **Which fields are required depends on `entity_type`, and nothing in the type says so.**
 * A `StageInstance` or `Voice` event needs `channel_id` and no `entity_metadata`; an
 * `External` event needs `entity_metadata.location` and `scheduled_end_time` and must not
 * carry `channel_id`. Expressing that as a discriminated union would give three creation
 * bodies whose shared fields drift, so it is one body with the rule written down instead.
 *
 * **`status` is a state machine, not a field.** `Scheduled` may become `Active` or
 * `Cancelled`; `Active` may only become `Completed`. Every other transition is a 400, and a
 * completed or cancelled event can never move again.
 */

/**
 * `GET /guilds/{guild.id}/scheduled-events`
 */
export interface RESTGetAPIGuildScheduledEventsQuery {
  /** Whether to include `user_count` on each event. */
  with_user_count?: boolean
}

/** The result of `GET /guilds/{guild.id}/scheduled-events`. */
export type RESTGetAPIGuildScheduledEventsResult = APIGuildScheduledEvent[]

/**
 * `GET /guilds/{guild.id}/scheduled-events/{event.id}`
 */
export interface RESTGetAPIGuildScheduledEventQuery {
  /** Whether to include `user_count`. */
  with_user_count?: boolean
}

/** The result of `GET /guilds/{guild.id}/scheduled-events/{event.id}`. */
export type RESTGetAPIGuildScheduledEventResult = APIGuildScheduledEvent

/**
 * `POST /guilds/{guild.id}/scheduled-events`
 */
export interface RESTPostAPIGuildScheduledEventJSONBody {
  /** The stage or voice channel. Required for those types, forbidden for `External`. */
  channel_id?: Snowflake | null
  /** Where an `External` event happens. Required for that type. */
  entity_metadata?: APIGuildScheduledEventEntityMetadata
  /** The event's name. */
  name: string
  /** Who can see it. Only `GuildOnly` exists. */
  privacy_level: GuildScheduledEventPrivacyLevel
  /** When it starts. */
  scheduled_start_time: ISO8601Timestamp
  /** When it ends. Required for an `External` event. */
  scheduled_end_time?: ISO8601Timestamp
  /** The description. */
  description?: string
  /** Where it takes place. */
  entity_type: GuildScheduledEventEntityType
  /** A cover image, as a data URI. */
  image?: string
  /** How often it repeats. */
  recurrence_rule?: APIGuildScheduledEventRecurrenceRule | null
}

/** The result of `POST /guilds/{guild.id}/scheduled-events`. */
export type RESTPostAPIGuildScheduledEventResult = APIGuildScheduledEvent

/**
 * `PATCH /guilds/{guild.id}/scheduled-events/{event.id}`
 *
 * @remarks
 * `status` is here and not on the create body, because an event is always created
 * `Scheduled` — starting or cancelling one is an edit. Moving an `External` event to a
 * channel type also requires clearing `entity_metadata` in the same request, and the reverse
 * requires setting it; the two halves are not independently valid.
 */
export interface RESTPatchAPIGuildScheduledEventJSONBody {
  /** A new channel, or `null` when moving to an `External` event. */
  channel_id?: Snowflake | null
  /** New location data, or `null` when moving away from an `External` event. */
  entity_metadata?: APIGuildScheduledEventEntityMetadata | null
  /** A new name. */
  name?: string
  /** A new privacy level. */
  privacy_level?: GuildScheduledEventPrivacyLevel
  /** A new start time. */
  scheduled_start_time?: ISO8601Timestamp
  /** A new end time. */
  scheduled_end_time?: ISO8601Timestamp
  /** A new description, or `null` to clear it. */
  description?: string | null
  /** A new entity type. */
  entity_type?: GuildScheduledEventEntityType
  /** The next state. Only some transitions are legal — see this module's remarks. */
  status?: GuildScheduledEventStatus
  /** A new cover image as a data URI, or `null` to remove it. */
  image?: string | null
  /** A new recurrence rule, or `null` to make the event happen once. */
  recurrence_rule?: APIGuildScheduledEventRecurrenceRule | null
}

/** The result of `PATCH /guilds/{guild.id}/scheduled-events/{event.id}`. */
export type RESTPatchAPIGuildScheduledEventResult = APIGuildScheduledEvent

/**
 * `GET /guilds/{guild.id}/scheduled-events/{event.id}/users`
 *
 * @remarks
 * `before` and `after` are user IDs and page in opposite directions, and passing both means
 * `before` wins. `with_member` is what turns a bare user into somebody whose nickname and
 * roles are readable without a second request each.
 */
export interface RESTGetAPIGuildScheduledEventUsersQuery {
  /** How many, from 1 to 100. Defaults to 100. */
  limit?: number
  /** Whether to include each subscriber's guild member object. */
  with_member?: boolean
  /** Users before this ID. */
  before?: Snowflake
  /** Users after this ID. */
  after?: Snowflake
}

/** The result of `GET /guilds/{guild.id}/scheduled-events/{event.id}/users`. */
export type RESTGetAPIGuildScheduledEventUsersResult = APIGuildScheduledEventUser[]
