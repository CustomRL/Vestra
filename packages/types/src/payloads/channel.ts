import type { ISO8601Timestamp, Permissions, Snowflake } from '../globals.js'
import type {
  ChannelFlags,
  ChannelType,
  ForumLayoutType,
  SortOrderType,
  VideoQualityMode,
} from '../enums/channel.js'
import type { APIUser } from './user.js'
import type {
  APIDefaultReaction,
  APIForumTag,
  APIThreadMember,
  APIThreadMetadata,
  ThreadAutoArchiveDuration,
} from './thread.js'

/**
 * A permission overwrite on a channel.
 */
export interface APIOverwrite {
  /** The ID of the role or user this overwrite applies to. */
  id: Snowflake
  /** Whether `id` refers to a role (`0`) or a member (`1`). */
  type: 0 | 1
  /** Permissions explicitly allowed, as a decimal string. */
  allow: Permissions
  /** Permissions explicitly denied, as a decimal string. */
  deny: Permissions
}

/**
 * Fields shared by every channel, whatever its type.
 */
export interface APIChannelBase<Type extends ChannelType> {
  /** The channel's ID. */
  id: Snowflake
  /** The channel's type. Narrow on this to reach a specific channel shape. */
  type: Type
  /** The channel's flags. A bit set of {@link ChannelFlags}. */
  flags?: number
}

/**
 * Fields shared by every channel that lives inside a guild.
 */
export interface APIGuildChannelBase<Type extends ChannelType> extends APIChannelBase<Type> {
  /**
   * The ID of the guild the channel belongs to.
   *
   * @remarks
   * Optional because Discord omits it on channel objects nested inside a `GUILD_CREATE`
   * payload, where the guild is already known from context.
   */
  guild_id?: Snowflake
  /** The channel's name. */
  name: string
  /**
   * The channel's sorting position.
   *
   * @remarks
   * Not unique, and not contiguous. Sort by position then by ID to reproduce the order
   * the Discord client shows.
   */
  position: number
  /** Explicit permission overwrites for members and roles. */
  permission_overwrites?: APIOverwrite[]
  /** The ID of the category this channel sits under. */
  parent_id?: Snowflake | null
  /** Whether the channel is marked age-restricted. */
  nsfw?: boolean
}

/**
 * Fields shared by every channel that can contain messages.
 */
export interface APITextBasedChannelBase<
  Type extends ChannelType,
> extends APIGuildChannelBase<Type> {
  /**
   * The ID of the last message sent in this channel.
   *
   * @remarks
   * May point at a message that has since been deleted, so it is not safe to fetch
   * blindly.
   */
  last_message_id?: Snowflake | null
  /** When the last pinned message in the channel was pinned. */
  last_pin_timestamp?: ISO8601Timestamp | null
  /**
   * Seconds a user must wait between messages, from 0 to 21600.
   *
   * @remarks
   * Does not apply to users with `ManageMessages` or `ManageChannel`.
   */
  rate_limit_per_user?: number
  /** The channel's topic. */
  topic?: string | null
}

/** A text channel within a guild. */
export interface APITextChannel extends APITextBasedChannelBase<typeof ChannelType.GuildText> {
  /** The default auto-archive duration for new threads in this channel. */
  default_auto_archive_duration?: ThreadAutoArchiveDuration
}

/** A channel users can follow and crosspost into their own guild. */
export interface APIAnnouncementChannel extends APITextBasedChannelBase<
  typeof ChannelType.GuildAnnouncement
> {
  /** The default auto-archive duration for new threads in this channel. */
  default_auto_archive_duration?: ThreadAutoArchiveDuration
}

/**
 * Fields shared by voice and stage channels.
 */
export interface APIVoiceChannelBase<
  Type extends ChannelType,
> extends APITextBasedChannelBase<Type> {
  /** The channel's bitrate in bits per second. */
  bitrate?: number
  /** The maximum number of connected users. `0` means unlimited. */
  user_limit?: number
  /** The voice region ID, or `null` for automatic selection. */
  rtc_region?: string | null
  /** The channel's camera video quality mode. */
  video_quality_mode?: VideoQualityMode
}

/** A voice channel within a guild. */
export type APIVoiceChannel = APIVoiceChannelBase<typeof ChannelType.GuildVoice>

/** A voice channel for hosting events with an audience. */
export type APIStageChannel = APIVoiceChannelBase<typeof ChannelType.GuildStageVoice>

/** An organisational category containing other channels. */
export type APICategoryChannel = APIGuildChannelBase<typeof ChannelType.GuildCategory>

/**
 * Fields shared by forum and media channels.
 */
export interface APIThreadOnlyChannelBase<
  Type extends ChannelType,
> extends APIGuildChannelBase<Type> {
  /** The channel's guidelines, shown above the post list. */
  topic?: string | null
  /** Seconds a user must wait between creating threads. */
  rate_limit_per_user?: number
  /** The ID of the last thread created in this channel. */
  last_message_id?: Snowflake | null
  /** The default auto-archive duration for new threads. */
  default_auto_archive_duration?: ThreadAutoArchiveDuration
  /** The tags that can be applied to threads in this channel. */
  available_tags?: APIForumTag[]
  /** The emoji shown on the add-reaction button of posts. */
  default_reaction_emoji?: APIDefaultReaction | null
  /** The default `rate_limit_per_user` applied to newly created threads. */
  default_thread_rate_limit_per_user?: number
  /** The default sort order of posts. `null` means Discord has not set one. */
  default_sort_order?: SortOrderType | null
}

/** A channel that can only contain threads. */
export interface APIForumChannel extends APIThreadOnlyChannelBase<typeof ChannelType.GuildForum> {
  /** The default layout of posts. */
  default_forum_layout?: ForumLayoutType
}

/** A channel that can only contain threads, in a media-gallery layout. */
export type APIMediaChannel = APIThreadOnlyChannelBase<typeof ChannelType.GuildMedia>

/** A thread within a text, announcement, forum or media channel. */
export interface APIThreadChannel extends APITextBasedChannelBase<
  | typeof ChannelType.AnnouncementThread
  | typeof ChannelType.PublicThread
  | typeof ChannelType.PrivateThread
> {
  /** The ID of the user who created the thread. */
  owner_id?: Snowflake
  /** Thread-specific settings. */
  thread_metadata?: APIThreadMetadata
  /** The current user's membership of the thread, if they have joined it. */
  member?: APIThreadMember
  /**
   * An approximate count of messages in the thread.
   *
   * @remarks
   * Stops counting at 50 for threads created before 1 July 2022. Use `total_message_sent`
   * for an uncapped figure.
   */
  message_count?: number
  /** An approximate count of members in the thread. Stops counting at 50. */
  member_count?: number
  /** The total number of messages ever sent in the thread, including deleted ones. */
  total_message_sent?: number
  /** The IDs of tags applied to this thread. Forum and media channels only. */
  applied_tags?: Snowflake[]
}

/** A direct message between two users. */
export interface APIDMChannel extends APIChannelBase<typeof ChannelType.DM> {
  /** The ID of the last message sent in this channel. */
  last_message_id?: Snowflake | null
  /** The recipients of the DM. */
  recipients?: APIUser[]
}

/** A direct message between multiple users. */
export interface APIGroupDMChannel extends APIChannelBase<typeof ChannelType.GroupDM> {
  /** The channel's name. */
  name?: string | null
  /** The channel's icon hash. */
  icon?: string | null
  /** The ID of the group's owner. */
  owner_id?: Snowflake
  /** The ID of the application that created the group, if it is bot-created. */
  application_id?: Snowflake
  /** Whether the group was created by an application. */
  managed?: boolean
  /** The ID of the last message sent in this channel. */
  last_message_id?: Snowflake | null
  /** The recipients of the group DM. */
  recipients?: APIUser[]
}

/**
 * Any Discord channel.
 *
 * @remarks
 * A discriminated union on `type`, so narrowing gives the precise shape:
 *
 * ```ts
 * if (channel.type === ChannelType.GuildVoice) {
 *   channel.bitrate // available; would be a type error on a text channel
 * }
 * ```
 */
export type APIChannel =
  | APIAnnouncementChannel
  | APICategoryChannel
  | APIDMChannel
  | APIForumChannel
  | APIGroupDMChannel
  | APIMediaChannel
  | APIStageChannel
  | APITextChannel
  | APIThreadChannel
  | APIVoiceChannel

/**
 * The reduced channel form sent inside interaction `resolved` data and message mentions.
 *
 * @remarks
 * Discord enumerates exactly which fields survive the reduction, and it is a longer list
 * than the name suggests: `id`, `name`, `type`, `permissions`, `app_permissions`,
 * `last_message_id`, `last_pin_timestamp`, `nsfw`, `parent_id`, `guild_id`, `flags`,
 * `rate_limit_per_user`, `topic` and `position`, plus `thread_metadata` on a thread.
 *
 * Every field but `id` and `type` is optional, because which of them arrive depends on the
 * channel's type — a DM has no `guild_id`, a voice channel no `topic`. Optional here means
 * "may be absent", and the three fields that are additionally nullable say so separately.
 */
export interface APIChannelPartial {
  /** The channel's ID. */
  id: Snowflake
  /** The channel's type. */
  type: ChannelType
  /** The channel's name. */
  name?: string
  /** The ID of the category this channel sits under. */
  parent_id?: Snowflake | null
  /** Thread-specific settings, when the channel is a thread. */
  thread_metadata?: APIThreadMetadata
  /** The invoking user's permissions in the channel. Interactions only. */
  permissions?: Permissions
  /** The application's own permissions in the channel. Interactions only. */
  app_permissions?: Permissions
  /** The guild the channel belongs to. Absent on a direct message. */
  guild_id?: Snowflake
  /** The channel's topic, or `null` where one has never been set. */
  topic?: string | null
  /** Whether the channel is marked age-restricted. */
  nsfw?: boolean
  /**
   * The last message sent in the channel.
   *
   * @remarks
   * Nullable, and `null` does not mean the channel is empty: the ID points at the last
   * message *sent*, which may since have been deleted. It is not a reliable existence
   * check, only an ordering hint.
   */
  last_message_id?: Snowflake | null
  /** When the most recent pin was pinned, or `null` if nothing is pinned. */
  last_pin_timestamp?: ISO8601Timestamp | null
  /** The channel's flags, as a bit set. */
  flags?: ChannelFlags
  /** The per-user slow-mode interval in seconds. */
  rate_limit_per_user?: number
  /** The channel's sorting position within the guild. */
  position?: number
}
