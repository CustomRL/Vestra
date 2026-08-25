import type { APIVoiceChannelBase, ChannelType, Snowflake, VideoQualityMode } from '@vestra/types'
import { GuildTextBasedChannel } from './GuildTextBasedChannel.js'
import type { ChannelChanges, ChannelChangesDraft } from './ChannelChanges.js'

/**
 * A voice channel within a guild.
 *
 * @remarks
 * Extends the text-based base rather than {@link GuildChannel} because a voice channel has
 * carried messages since 2021 — the chat panel beside the call is an ordinary message list in
 * the same channel ID.
 */
export class VoiceChannel<Client = unknown> extends GuildTextBasedChannel<Client> {
  /** The channel's bitrate, in bits per second. */
  declare bitrate: number | undefined
  /** The maximum number of connected members. `0` means unlimited. */
  declare userLimit: number | undefined
  /** The voice region, or `null` when Discord picks one. */
  declare rtcRegion: string | null | undefined
  /** The camera video quality mode. */
  declare videoQualityMode: VideoQualityMode | undefined

  /**
   * @param data - The payload to mirror.
   * @param guildId - The guild the channel belongs to.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIVoiceChannelBase<ChannelType>, guildId: Snowflake, client: Client) {
    super(data, guildId, client)

    this.bitrate = data.bitrate
    this.userLimit = data.user_limit
    this.rtcRegion = data.rtc_region
    this.videoQualityMode = data.video_quality_mode
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   */
  override patch(data: APIVoiceChannelBase<ChannelType>): ChannelChanges<Client> | null {
    let changes: ChannelChangesDraft<Client> | null = super.patch(data)

    if (data.bitrate !== this.bitrate) (changes ??= {}).bitrate = this.bitrate
    this.bitrate = data.bitrate
    if (data.user_limit !== this.userLimit) (changes ??= {}).userLimit = this.userLimit
    this.userLimit = data.user_limit
    if (data.rtc_region !== this.rtcRegion) (changes ??= {}).rtcRegion = this.rtcRegion
    this.rtcRegion = data.rtc_region
    if (data.video_quality_mode !== this.videoQualityMode) {
      ;(changes ??= {}).videoQualityMode = this.videoQualityMode
    }
    this.videoQualityMode = data.video_quality_mode

    return changes
  }
}
