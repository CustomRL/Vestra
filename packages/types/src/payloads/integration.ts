import type { ISO8601Timestamp, Snowflake } from '../globals.js'
import type { IntegrationExpireBehavior, IntegrationType } from '../enums/integration.js'
import type { APIUser } from './user.js'

/**
 * A link between a guild and something outside it: an external subscription service, a
 * bot, or the guild's own role subscriptions.
 *
 * @remarks
 * One shape covers four unrelated things, so most fields are conditional on `type`:
 *
 * - `Twitch` and `YouTube` integrations sync an external subscriber list into a guild
 *   role. They carry `syncing`, `role_id`, `enable_emoticons`, `expire_behavior`,
 *   `expire_grace_period`, `synced_at`, `subscriber_count` and `revoked`.
 * - `Discord` integrations represent a bot or OAuth2 application added to the guild.
 *   They carry `application` and `scopes`, and none of the fields above — Discord's
 *   documentation marks that whole group as not provided for discord bot integrations.
 * - `GuildSubscription` integrations back the guild's own role subscription tiers and
 *   carry neither group.
 *
 * Nothing in the type system enforces that split — check `type` before reading a field
 * that only one kind of integration has.
 *
 * `user` is separately unreliable: Discord notes that some older integrations have no
 * attached user, and the gateway strips it from INTEGRATION_CREATE and INTEGRATION_UPDATE
 * entirely. See {@link APIIntegrationModifyData}.
 */
export interface APIIntegration {
  /**
   * The integration's ID.
   *
   * @remarks
   * A snowflake for `Discord` and `GuildSubscription` integrations. For `Twitch` and
   * `YouTube` it is the external service's own identifier, which Discord's OpenAPI
   * specification types as a plain string rather than a snowflake — do not assume it is
   * sortable by creation time or that it parses as a 64-bit integer.
   */
  id: Snowflake
  /**
   * The integration's name.
   *
   * @remarks
   * Discord's OpenAPI specification marks this nullable on every integration variant even
   * though the documentation tables do not, so it is typed nullable here: a consumer that
   * trusted the tables would crash on the null rather than handle it.
   */
  name: string | null
  /** The service this integration connects the guild to. */
  type: IntegrationType
  /** Whether the integration is enabled. */
  enabled: boolean
  /** Whether the integration is currently syncing. Not sent for `Discord` integrations. */
  syncing?: boolean
  /**
   * The role granted to the external service's subscribers.
   *
   * @remarks
   * Nullable as well as optional: Discord's specification allows the field to be present
   * and `null` on an integration that has not been given a role to sync into.
   */
  role_id?: Snowflake | null
  /** Whether the service's emoticons are synced into the guild. Twitch only, currently. */
  enable_emoticons?: boolean
  /** What happens to a subscriber once their subscription lapses. */
  expire_behavior?: IntegrationExpireBehavior
  /**
   * How many days a lapsed subscriber keeps their role before `expire_behavior` applies.
   *
   * @remarks
   * Discord's specification restricts this to 1, 3, 7, 14 or 30. It is left as a plain
   * number because the API owns that list, not this package.
   */
  expire_grace_period?: number
  /**
   * The user who added the integration to the guild.
   *
   * @remarks
   * Absent on older integrations, and always absent on the INTEGRATION_CREATE and
   * INTEGRATION_UPDATE gateway events.
   */
  user?: APIUser
  /** The account on the external service that this integration is attached to. */
  account: APIIntegrationAccount
  /** When the integration last synced. Not sent for `Discord` integrations. */
  synced_at?: ISO8601Timestamp
  /** How many subscribers the integration has. Not sent for `Discord` integrations. */
  subscriber_count?: number
  /** Whether the integration has been revoked. Not sent for `Discord` integrations. */
  revoked?: boolean
  /** The bot or OAuth2 application behind a `Discord` integration. */
  application?: APIIntegrationApplication
  /**
   * The OAuth2 scopes the application was authorised for.
   *
   * @remarks
   * `Discord` integrations only. Discord's specification permits exactly
   * `applications.commands`, `bot` and `webhook.incoming` here, but the values are typed
   * as plain strings because this package does not yet model the OAuth2 scope list.
   */
  scopes?: string[]
}

/**
 * The account on the external service that an integration is attached to.
 *
 * @remarks
 * `id` is the service's own identifier — a Twitch or YouTube channel ID — so it is a
 * plain string, not a snowflake. On `Discord` integrations it happens to be the
 * application's ID and so does parse as one, but nothing guarantees that across types.
 */
export interface APIIntegrationAccount {
  /** The account's ID on the external service. */
  id: string
  /**
   * The account's name.
   *
   * @remarks
   * Marked nullable by Discord's OpenAPI specification, which the documentation tables do
   * not reflect. Typed nullable here for the same reason as the integration's own `name`.
   */
  name: string | null
}

/**
 * The bot or OAuth2 application behind a `Discord` integration.
 *
 * @remarks
 * A cut-down application object. It is not the full application resource and carries none
 * of the ownership, flag or install-parameter fields that one has.
 */
export interface APIIntegrationApplication {
  /** The application's ID. */
  id: Snowflake
  /** The application's name. */
  name: string
  /** The application's icon hash. */
  icon: string | null
  /** The application's description. */
  description: string
  /**
   * The application's cover image hash.
   *
   * @remarks
   * In Discord's OpenAPI specification but not in the documented table for this object,
   * so it is optional here and should not be relied on.
   */
  cover_image?: string
  /**
   * The ID of the application's primary SKU.
   *
   * @remarks
   * In Discord's OpenAPI specification but not in the documented table for this object,
   * so it is optional here and should not be relied on.
   */
  primary_sku_id?: Snowflake
  /** The bot user attached to the application. */
  bot?: APIUser
}

/**
 * The data carried by the INTEGRATION_CREATE and INTEGRATION_UPDATE gateway events.
 *
 * @remarks
 * The integration object with `user` removed and a `guild_id` added. Both events use this
 * one shape; only the event name distinguishes them.
 *
 * `user` is dropped by the gateway rather than merely being optional, so an integration
 * cached from a dispatch never has one even where the REST resource would.
 */
export interface APIIntegrationModifyData extends Omit<APIIntegration, 'user'> {
  /** The ID of the guild the integration belongs to. */
  guild_id: Snowflake
}

/**
 * The data carried by the INTEGRATION_DELETE gateway event.
 *
 * @remarks
 * Nothing of the integration survives the delete but its ID, so a consumer that wants to
 * know what was removed must have cached it beforehand.
 */
export interface APIIntegrationDeleteData {
  /** The ID of the deleted integration. */
  id: Snowflake
  /** The ID of the guild the integration belonged to. */
  guild_id: Snowflake
  /** The application behind the integration, for `Discord` integrations. */
  application_id?: Snowflake
}

/**
 * The data carried by the GUILD_INTEGRATIONS_UPDATE gateway event.
 *
 * @remarks
 * A bare notification: it names the guild and nothing else, not even which integration
 * changed. Acting on it means refetching the guild's integrations.
 */
export interface APIGuildIntegrationsUpdateData {
  /** The ID of the guild whose integrations changed. */
  guild_id: Snowflake
}
