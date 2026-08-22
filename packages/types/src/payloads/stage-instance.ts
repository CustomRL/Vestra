import type { Snowflake } from '../globals.js'
import type { StageInstancePrivacyLevel } from '../enums/scheduled-event.js'

/**
 * A live stage.
 *
 * @remarks
 * A stage instance is what makes a stage channel *live*: the channel exists permanently,
 * the instance exists only while the stage is running. Testing whether a stage channel is
 * live means testing for the presence of its instance, not reading a field on the
 * channel.
 *
 * Discord deletes the instance on its own once the stage has had no speakers for a few
 * minutes, which arrives as `STAGE_INSTANCE_DELETE` with no request having been made.
 */
export interface APIStageInstance {
  /** The stage instance's ID. Distinct from the ID of the channel it belongs to. */
  id: Snowflake
  /** The ID of the guild the stage channel belongs to. */
  guild_id: Snowflake
  /** The ID of the stage channel this instance is running in. */
  channel_id: Snowflake
  /** The blurb shown under the channel's name while it is live, 1-120 characters. */
  topic: string
  /** Who can see the stage instance. */
  privacy_level: StageInstancePrivacyLevel
  /**
   * Whether the stage is hidden from stage discovery.
   *
   * @deprecated Discord marks stage discovery as deprecated. The field is still sent on
   * every stage instance, so its presence says nothing about whether it is still honoured.
   */
  discoverable_disabled: boolean
  /**
   * The ID of the scheduled event this stage instance was started for.
   *
   * @remarks
   * `null` for a stage started on the spot rather than from an event. Set when the
   * instance was created with `guild_scheduled_event_id`, which is what links a
   * `StageInstance` scheduled event to the stage that fulfils it.
   */
  guild_scheduled_event_id: Snowflake | null
}
