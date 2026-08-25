import type { APIInvite, RESTGetAPIInviteQuery } from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * Invite endpoints.
 *
 * @remarks
 * **Keyed by a code, not a snowflake**, which is why these are their own namespace rather
 * than methods on `channels`. The code is a user-visible string that a guild with the vanity
 * feature chooses for itself, so it is the one resource identifier in the API that is neither
 * an ID nor guaranteed to look like one — and it is percent-encoded on the way into the path
 * for exactly that reason.
 *
 * Creating and listing invites belongs to the channel and guild that own them, so those live
 * on `channels` and `guilds`; only the two routes addressed by code alone are here.
 */
export class InviteRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Fetches an invite by its code.
   *
   * @param code - The invite code, without the `discord.gg/` prefix.
   * @param query - What to include.
   * @param options - Request options.
   * @returns The invite.
   *
   * @remarks
   * The member and presence counts are **approximate** and absent unless `with_counts` asks
   * for them: computing them costs Discord a scan it will not do by default.
   */
  async get(
    code: string,
    query: RESTGetAPIInviteQuery = {},
    options: RouteOptions = {},
  ): Promise<APIInvite> {
    return await this.#rest.get<APIInvite>(`/invites/${encodeURIComponent(code)}`, {
      ...options,
      query: query as Record<string, string | number | boolean | undefined>,
    })
  }

  /**
   * Deletes an invite. Needs `ManageChannels` on its channel or `ManageGuild` on its guild.
   *
   * @param code - The invite code.
   * @param options - Request options.
   * @returns The invite that was deleted.
   */
  async delete(code: string, options: RouteOptions = {}): Promise<APIInvite> {
    return await this.#rest.delete<APIInvite>(`/invites/${encodeURIComponent(code)}`, options)
  }
}
