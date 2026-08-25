import type { Snowflake } from '../globals.js'
import type { APIChannel } from '../payloads/channel.js'
import type { APIGuildPartial } from '../payloads/guild.js'
import type { APIGuildMember } from '../payloads/member.js'
import type { APIConnection, APIUser } from '../payloads/user.js'

/** The result of `GET /users/@me`. */
export type RESTGetAPICurrentUserResult = APIUser

/** The result of `GET /users/{user.id}`. */
export type RESTGetAPIUserResult = APIUser

/**
 * `PATCH /users/@me`
 */
export interface RESTPatchAPICurrentUserJSONBody {
  /** The new username. */
  username?: string
  /** The new avatar, as a data URI. Pass `null` to remove it. */
  avatar?: string | null
  /** The new banner, as a data URI. Pass `null` to remove it. */
  banner?: string | null
}

/** The result of `PATCH /users/@me`. */
export type RESTPatchAPICurrentUserResult = APIUser

/**
 * `GET /users/@me/guilds`
 */
export interface RESTGetAPICurrentUserGuildsQuery {
  /** Return guilds before this ID. */
  before?: Snowflake
  /** Return guilds after this ID. */
  after?: Snowflake
  /** How many guilds to return, from 1 to 200. Defaults to 200. */
  limit?: number
  /** Whether to include approximate member and presence counts. */
  with_counts?: boolean
}

/** The result of `GET /users/@me/guilds`. */
export type RESTGetAPICurrentUserGuildsResult = APIGuildPartial[]

/**
 * `POST /users/@me/channels`
 *
 * @remarks
 * Opening a DM is not rate limited per recipient, but a bot that opens one per user in a
 * loop will hit the global limit quickly. Cache the resulting channel ID.
 */
export interface RESTPostAPICurrentUserCreateDMChannelJSONBody {
  /** The user to open a DM with. */
  recipient_id: Snowflake
}

/** The result of `POST /users/@me/channels`. */
export type RESTPostAPICurrentUserCreateDMChannelResult = APIChannel

/** The result of `GET /users/@me/connections`. */
export type RESTGetAPICurrentUserConnectionsResult = APIConnection[]

/** The result of `GET /users/@me/guilds/{guild.id}/member`. */
export type RESTGetAPICurrentUserGuildMemberResult = APIGuildMember
