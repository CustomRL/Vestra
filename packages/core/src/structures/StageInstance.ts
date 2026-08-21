import type { APIStageInstance, Snowflake, StageInstancePrivacyLevel } from '@vestra/types'
import { Base } from './Base.js'
import { snowflakeDate, snowflakeTimestamp } from './snowflake.js'

/**
 * A live stage.
 *
 * @remarks
 * **The instance is what makes a stage channel live.** The channel exists whether or not
 * anybody is speaking; the instance exists only while the stage is running. So "is this stage
 * live?" is answered by whether an instance exists, not by a field on
 * {@link StageChannel} — there is none, and adding one would go stale the moment Discord
 * ended the stage on its own.
 *
 * **Not cached, and there is no stageInstances scope.** A guild has at most one live stage per
 * stage channel and most guilds never open one, so a scope would sit empty in almost every
 * process while adding a store, a key, an eviction path in `evictGuild` and a case in every
 * adapter. The three dispatches carry the whole instance, including the delete, so a listener
 * that wants to track the live set can keep its own `Map` keyed by `channelId` in fewer lines
 * than the scope would cost.
 *
 * **Discord ends stages without being asked.** A stage with no speakers for a few minutes is
 * closed automatically, which arrives as `STAGE_INSTANCE_DELETE` with no request behind it —
 * so a bot must treat the delete as authoritative rather than assuming it caused every one it
 * sees.
 */
export class StageInstance<Client = unknown> extends Base<Client> {
  /**
   * The instance's ID.
   *
   * @remarks
   * Its own snowflake, distinct from {@link StageInstance.channelId}. Two stages run in the
   * same channel on different days share the channel and not this, which is what makes it the
   * right key for "the same stage".
   */
  declare readonly id: Snowflake
  /** The guild the stage channel belongs to. */
  declare readonly guildId: Snowflake
  /** The stage channel the instance is running in. */
  declare readonly channelId: Snowflake
  /** The blurb shown under the channel's name while it is live. */
  declare topic: string
  /** Who can see the stage. */
  declare privacyLevel: StageInstancePrivacyLevel
  /**
   * Whether the stage is hidden from stage discovery.
   *
   * @remarks
   * Mirrored because Discord sends it on every instance, and negative because Discord named it
   * that way. Discord marks stage discovery itself as deprecated, so the field arriving says
   * nothing about whether it is still honoured — read it as what the payload claimed rather
   * than as what will happen.
   */
  declare discoverableDisabled: boolean
  /**
   * The scheduled event this stage was started for, or `null`.
   *
   * @remarks
   * `null` for a stage opened on the spot. Set when the instance was created with
   * `guild_scheduled_event_id`, which is the only link between a scheduled event and the
   * stage that fulfils it.
   */
  declare guildScheduledEventId: Snowflake | null

  /**
   * @param data - The payload to mirror.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIStageInstance, client: Client) {
    super(client)

    this.id = data.id
    this.guildId = data.guild_id
    this.channelId = data.channel_id
    this.topic = data.topic
    this.privacyLevel = data.privacy_level
    // Discord deprecates stage discovery, not this field: it arrives on every instance, and
    // dropping it would leave consumers unable to see what the payload actually said.
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- see above
    this.discoverableDisabled = data.discoverable_disabled
    this.guildScheduledEventId = data.guild_scheduled_event_id
  }

  /** When the stage went live, in epoch milliseconds. */
  get createdTimestamp(): number {
    return snowflakeTimestamp(this.id)
  }

  /** When the stage went live. Allocates. */
  get createdAt(): Date {
    return snowflakeDate(this.id)
  }
}
