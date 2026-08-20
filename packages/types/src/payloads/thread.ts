import type { ISO8601Timestamp, Snowflake } from '../globals.js'
import type { APIGuildMember } from './member.js'

/**
 * How long a thread waits without activity before archiving, in minutes.
 */
export type ThreadAutoArchiveDuration = 60 | 1440 | 4320 | 10080

/**
 * Thread-specific settings.
 */
export interface APIThreadMetadata {
  /** Whether the thread is archived. */
  archived: boolean
  /** How long the thread stays inactive before archiving, in minutes. */
  auto_archive_duration: ThreadAutoArchiveDuration
  /** When the thread's archive status last changed. */
  archive_timestamp: ISO8601Timestamp
  /** Whether the thread is locked, so only moderators can unarchive it. */
  locked: boolean
  /** Whether non-moderators can add other non-moderators. Private threads only. */
  invitable?: boolean
  /** When the thread was created. Only present on threads created after 9 January 2022. */
  create_timestamp?: ISO8601Timestamp | null
}

/**
 * A user's membership of a thread.
 */
export interface APIThreadMember {
  /** The thread's ID. Absent within `GUILD_CREATE`. */
  id?: Snowflake
  /** The user's ID. Absent within `GUILD_CREATE`. */
  user_id?: Snowflake
  /** When the user last joined the thread. */
  join_timestamp: ISO8601Timestamp
  /** Per-user notification settings. Unused by bots. */
  flags: number
  /** The corresponding guild member. Only present when requested with member details. */
  member?: APIGuildMember
}

/**
 * A tag that can be applied to threads in a forum or media channel.
 */
export interface APIForumTag {
  /** The tag's ID. */
  id: Snowflake
  /** The tag's name. */
  name: string
  /** Whether applying this tag requires the `ManageThreads` permission. */
  moderated: boolean
  /** The ID of a guild custom emoji shown alongside the tag. */
  emoji_id: Snowflake | null
  /** The unicode character of the emoji shown alongside the tag. */
  emoji_name: string | null
}

/**
 * The emoji shown on the add-reaction button of a forum post.
 */
export interface APIDefaultReaction {
  /** The ID of a guild custom emoji. */
  emoji_id: Snowflake | null
  /** The unicode character of the emoji. */
  emoji_name: string | null
}
