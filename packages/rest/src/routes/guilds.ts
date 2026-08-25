import type {
  APIChannel,
  APIGuild,
  APIGuildPreview,
  APIGuildWelcomeScreen,
  APIInvite,
  RESTGetAPIGuildIntegrationsResult,
  RESTGetAPIGuildPruneCountQuery,
  RESTGetAPIGuildPruneCountResult,
  RESTGetAPIGuildVanityURLResult,
  RESTGetAPIGuildVoiceRegionsResult,
  RESTPatchAPIGuildChannelPositionsJSONBody,
  RESTPatchAPIGuildJSONBody,
  RESTPatchAPIGuildWelcomeScreenJSONBody,
  RESTPostAPIGuildPruneJSONBody,
  RESTPostAPIGuildPruneResult,
  RESTPostAPIGuildChannelJSONBody,
  RESTGetAPIGuildThreadsResult,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * The guild itself, and the channels and invites it owns.
 *
 * @remarks
 * Members, bans and roles have their own namespaces. Each is a resource in its own right with
 * its own permissions, and one class holding all four had grown past the point where any of
 * them was findable.
 */
export class GuildRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Fetches a guild.
   *
   * @param guildId - The guild to fetch.
   * @param withCounts - Whether to include approximate member and presence counts.
   * @param options - Request options.
   * @returns The guild.
   */
  async get(guildId: Snowflake, withCounts = false, options: RouteOptions = {}): Promise<APIGuild> {
    return await this.#rest.get<APIGuild>(`/guilds/${guildId}`, {
      ...options,
      query: { with_counts: withCounts },
    })
  }

  /**
   * Edits a guild. Needs `ManageGuild`.
   *
   * @param guildId - The guild.
   * @param body - The fields to change.
   * @param options - Request options.
   * @returns The updated guild.
   *
   * @remarks
   * **`features` is the complete list**, so sending one removes the rest — and only a handful
   * are settable at all, the others being granted by Discord and rejected here.
   *
   * Several fields are not independently valid. Turning `COMMUNITY` on needs
   * `rules_channel_id` and `public_updates_channel_id` in the same request, and turning it off
   * clears them; transferring ownership through `owner_id` works only for the current owner
   * and needs MFA on the account.
   */
  async edit(
    guildId: Snowflake,
    body: RESTPatchAPIGuildJSONBody,
    options: RouteOptions = {},
  ): Promise<APIGuild> {
    return await this.#rest.patch<APIGuild>(`/guilds/${guildId}`, { ...options, body })
  }

  /**
   * Deletes a guild. The bot must own it.
   *
   * @param guildId - The guild.
   * @param options - Request options.
   *
   * @remarks
   * Irreversible, and not how a bot leaves a guild it does not own — that is
   * `DELETE /users/@me/guilds/{id}`.
   */
  async delete(guildId: Snowflake, options: RouteOptions = {}): Promise<void> {
    await this.#rest.delete<undefined>(`/guilds/${guildId}`, options)
  }

  /**
   * Fetches the public preview of a discoverable guild.
   *
   * @param guildId - The guild.
   * @param options - Request options.
   * @returns The preview.
   *
   * @remarks
   * The only guild shape readable without being a member: any guild with `DISCOVERABLE`
   * answers this, which is what makes it a usable "should I join" check. Both counts are
   * approximate.
   */
  async getPreview(guildId: Snowflake, options: RouteOptions = {}): Promise<APIGuildPreview> {
    return await this.#rest.get<APIGuildPreview>(`/guilds/${guildId}/preview`, options)
  }

  /**
   * Counts how many members a prune would remove, without removing any.
   *
   * @param guildId - The guild.
   * @param query - The inactivity window, and which roles to count as prunable.
   * @param options - Request options.
   * @returns How many would go.
   *
   * @remarks
   * **`include_roles` decides whether the number means anything.** By default a prune counts
   * only members with *no* roles at all, so on a guild that auto-assigns a role on join the
   * answer is zero and the prune that follows removes nobody. Discord sends it as a
   * comma-separated list rather than repeated parameters, which is why the query takes a
   * string here and an array on the prune itself.
   */
  async getPruneCount(
    guildId: Snowflake,
    query: RESTGetAPIGuildPruneCountQuery = {},
    options: RouteOptions = {},
  ): Promise<RESTGetAPIGuildPruneCountResult> {
    return await this.#rest.get<RESTGetAPIGuildPruneCountResult>(`/guilds/${guildId}/prune`, {
      ...options,
      query: query as Record<string, string | number | boolean | undefined>,
    })
  }

  /**
   * Removes inactive members. Needs `ManageGuild` and `KickMembers`.
   *
   * @param guildId - The guild.
   * @param body - The inactivity window, which roles to prune, and whether to count.
   * @param options - Request options.
   * @returns How many were removed, or `null` when the count was not computed.
   *
   * @remarks
   * **`compute_prune_count` defaults to `true` and is the wrong default on a large guild.**
   * It makes the request wait for a count Discord has to compute, so the route times out
   * rather than failing to prune — the prune still happens and the caller sees an error. Send
   * `false` on anything big and expect `pruned` to be `null`.
   */
  async prune(
    guildId: Snowflake,
    body: RESTPostAPIGuildPruneJSONBody = {},
    options: RouteOptions = {},
  ): Promise<RESTPostAPIGuildPruneResult> {
    return await this.#rest.post<RESTPostAPIGuildPruneResult>(`/guilds/${guildId}/prune`, {
      ...options,
      body,
    })
  }

  /**
   * Lists the voice regions a guild can use.
   *
   * @param guildId - The guild.
   * @param options - Request options.
   * @returns The regions, including any VIP ones the guild has.
   *
   * @remarks
   * `id` is what a voice channel's `rtc_region` holds. Deprecated regions still work and still
   * appear, so filtering them out is the caller's decision.
   */
  async getVoiceRegions(
    guildId: Snowflake,
    options: RouteOptions = {},
  ): Promise<RESTGetAPIGuildVoiceRegionsResult> {
    return await this.#rest.get<RESTGetAPIGuildVoiceRegionsResult>(
      `/guilds/${guildId}/regions`,
      options,
    )
  }

  /**
   * Reads a guild's vanity invite. Needs `ManageGuild`.
   *
   * @param guildId - The guild.
   * @param options - Request options.
   * @returns The code and how often it has been used.
   *
   * @remarks
   * A partial invite: the code and a use count, nothing else. `code` is `null` on a guild that
   * has the feature and has not set one, which is different from a 404 for a guild that cannot
   * have one at all.
   */
  async getVanityUrl(
    guildId: Snowflake,
    options: RouteOptions = {},
  ): Promise<RESTGetAPIGuildVanityURLResult> {
    return await this.#rest.get<RESTGetAPIGuildVanityURLResult>(
      `/guilds/${guildId}/vanity-url`,
      options,
    )
  }

  /**
   * Reads a community guild's welcome screen.
   *
   * @param guildId - The guild.
   * @param options - Request options.
   * @returns The screen.
   */
  async getWelcomeScreen(
    guildId: Snowflake,
    options: RouteOptions = {},
  ): Promise<APIGuildWelcomeScreen> {
    return await this.#rest.get<APIGuildWelcomeScreen>(`/guilds/${guildId}/welcome-screen`, options)
  }

  /**
   * Edits a community guild's welcome screen. Needs `ManageGuild`.
   *
   * @param guildId - The guild.
   * @param body - The fields to change.
   * @param options - Request options.
   * @returns The updated screen.
   *
   * @remarks
   * `welcome_channels` replaces the list. `enabled` is what actually shows the panel, so a
   * screen configured with channels and left disabled is invisible — which is exactly where a
   * caller who only sent channels ends up.
   */
  async editWelcomeScreen(
    guildId: Snowflake,
    body: RESTPatchAPIGuildWelcomeScreenJSONBody,
    options: RouteOptions = {},
  ): Promise<APIGuildWelcomeScreen> {
    return await this.#rest.patch<APIGuildWelcomeScreen>(`/guilds/${guildId}/welcome-screen`, {
      ...options,
      body,
    })
  }

  /**
   * Moves channels, and optionally between categories. Needs `ManageChannels`.
   *
   * @param guildId - The guild.
   * @param body - The channels to move and where to.
   * @param options - Request options.
   *
   * @remarks
   * **A `PATCH` on the collection**, like the role equivalent, because positions are
   * contiguous within a category and moving one renumbers its siblings.
   *
   * `lock_permissions` decides whether a channel adopts its new category's overwrites.
   * Omitting it keeps the old ones, which is how a channel ends up inside a private category
   * and still publicly readable.
   */
  async setChannelPositions(
    guildId: Snowflake,
    body: RESTPatchAPIGuildChannelPositionsJSONBody,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.patch<undefined>(`/guilds/${guildId}/channels`, { ...options, body })
  }

  /**
   * Lists a guild's integrations. Needs `ManageGuild`.
   *
   * @param guildId - The guild.
   * @param options - Request options.
   * @returns At most fifty integrations, each partial.
   *
   * @remarks
   * Capped at fifty by Discord with no pagination, so a guild with more has no way to list the
   * rest. Each entry omits `user` and the OAuth-only fields.
   */
  async getIntegrations(
    guildId: Snowflake,
    options: RouteOptions = {},
  ): Promise<RESTGetAPIGuildIntegrationsResult> {
    return await this.#rest.get<RESTGetAPIGuildIntegrationsResult>(
      `/guilds/${guildId}/integrations`,
      options,
    )
  }

  /**
   * Removes an integration and everything it created. Needs `ManageGuild`.
   *
   * @param guildId - The guild.
   * @param integrationId - The integration.
   * @param options - Request options.
   *
   * @remarks
   * **Deletes what the integration owns, not just the link.** Any role it created and any
   * webhook it made go with it, and members who had that role lose it. That is Discord's
   * behaviour rather than a convenience here, and it is why the route is worth a sentence.
   */
  async deleteIntegration(
    guildId: Snowflake,
    integrationId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(`/guilds/${guildId}/integrations/${integrationId}`, options)
  }

  /**
   * Fetches a guild's channels.
   *
   * @param guildId - The guild to read.
   * @param options - Request options.
   * @returns Every channel, excluding threads.
   *
   * @remarks
   * Threads are not included — Discord serves those from
   * `GET /guilds/{id}/threads/active`, which is a different shape and a different permission.
   */
  async getChannels(guildId: Snowflake, options: RouteOptions = {}): Promise<APIChannel[]> {
    return await this.#rest.get<APIChannel[]>(`/guilds/${guildId}/channels`, options)
  }

  /**
   * Creates a channel. Needs `ManageChannels`.
   *
   * @param guildId - The guild to create it in.
   * @param body - What to create.
   * @param options - Request options.
   * @returns The new channel.
   *
   * @remarks
   * `position` is advisory: creating a channel renumbers its siblings, so the position that
   * comes back is the one to believe rather than the one that was asked for.
   */
  async createChannel(
    guildId: Snowflake,
    body: RESTPostAPIGuildChannelJSONBody,
    options: RouteOptions = {},
  ): Promise<APIChannel> {
    return await this.#rest.post<APIChannel>(`/guilds/${guildId}/channels`, { ...options, body })
  }

  /**
   * Lists a guild's invites. Needs `ManageGuild`.
   *
   * @param guildId - The guild to read.
   * @param options - Request options.
   * @returns Every invite in the guild, across all its channels.
   */
  async getInvites(guildId: Snowflake, options: RouteOptions = {}): Promise<APIInvite[]> {
    return await this.#rest.get<APIInvite[]>(`/guilds/${guildId}/invites`, options)
  }

  /**
   * Lists a guild's active threads.
   *
   * @param guildId - The guild to read.
   * @param options - Request options.
   * @returns The threads, and the current user's membership of each one it belongs to.
   *
   * @remarks
   * `members` carries only the **current user's** memberships — one entry per thread it is
   * in, not every member of every thread, which would be unbounded. Archived threads are not
   * included; those are paginated per channel.
   */
  async getActiveThreads(
    guildId: Snowflake,
    options: RouteOptions = {},
  ): Promise<RESTGetAPIGuildThreadsResult> {
    return await this.#rest.get<RESTGetAPIGuildThreadsResult>(
      `/guilds/${guildId}/threads/active`,
      options,
    )
  }
}
