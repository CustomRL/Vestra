/**
 * Channel-related enumerations.
 */

/**
 * The type of a channel.
 *
 * @remarks
 * The numbering is not contiguous — Discord has retired values (such as 4-less
 * `GroupDM` gaps and the removed store channel type 6) and never renumbers.
 */
export const ChannelType = {
  /** A text channel within a guild. */
  GuildText: 0,
  /** A direct message between two users. */
  DM: 1,
  /** A voice channel within a guild. */
  GuildVoice: 2,
  /** A direct message between multiple users. */
  GroupDM: 3,
  /** An organisational category containing up to 50 channels. */
  GuildCategory: 4,
  /** A channel users can follow and crosspost into their own guild. */
  GuildAnnouncement: 5,
  /** A temporary sub-channel within a `GuildAnnouncement` channel. */
  AnnouncementThread: 10,
  /** A temporary sub-channel within a `GuildText` or `GuildForum` channel. */
  PublicThread: 11,
  /**
   * A temporary sub-channel visible only to those invited, or those with
   * `ManageThreads` permission.
   */
  PrivateThread: 12,
  /** A voice channel for hosting events with an audience. */
  GuildStageVoice: 13,
  /** The channel in a hub containing the listed servers. */
  GuildDirectory: 14,
  /** A channel that can only contain threads. */
  GuildForum: 15,
  /** A channel that can only contain threads, in a media-gallery layout. */
  GuildMedia: 16,
} as const

/**
 * A channel type.
 */
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType]

/**
 * Flags set on a channel.
 */
export const ChannelFlags = {
  /** The thread is pinned to the top of its parent forum or media channel. */
  Pinned: 1 << 1,
  /** A tag is required to create a thread in this forum or media channel. */
  RequireTag: 1 << 4,
  /** The embedded media download options are hidden on a media channel. */
  HideMediaDownloadOptions: 1 << 15,
} as const

/**
 * A channel flag.
 */
export type ChannelFlags = (typeof ChannelFlags)[keyof typeof ChannelFlags]

/**
 * The camera video quality mode of a voice channel.
 */
export const VideoQualityMode = {
  /** Discord chooses the quality for optimal performance. */
  Auto: 1,
  /** 720p. */
  Full: 2,
} as const

/**
 * A video quality mode.
 */
export type VideoQualityMode = (typeof VideoQualityMode)[keyof typeof VideoQualityMode]

/**
 * The default sort order of posts in a forum or media channel.
 */
export const SortOrderType = {
  /** Sort by recent activity. */
  LatestActivity: 0,
  /** Sort by creation time, newest first. */
  CreationDate: 1,
} as const

/**
 * A forum sort order.
 */
export type SortOrderType = (typeof SortOrderType)[keyof typeof SortOrderType]

/**
 * The default layout of posts in a forum channel.
 */
export const ForumLayoutType = {
  /** No default has been set by a channel administrator. */
  NotSet: 0,
  /** Display posts as a list. */
  ListView: 1,
  /** Display posts as a collection of image-forward tiles. */
  GalleryView: 2,
} as const

/**
 * A forum layout.
 */
export type ForumLayoutType = (typeof ForumLayoutType)[keyof typeof ForumLayoutType]
