import type {
  APIGuildScheduledEvent,
  RESTGetAPIGuildScheduledEventQuery,
  RESTGetAPIGuildScheduledEventUsersQuery,
  RESTGetAPIGuildScheduledEventsQuery,
  RESTGetAPIGuildScheduledEventUsersResult,
  RESTPatchAPIGuildScheduledEventJSONBody,
  RESTPostAPIGuildScheduledEventJSONBody,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * Guild scheduled event endpoints.
 *
 * @remarks
 * The library mirrored the events and emitted all five of their dispatches, and could not
 * create one. A bot could announce an event it had no way to schedule.
 *
 * **Which fields are required depends on `entity_type`.** A stage or voice event needs
 * `channel_id` and no `entity_metadata`; an external event needs `entity_metadata.location`
 * and `scheduled_end_time` and must not carry `channel_id`. That is a runtime rule Discord
 * enforces and the type cannot, so it is written down rather than modelled — three creation
 * bodies whose shared fields drift is worse than one with the rule beside it.
 *
 * **Starting and cancelling are edits.** An event is always created `Scheduled`;
 * {@link ScheduledEventRoutes.edit} with a `status` is what moves it, and only some
 * transitions are legal — `Scheduled` to `Active` or `Cancelled`, `Active` to `Completed`,
 * and nothing out of the last two.
 *
 * **`user_count` is never on a gateway payload.** It arrives only when a request here asks
 * for it, so a bot tracking subscriber counts either polls or maintains them from the
 * `guildScheduledEventUserAdd` and `guildScheduledEventUserRemove` events.
 */
export class ScheduledEventRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Lists a guild's scheduled events.
   *
   * @param guildId - The guild.
   * @param query - Whether to include subscriber counts.
   * @param options - Request options.
   * @returns The events.
   */
  async getForGuild(
    guildId: Snowflake,
    query: RESTGetAPIGuildScheduledEventsQuery = {},
    options: RouteOptions = {},
  ): Promise<APIGuildScheduledEvent[]> {
    return await this.#rest.get<APIGuildScheduledEvent[]>(`/guilds/${guildId}/scheduled-events`, {
      ...options,
      query: query as Record<string, string | number | boolean | undefined>,
    })
  }

  /**
   * Fetches one scheduled event.
   *
   * @param guildId - The guild.
   * @param eventId - The event.
   * @param query - Whether to include the subscriber count.
   * @param options - Request options.
   * @returns The event.
   */
  async get(
    guildId: Snowflake,
    eventId: Snowflake,
    query: RESTGetAPIGuildScheduledEventQuery = {},
    options: RouteOptions = {},
  ): Promise<APIGuildScheduledEvent> {
    return await this.#rest.get<APIGuildScheduledEvent>(
      `/guilds/${guildId}/scheduled-events/${eventId}`,
      { ...options, query: query as Record<string, string | number | boolean | undefined> },
    )
  }

  /**
   * Creates a scheduled event. Needs `ManageEvents`.
   *
   * @param guildId - The guild.
   * @param body - The event to create.
   * @param options - Request options.
   * @returns The event that was created.
   *
   * @remarks
   * Created `Scheduled` regardless of what is sent — there is no way to create an event that
   * is already running.
   */
  async create(
    guildId: Snowflake,
    body: RESTPostAPIGuildScheduledEventJSONBody,
    options: RouteOptions = {},
  ): Promise<APIGuildScheduledEvent> {
    return await this.#rest.post<APIGuildScheduledEvent>(`/guilds/${guildId}/scheduled-events`, {
      ...options,
      body,
    })
  }

  /**
   * Edits a scheduled event, which is also how one is started or cancelled.
   *
   * @param guildId - The guild.
   * @param eventId - The event.
   * @param body - The fields to change, `status` among them.
   * @param options - Request options.
   * @returns The updated event.
   *
   * @remarks
   * Changing an event between a channel type and `External` is not two independent edits:
   * moving to `External` requires clearing `channel_id` and setting `entity_metadata` in the
   * same request, and moving back requires the reverse.
   */
  async edit(
    guildId: Snowflake,
    eventId: Snowflake,
    body: RESTPatchAPIGuildScheduledEventJSONBody,
    options: RouteOptions = {},
  ): Promise<APIGuildScheduledEvent> {
    return await this.#rest.patch<APIGuildScheduledEvent>(
      `/guilds/${guildId}/scheduled-events/${eventId}`,
      { ...options, body },
    )
  }

  /**
   * Deletes a scheduled event.
   *
   * @param guildId - The guild.
   * @param eventId - The event.
   * @param options - Request options.
   *
   * @remarks
   * Not the same as cancelling it. A cancelled event stays in the guild's list with
   * `status: Cancelled` and its subscribers keep their notification; a deleted one is gone.
   */
  async delete(guildId: Snowflake, eventId: Snowflake, options: RouteOptions = {}): Promise<void> {
    await this.#rest.delete<undefined>(`/guilds/${guildId}/scheduled-events/${eventId}`, options)
  }

  /**
   * Lists who has subscribed to an event.
   *
   * @param guildId - The guild.
   * @param eventId - The event.
   * @param query - Pagination, and whether to include each subscriber's membership.
   * @param options - Request options.
   * @returns The subscribers.
   *
   * @remarks
   * `with_member` is what turns a bare user into somebody whose nickname and roles are
   * readable, and it costs one request rather than one per subscriber.
   */
  async getSubscribers(
    guildId: Snowflake,
    eventId: Snowflake,
    query: RESTGetAPIGuildScheduledEventUsersQuery = {},
    options: RouteOptions = {},
  ): Promise<RESTGetAPIGuildScheduledEventUsersResult> {
    return await this.#rest.get<RESTGetAPIGuildScheduledEventUsersResult>(
      `/guilds/${guildId}/scheduled-events/${eventId}/users`,
      { ...options, query: query as Record<string, string | number | boolean | undefined> },
    )
  }
}
