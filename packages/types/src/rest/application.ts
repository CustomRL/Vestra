import type { ApplicationEventWebhookStatus } from '../enums/application.js'
import type { ApplicationIntegrationType } from '../enums/interaction.js'
import type {
  APIApplication,
  APIApplicationIntegrationTypeConfiguration,
  APIApplicationInstallParams,
} from '../payloads/application.js'

/**
 * Application bodies and results.
 *
 * @remarks
 * **Most of `APIApplication` is not editable**, which is why the patch body is a short list
 * rather than a partial of the payload. Discord sets `flags`, `verify_key`, `team`,
 * `approximate_guild_count` and the badges itself, and the privileged intent flags are toggled
 * in the developer portal rather than over the API — expressing the edit as
 * `Partial<APIApplication>` would offer a caller twenty fields that do nothing.
 */

/** The result of `GET /applications/@me`. */
export type RESTGetCurrentApplicationResult = APIApplication

/**
 * `PATCH /applications/@me`
 *
 * @remarks
 * **Setting `interactions_endpoint_url` or `event_webhooks_url` is validated by Discord
 * calling it.** The request fails unless the URL is live and correctly answers a `PING` with a
 * valid signature, so this is not a field that can be set ahead of a deployment.
 *
 * `integration_types_config` replaces the whole map. A context left out of it becomes
 * uninstallable, which is different from being present with no defaults.
 */
export interface RESTPatchCurrentApplicationJSONBody {
  /** A new custom install link, used instead of `install_params`. */
  custom_install_url?: string
  /** A new description. */
  description?: string
  /** Where role-connection verification sends users. */
  role_connections_verification_url?: string
  /** The default install link's scopes and permissions. */
  install_params?: APIApplicationInstallParams
  /** Per-context install configuration. Replaces the whole map. */
  integration_types_config?: Partial<
    Record<`${ApplicationIntegrationType}`, APIApplicationIntegrationTypeConfiguration>
  >
  /** {@link ApplicationFlags}, as a bit set. Only the intent-limited flags may be cleared. */
  flags?: number
  /** A new icon, as a data URI. */
  icon?: string | null
  /** A new rich-presence cover image, as a data URI. */
  cover_image?: string | null
  /**
   * Where interactions are delivered when not over the gateway.
   *
   * @remarks
   * Discord calls it to check before accepting the change, so it has to be live already.
   */
  interactions_endpoint_url?: string
  /** Up to five descriptive tags. */
  tags?: string[]
  /**
   * Where webhook events are delivered.
   *
   * @remarks
   * Validated the same way as `interactions_endpoint_url`.
   */
  event_webhooks_url?: string
  /** Whether webhook events are on. `DisabledByDiscord` is not settable. */
  event_webhooks_status?: ApplicationEventWebhookStatus
  /** Which events to deliver. */
  event_webhooks_types?: string[]
}

/** The result of `PATCH /applications/@me`. */
export type RESTPatchCurrentApplicationResult = APIApplication
