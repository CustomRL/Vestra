import type { Snowflake } from '../globals.js'
import type { InviteTargetType } from '../enums/guild.js'
import type { APIInvite } from '../payloads/guild.js'

/**
 * Invite request bodies, queries and results.
 *
 * @remarks
 * An invite is keyed by a **code**, not a snowflake, which is why it has its own file and its
 * own route namespace rather than living under `channels`. The code is a user-visible string —
 * Discord generates a short random one, and a guild with the feature can set a vanity code —
 * so it is the one resource identifier in the API that is neither an ID nor guaranteed stable.
 */

/**
 * `POST /channels/{channel.id}/invites`
 *
 * @remarks
 * Every field is optional and Discord's defaults are not the ones a bot usually wants:
 * `max_age` defaults to **86400** (a day) rather than never, and `unique` defaults to
 * `false`, which means an equivalent existing invite is returned instead of a new one. A bot
 * handing a fresh link to each user needs `unique: true` or it will hand out the same code.
 */
export interface RESTPostAPIChannelInviteJSONBody {
  /** Seconds before expiry, 0 to 604800. `0` never expires. Defaults to 86400. */
  max_age?: number
  /** Maximum uses, 0 to 100. `0` is unlimited. Defaults to 0. */
  max_uses?: number
  /** Whether membership granted through this invite ends on disconnect. */
  temporary?: boolean
  /** Whether to always create a new code rather than returning an equivalent one. */
  unique?: boolean
  /** What the invite points at, for a voice channel. */
  target_type?: InviteTargetType
  /** The user whose stream the invite points at. */
  target_user_id?: Snowflake
  /** The embedded application the invite launches. */
  target_application_id?: Snowflake
}

/**
 * `GET /invites/{invite.code}`
 *
 * @remarks
 * The counts are **approximate** and absent unless asked for, which is why they are a query
 * rather than always present: computing them costs Discord a scan it will not do by default.
 */
export interface RESTGetAPIInviteQuery {
  /** Include approximate member and presence counts. */
  with_counts?: boolean
  /** Include the expiry timestamp. */
  with_expiration?: boolean
  /** The scheduled event to include in the response. */
  guild_scheduled_event_id?: Snowflake
}

/** The result of `GET /invites/{invite.code}`. */
export type RESTGetAPIInviteResult = APIInvite

/** The result of `DELETE /invites/{invite.code}`. */
export type RESTDeleteAPIInviteResult = APIInvite

/** The result of `POST /channels/{channel.id}/invites`. */
export type RESTPostAPIChannelInviteResult = APIInvite

/** The result of `GET /channels/{channel.id}/invites`. */
export type RESTGetAPIChannelInvitesResult = APIInvite[]

/** The result of `GET /guilds/{guild.id}/invites`. */
export type RESTGetAPIGuildInvitesResult = APIInvite[]
