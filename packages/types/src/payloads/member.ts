import type { ISO8601Timestamp, Permissions, Snowflake } from '../globals.js'
import type { APIAvatarDecorationData, APIUser } from './user.js'

/**
 * A user's membership of a guild.
 */
export interface APIGuildMember {
  /**
   * The underlying user.
   *
   * @remarks
   * Absent in the member object embedded in `MESSAGE_CREATE` and `MESSAGE_UPDATE`, where
   * the user is already present at the top level of the message. Code that reads
   * `member.user.id` must account for this — it is the single most common source of
   * runtime errors when porting from another library.
   */
  user?: APIUser
  /** The member's guild-specific nickname. */
  nick?: string | null
  /** The member's guild-specific avatar hash. */
  avatar?: string | null
  /** The member's guild-specific banner hash. */
  banner?: string | null
  /** The IDs of the roles the member has. */
  roles: Snowflake[]
  /** When the member joined the guild. */
  joined_at: ISO8601Timestamp
  /** When the member started boosting the guild. */
  premium_since?: ISO8601Timestamp | null
  /** Whether the member is server-deafened in voice channels. */
  deaf: boolean
  /** Whether the member is server-muted in voice channels. */
  mute: boolean
  /** The member's flags. A bit set of {@link GuildMemberFlags}. */
  flags: number
  /**
   * Whether the member has passed the guild's membership screening.
   *
   * @remarks
   * Note the inversion: `true` means the member is still pending and cannot interact.
   */
  pending?: boolean
  /**
   * The member's permissions in the current channel.
   *
   * @remarks
   * Only sent on interaction payloads, where Discord has already resolved them for the
   * invoking channel. Everywhere else, permissions must be computed from roles and
   * channel overwrites.
   */
  permissions?: Permissions
  /**
   * When the member's timeout expires.
   *
   * @remarks
   * May be a time in the past, which means the timeout has elapsed. Compare against the
   * current time rather than testing for presence.
   */
  communication_disabled_until?: ISO8601Timestamp | null
  /** The member's avatar decoration. */
  avatar_decoration_data?: APIAvatarDecorationData | null
}

/**
 * A guild member as embedded in a message.
 *
 * @remarks
 * Identical to {@link APIGuildMember} except that `user` is never present.
 */
export type APIGuildMemberPartial = Omit<APIGuildMember, 'user'>

/**
 * A user's connection to a voice channel.
 */
export interface APIVoiceState {
  /** The guild the voice state belongs to. */
  guild_id?: Snowflake
  /** The channel the user is connected to, or `null` if they have disconnected. */
  channel_id: Snowflake | null
  /** The user this voice state is for. */
  user_id: Snowflake
  /** The guild member this voice state is for. */
  member?: APIGuildMember
  /** The session ID for this voice state. */
  session_id: string
  /** Whether the user is deafened by the server. */
  deaf: boolean
  /** Whether the user is muted by the server. */
  mute: boolean
  /** Whether the user has deafened themselves. */
  self_deaf: boolean
  /** Whether the user has muted themselves. */
  self_mute: boolean
  /** Whether the user is streaming using Go Live. */
  self_stream?: boolean
  /** Whether the user's camera is enabled. */
  self_video: boolean
  /** Whether the user's permission to speak is denied. */
  suppress: boolean
  /** When the user requested to speak in a stage channel. */
  request_to_speak_timestamp: ISO8601Timestamp | null
}
