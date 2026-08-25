import type { Snowflake } from '../globals.js'
import type { ApplicationEventWebhookStatus, TeamMembershipState } from '../enums/application.js'
import type { ApplicationIntegrationType } from '../enums/interaction.js'
import type { APIGuild } from './guild.js'
import type { APIUser } from './user.js'

/**
 * One person on the team that owns an application.
 */
export interface APITeamMember {
  /** Whether they have accepted the invitation. */
  membership_state: TeamMembershipState
  /** The team they belong to. */
  team_id: Snowflake
  /** The user, partial: `avatar`, `discriminator`, `id` and `username` only. */
  user: APIUser
  /** Their role on the team, as one of `admin`, `developer`, `read_only` or the owner's `''`. */
  role: string
}

/**
 * A team that owns an application.
 *
 * @remarks
 * An application has an `owner` **or** a `team`, never both meaningfully: a team-owned
 * application still reports an `owner`, and it is a synthetic user standing in for the team
 * rather than a person. Reading `owner.id` to find out who to contact gets a team ID wearing a
 * user's shape.
 */
export interface APITeam {
  /** The team's icon hash. */
  icon: string | null
  /** The team's ID. */
  id: Snowflake
  /** The members. */
  members: APITeamMember[]
  /** The team's name. */
  name: string
  /** Who owns the team. */
  owner_user_id: Snowflake
}

/**
 * The scopes and permissions an application's default install link asks for.
 */
export interface APIApplicationInstallParams {
  /** The OAuth2 scopes to request. */
  scopes: string[]
  /** The permissions to request in the bot's role, as a decimal string. */
  permissions: string
}

/**
 * How an application installs for one context.
 *
 * @remarks
 * Present but **empty** for a context the application supports with no default install link,
 * which is different from the context being absent. An empty object means "installable here,
 * no defaults"; a missing key means "not installable here at all".
 */
export interface APIApplicationIntegrationTypeConfiguration {
  /** The default scopes and permissions for this context. */
  oauth2_install_params?: APIApplicationInstallParams
}

/**
 * An application, as `GET /applications/@me` returns it.
 *
 * @remarks
 * **Not the same shape the gateway sends.** READY carries `{ id, flags }` and nothing else, so
 * `client.application` is not a substitute for fetching this — most of what is here has never
 * been on a dispatch.
 *
 * Most fields are read-only in practice. Discord sets `flags`, `approximate_guild_count`,
 * `verify_key`, `team` and the badges in response to approvals and portal toggles, and rejects
 * or ignores them on an edit.
 */
export interface APIApplication {
  /** The application's ID. */
  id: Snowflake
  /** The name shown to users. */
  name: string
  /** The icon hash. */
  icon: string | null
  /** The description shown on the profile. */
  description: string
  /** Origins the RPC endpoint accepts, if RPC is enabled. */
  rpc_origins?: string[]
  /** Whether anybody may add the bot, or only its owner. */
  bot_public: boolean
  /** Whether the install flow completes the full OAuth2 code grant. */
  bot_require_code_grant: boolean
  /** The bot user, partial. */
  bot?: APIUser
  /** A link to the terms of service. */
  terms_of_service_url?: string
  /** A link to the privacy policy. */
  privacy_policy_url?: string
  /**
   * The owner, partial.
   *
   * @remarks
   * A team-owned application reports a synthetic user standing in for the team rather than a
   * person — see {@link APITeam}.
   */
  owner?: APIUser
  /** The key used to verify interaction signatures. */
  verify_key: string
  /** The team that owns it, or `null` when a person does. */
  team: APITeam | null
  /** The guild it is associated with, when it has one. */
  guild_id?: Snowflake
  /** That guild, partial. */
  guild?: Partial<APIGuild>
  /** The primary SKU, for a game sold on Discord. */
  primary_sku_id?: Snowflake
  /** The URL slug for the store page. */
  slug?: string
  /** The default rich-presence invite cover image hash. */
  cover_image?: string
  /** {@link ApplicationFlags}, as a bit set. */
  flags?: number
  /** Roughly how many guilds it is in. */
  approximate_guild_count?: number
  /** Roughly how many users have installed it to their account. */
  approximate_user_install_count?: number
  /** Redirect URIs the OAuth2 flow accepts. */
  redirect_uris?: string[]
  /** Where interactions are delivered when not over the gateway. */
  interactions_endpoint_url?: string | null
  /** Where the role-connection verification flow sends users. */
  role_connections_verification_url?: string | null
  /** Where webhook events are delivered. */
  event_webhooks_url?: string | null
  /** Whether webhook events are on, and who decided. */
  event_webhooks_status?: ApplicationEventWebhookStatus
  /** Which events are delivered to that URL. */
  event_webhooks_types?: string[]
  /** Up to five descriptive tags. */
  tags?: string[]
  /** The default install link's scopes and permissions. */
  install_params?: APIApplicationInstallParams
  /** Per-context install configuration, keyed by {@link ApplicationIntegrationType}. */
  integration_types_config?: Partial<
    Record<`${ApplicationIntegrationType}`, APIApplicationIntegrationTypeConfiguration>
  >
  /** A custom install link, used instead of `install_params` when set. */
  custom_install_url?: string
}
