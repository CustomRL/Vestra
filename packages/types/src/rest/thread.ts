import type { Snowflake } from '../globals.js'
import type { ChannelType } from '../enums/channel.js'
import type { APIChannel } from '../payloads/channel.js'
import type { APIThreadMember, ThreadAutoArchiveDuration } from '../payloads/thread.js'

/**
 * Thread request bodies, queries and results.
 *
 * @remarks
 * A thread is a channel, so it is fetched, edited and deleted through the channel routes. What
 * needs its own shapes is **starting** one and **membership**, because both are addressed
 * differently: a thread is started from a channel or from a message, and membership is a
 * `thread-members` sub-resource rather than anything the channel routes model.
 */

/**
 * `POST /channels/{channel.id}/messages/{message.id}/threads`
 *
 * @remarks
 * The thread takes the message as its starting point and shares its ID, so a message can
 * anchor at most one thread — a second call answers `160004`.
 */
export interface RESTPostAPIChannelMessageThreadsJSONBody {
  /** The thread's name, 1 to 100 characters. */
  name: string
  /** Minutes of inactivity before it archives. */
  auto_archive_duration?: ThreadAutoArchiveDuration
  /** Seconds a member must wait between messages. */
  rate_limit_per_user?: number | null
}

/**
 * `POST /channels/{channel.id}/threads`
 *
 * @remarks
 * `type` decides who can see it and defaults to a **private** thread, which is the opposite
 * of what starting one from a message gives you. Naming it explicitly is worth the keystrokes.
 */
export interface RESTPostAPIChannelThreadsJSONBody {
  /** The thread's name, 1 to 100 characters. */
  name: string
  /** Minutes of inactivity before it archives. */
  auto_archive_duration?: ThreadAutoArchiveDuration
  /** Public or private. Defaults to a private thread. */
  type?: ChannelType
  /** Whether non-moderators can add others. Private threads only. */
  invitable?: boolean
  /** Seconds a member must wait between messages. */
  rate_limit_per_user?: number | null
}

/**
 * `GET /channels/{channel.id}/thread-members`
 *
 * @remarks
 * Paginated by user ID and capped at 100. `with_member` is what makes the guild member
 * available on each entry; without it only the IDs and join timestamps come back.
 */
export interface RESTGetAPIChannelThreadMembersQuery {
  /** Include the corresponding guild member on each entry. */
  with_member?: boolean
  /** Return members after this user ID. */
  after?: Snowflake
  /** How many to return, 1 to 100. */
  limit?: number
}

/** The result of starting a thread, either way. */
export type RESTPostAPIChannelThreadsResult = APIChannel

/** The result of `GET /channels/{channel.id}/thread-members`. */
export type RESTGetAPIChannelThreadMembersResult = APIThreadMember[]

/** The result of `GET /channels/{channel.id}/thread-members/{user.id}`. */
export type RESTGetAPIChannelThreadMemberResult = APIThreadMember

/**
 * The result of `GET /guilds/{guild.id}/threads/active`.
 *
 * @remarks
 * `members` carries only the **current user's** memberships, one entry per thread it is in —
 * not every member of every thread, which would be unbounded.
 */
export interface RESTGetAPIGuildThreadsResult {
  /** The active threads. */
  threads: APIChannel[]
  /** The current user's membership of each thread it belongs to. */
  members: APIThreadMember[]
}
