import type { Snowflake } from '@vestra/types'
import { GuildScheduledEvent } from '../../structures/GuildScheduledEvent.js'
import { defineHandler } from '../EventHandler.js'

// ---------------------------------------------------------------------------------------
// TEMPORARY, and it must be deleted rather than left: these five signatures belong in
// `events/ClientEvents.ts` beside every other event. They are declared here only so this
// file compiles before the registry wiring lands — an augmentation and a real declaration
// merge silently when they agree, so nothing else will point this out.
// ---------------------------------------------------------------------------------------
declare module '../ClientEvents.js' {
  interface ClientEvents<Client = unknown> {
    /** A scheduled event was created. */
    guildScheduledEventCreate: [scheduledEvent: GuildScheduledEvent<Client>]
    /** A scheduled event was updated. */
    guildScheduledEventUpdate: [scheduledEvent: GuildScheduledEvent<Client>]
    /** A scheduled event was deleted. */
    guildScheduledEventDelete: [scheduledEvent: GuildScheduledEvent<Client>]
    /** Somebody subscribed to a scheduled event. */
    guildScheduledEventUserAdd: [
      guildScheduledEventId: Snowflake,
      userId: Snowflake,
      guildId: Snowflake,
    ]
    /** Somebody unsubscribed from a scheduled event. */
    guildScheduledEventUserRemove: [
      guildScheduledEventId: Snowflake,
      userId: Snowflake,
      guildId: Snowflake,
    ]
  }
}

/**
 * Guild scheduled event dispatches.
 *
 * @remarks
 * **Three of the five carry the whole event and two carry three snowflakes**, and that split
 * decides what each emits. `GUILD_SCHEDULED_EVENT_CREATE`, `_UPDATE` and `_DELETE` all send a
 * complete scheduled event, so all three emit a {@link GuildScheduledEvent} — including the
 * delete, which is the {@link stageInstanceDelete} case rather than the {@link channelDelete}
 * one: nothing has to be read out of a cache first because the payload the listener needs is
 * the payload that arrived.
 *
 * `GUILD_SCHEDULED_EVENT_USER_ADD` and `_USER_REMOVE` send only
 * `guild_scheduled_event_id`, `user_id` and `guild_id`. They emit exactly those, for the
 * reason {@link ClientEvents.messageDelete} carries IDs: there is no structure to build from
 * three snowflakes, nothing cached to resolve them against, and inventing a partial event
 * whose every other field is `undefined` would read as a scheduled event with no name.
 *
 * **Nothing is cached.** {@link GuildScheduledEvent} records why there is no scope, and the
 * consequence for these handlers is that the update builds a fresh structure rather than
 * patching one — two updates for the same event produce two objects, and comparing them by
 * `id` is what tells a listener they describe the same event.
 */

/** A scheduled event was created. */
export const guildScheduledEventCreate = defineHandler(
  'GUILD_SCHEDULED_EVENT_CREATE',
  (client, data) => {
    client.emit('guildScheduledEventCreate', new GuildScheduledEvent(data, client))
  },
)

/**
 * A scheduled event was updated.
 *
 * @remarks
 * Fires for a rescheduling, a rename, and for every status change — including the ones
 * Discord makes on its own when an event starts or finishes. `status` is the field that says
 * which, and `Completed` and `Canceled` are terminal, so an update carrying either is the last
 * thing a listener will hear about that event.
 */
export const guildScheduledEventUpdate = defineHandler(
  'GUILD_SCHEDULED_EVENT_UPDATE',
  (client, data) => {
    client.emit('guildScheduledEventUpdate', new GuildScheduledEvent(data, client))
  },
)

/**
 * A scheduled event was deleted.
 *
 * @remarks
 * Emits the whole event rather than its ID, because the dispatch carries the whole event. A
 * cancelled event is **not** this — cancelling sets `status` to `Canceled` and arrives as an
 * update, so a listener that treats this as "the event was called off" will miss every
 * cancellation and see only the events somebody removed outright.
 */
export const guildScheduledEventDelete = defineHandler(
  'GUILD_SCHEDULED_EVENT_DELETE',
  (client, data) => {
    client.emit('guildScheduledEventDelete', new GuildScheduledEvent(data, client))
  },
)

/**
 * Somebody subscribed to a scheduled event.
 *
 * @remarks
 * Needs the `GuildScheduledEvents` intent, like the other four. The payload names the user but
 * carries neither their `user` object nor their member, so this emits the IDs Discord sent.
 */
export const guildScheduledEventUserAdd = defineHandler(
  'GUILD_SCHEDULED_EVENT_USER_ADD',
  (client, data) => {
    client.emit(
      'guildScheduledEventUserAdd',
      data.guild_scheduled_event_id,
      data.user_id,
      data.guild_id,
    )
  },
)

/**
 * Somebody unsubscribed from a scheduled event.
 *
 * @remarks
 * The mirror of {@link guildScheduledEventUserAdd}, and the other half of the only way to
 * track how many people are interested in an event: `user_count` is never sent on a gateway
 * payload, so a running total has to be kept from these two.
 */
export const guildScheduledEventUserRemove = defineHandler(
  'GUILD_SCHEDULED_EVENT_USER_REMOVE',
  (client, data) => {
    client.emit(
      'guildScheduledEventUserRemove',
      data.guild_scheduled_event_id,
      data.user_id,
      data.guild_id,
    )
  },
)
