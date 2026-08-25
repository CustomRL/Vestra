import type { APIApplication, RESTPatchCurrentApplicationJSONBody, Snowflake } from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * The application itself.
 *
 * @remarks
 * Its own namespace rather than a member of `commands`, because those two are different
 * things wearing the same word: `commands` registers what the application can be asked to do,
 * this is the application's own profile, install configuration and approvals.
 *
 * **`client.application` is not a substitute for reading this.** The gateway's READY carries
 * `{ id, flags }` and nothing else, so the description, install parameters, team, endpoints and
 * guild count have never been on a dispatch.
 *
 * **The privileged intent flags come in pairs.** Discord sets the plain flag when an
 * application is verified and approved, and the `Limited` flag when it is under a hundred
 * guilds and has simply toggled the intent on in the portal. Both grant the intent, so a check
 * that reads only the plain one reports a missing intent that is currently in use — and does
 * so exactly while the application is small enough for it to matter.
 */
export class ApplicationRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Fetches the application the token belongs to.
   *
   * @param options - Request options.
   * @returns The application.
   *
   * @remarks
   * `approximate_guild_count` is the cheapest honest answer to "how many guilds am I in" —
   * cheaper than paging `users.getGuilds`, and available before the gateway has finished
   * streaming them.
   */
  async getCurrent(options: RouteOptions = {}): Promise<APIApplication> {
    return await this.#rest.get<APIApplication>('/applications/@me', options)
  }

  /**
   * Edits the application's profile and install configuration.
   *
   * @param body - The fields to change.
   * @param options - Request options.
   * @returns The updated application.
   *
   * @remarks
   * **Setting `interactions_endpoint_url` or `event_webhooks_url` makes Discord call it.** The
   * request fails unless the URL is already live and answers a `PING` with a valid signature,
   * so neither can be set ahead of a deployment — which is the opposite of how every other
   * field here behaves.
   *
   * `integration_types_config` replaces the whole map. A context left out becomes
   * uninstallable, which is not the same as being present with no defaults.
   *
   * Most of what {@link ApplicationRoutes.getCurrent} returns cannot be sent back: `flags`,
   * `verify_key`, `team`, the counts and the badges are Discord's, and the body type says so by
   * being a short list rather than a partial of the payload.
   */
  async editCurrent(
    body: RESTPatchCurrentApplicationJSONBody,
    options: RouteOptions = {},
  ): Promise<APIApplication> {
    return await this.#rest.patch<APIApplication>('/applications/@me', { ...options, body })
  }

  /**
   * Fetches any application by ID.
   *
   * @param applicationId - The application.
   * @param options - Request options.
   * @returns The application, as much of it as is public.
   *
   * @remarks
   * A public view: the owner, team, endpoints and counts are absent for anything but the
   * caller's own application, so this answers "what is this bot" rather than "what is it
   * configured as".
   */
  async get(applicationId: Snowflake, options: RouteOptions = {}): Promise<APIApplication> {
    return await this.#rest.get<APIApplication>(`/applications/${applicationId}`, options)
  }
}
