import type { Snowflake } from '../globals.js'
import type { StageInstancePrivacyLevel } from '../enums/scheduled-event.js'
import type { APIStageInstance } from '../payloads/stage-instance.js'

/**
 * Stage instance bodies and results.
 *
 * @remarks
 * **Addressed by channel, not by instance.** `GET`, `PATCH` and `DELETE` all take the stage
 * *channel's* ID even though the instance has an ID of its own and returns it. That is the
 * one thing about this resource that reads wrong and compiles fine — passing
 * `instance.id` gets a 404 for a stage that is plainly live.
 *
 * It follows from what an instance is: a stage channel exists permanently and its instance
 * exists only while the stage is running, so the channel is the stable name for "the stage
 * happening here". Creating one is a `POST` to the collection with the channel in the body;
 * everything after that is keyed by the channel.
 */

/**
 * `POST /stage-instances`
 */
export interface RESTPostAPIStageInstanceJSONBody {
  /** The stage channel to go live in. */
  channel_id: Snowflake
  /** The blurb shown under the channel name, 1 to 120 characters. */
  topic: string
  /** Who can see it. Defaults to `GuildOnly`. */
  privacy_level?: StageInstancePrivacyLevel
  /** Whether to notify `@everyone` that the stage started. Needs `MentionEveryone`. */
  send_start_notification?: boolean
  /** The scheduled event this stage fulfils, linking the two. */
  guild_scheduled_event_id?: Snowflake
}

/** The result of `POST /stage-instances`. */
export type RESTPostAPIStageInstanceResult = APIStageInstance

/** The result of `GET /stage-instances/{channel.id}`. */
export type RESTGetAPIStageInstanceResult = APIStageInstance

/**
 * `PATCH /stage-instances/{channel.id}`
 *
 * @remarks
 * No `channel_id`: the channel is the address, so moving a live stage is not an edit but a
 * delete and a create.
 */
export interface RESTPatchAPIStageInstanceJSONBody {
  /** A new blurb. */
  topic?: string
  /** A new privacy level. */
  privacy_level?: StageInstancePrivacyLevel
}

/** The result of `PATCH /stage-instances/{channel.id}`. */
export type RESTPatchAPIStageInstanceResult = APIStageInstance
