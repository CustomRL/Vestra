import type { Snowflake } from '../globals.js'
import type { WebhookType } from '../enums/integration.js'
import type { APIUser } from './user.js'

/**
 * A low-effort way to post messages into a channel without a bot user.
 *
 * @remarks
 * One shape covers three kinds of webhook, so several fields are conditional on `type`:
 *
 * - `Incoming` webhooks carry `token`, and carry `url` only when the object came back
 *   from the OAuth2 webhook flow.
 * - `ChannelFollower` webhooks carry `source_guild` and `source_channel`, have no token
 *   and so cannot be executed.
 * - `Application` webhooks carry neither group and have `channel_id` and `guild_id` of
 *   `null`, since they belong to an application rather than to a channel.
 *
 * Nothing in the type system enforces that split — check `type` before reading a field
 * that only one kind of webhook has.
 *
 * `user` is orthogonal to all of that: it is absent whenever the webhook was fetched with
 * its token rather than with bot authorisation, whatever the type.
 */
export interface APIWebhook {
  /** The webhook's ID. */
  id: Snowflake
  /** What the webhook is for. */
  type: WebhookType
  /**
   * The ID of the guild the webhook belongs to.
   *
   * @remarks
   * Optional and nullable, which are different cases here: absent when Discord omits it,
   * and present as `null` on an `Application` webhook, which has no guild at all.
   */
  guild_id?: Snowflake | null
  /**
   * The ID of the channel the webhook posts to.
   *
   * @remarks
   * Always present but `null` for `Application` webhooks, which are executed against an
   * interaction rather than a channel.
   */
  channel_id: Snowflake | null
  /**
   * The user who created the webhook.
   *
   * @remarks
   * Not returned when the webhook is fetched or modified using its token, since that
   * route is unauthenticated and must not leak the creator.
   */
  user?: APIUser
  /** The name shown on messages the webhook posts, unless overridden per message. */
  name: string | null
  /** The avatar hash shown on messages the webhook posts, unless overridden per message. */
  avatar: string | null
  /**
   * The webhook's secret token.
   *
   * @remarks
   * `Incoming` webhooks only, and enough on its own to post as the webhook — it is a
   * credential, not an identifier. Absent for every other type.
   */
  token?: string
  /**
   * The bot or OAuth2 application that created the webhook.
   *
   * @remarks
   * `null` for a webhook created by a user through the client rather than by an app.
   */
  application_id: Snowflake | null
  /**
   * The guild containing the channel this webhook follows.
   *
   * @remarks
   * `ChannelFollower` webhooks only, and absent even then if the webhook's creator has
   * since lost access to that guild.
   */
  source_guild?: APIWebhookSourceGuild
  /**
   * The channel this webhook follows.
   *
   * @remarks
   * `ChannelFollower` webhooks only, and absent even then if the webhook's creator has
   * since lost access to the guild the followed channel is in.
   */
  source_channel?: APIWebhookSourceChannel
  /**
   * The URL used to execute the webhook.
   *
   * @remarks
   * Returned only by the OAuth2 webhook flow, not by the ordinary webhook endpoints. It
   * embeds `token`, so it is a credential too.
   */
  url?: string
}

/**
 * The guild a `ChannelFollower` webhook's followed channel lives in.
 *
 * @remarks
 * Discord documents this as a partial guild object, but pins it to these three fields in
 * its OpenAPI specification. It is not enough to identify the guild's features, owner or
 * anything else — fetch the guild if more is needed.
 */
export interface APIWebhookSourceGuild {
  /** The guild's ID. */
  id: Snowflake
  /** The guild's icon hash. */
  icon: string | null
  /** The guild's name. */
  name: string
}

/**
 * The channel a `ChannelFollower` webhook follows.
 *
 * @remarks
 * Documented as a partial channel object and pinned to these two fields in Discord's
 * OpenAPI specification. Notably there is no `type`, so this does not tell you the
 * followed channel is an announcement channel even though it always is.
 */
export interface APIWebhookSourceChannel {
  /** The channel's ID. */
  id: Snowflake
  /** The channel's name. */
  name: string
}
