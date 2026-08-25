import type {
  APIApplicationCommand,
  APIGuildApplicationCommandPermissions,
  RESTGetAPIApplicationCommandsQuery,
  RESTPatchAPIApplicationCommandJSONBody,
  RESTPostAPIApplicationCommandJSONBody,
  RESTPutAPIApplicationCommandsJSONBody,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './channels.js'

/**
 * Application command endpoints.
 *
 * @remarks
 * **Global and guild commands are the same routes with a segment inserted**, and the
 * difference that matters is not the path — it is propagation. A guild command is live
 * immediately; a global one takes up to an hour. That is why every bot's development loop
 * registers against one guild and only the release registers globally, and why these are
 * separate methods rather than one with an optional guild ID: the choice is not a parameter,
 * it is a deployment decision with a very different feedback loop.
 *
 * **`create` is not what its verb suggests.** Creating a command whose name already exists
 * does not fail — Discord updates the existing one and returns its ID. So registering the
 * same set twice is safe, and a command *removed* from the source stays registered forever.
 * {@link ApplicationCommandRoutes.setGlobal} and its guild twin are the answer to that: they
 * replace the whole set, so deleting a command from the code deletes it from Discord.
 */
export class ApplicationCommandRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Lists the application's global commands.
   *
   * @param applicationId - The application.
   * @param query - Whether to include localisation dictionaries.
   * @param options - Request options.
   * @returns The commands.
   */
  async getGlobal(
    applicationId: Snowflake,
    query: RESTGetAPIApplicationCommandsQuery = {},
    options: RouteOptions = {},
  ): Promise<APIApplicationCommand[]> {
    return await this.#rest.get<APIApplicationCommand[]>(
      `/applications/${applicationId}/commands`,
      { ...options, query: query as Record<string, string | number | boolean | undefined> },
    )
  }

  /**
   * Creates or updates one global command.
   *
   * @param applicationId - The application.
   * @param body - The command.
   * @param options - Request options.
   * @returns The command.
   *
   * @remarks
   * An existing name is updated rather than rejected, so this is safe to call on every start.
   * It cannot remove a command that is no longer in the source — see
   * {@link ApplicationCommandRoutes.setGlobal}.
   */
  async createGlobal(
    applicationId: Snowflake,
    body: RESTPostAPIApplicationCommandJSONBody,
    options: RouteOptions = {},
  ): Promise<APIApplicationCommand> {
    return await this.#rest.post<APIApplicationCommand>(`/applications/${applicationId}/commands`, {
      ...options,
      body,
    })
  }

  /**
   * Replaces every global command in one call.
   *
   * @param applicationId - The application.
   * @param body - The complete command set.
   * @param options - Request options.
   * @returns The commands as they now stand.
   *
   * @remarks
   * **Anything absent is deleted.** That is what makes this the right way to register a
   * command set: the source of truth becomes the code rather than whatever accumulated in
   * Discord's state over months of development.
   */
  async setGlobal(
    applicationId: Snowflake,
    body: RESTPutAPIApplicationCommandsJSONBody,
    options: RouteOptions = {},
  ): Promise<APIApplicationCommand[]> {
    return await this.#rest.put<APIApplicationCommand[]>(
      `/applications/${applicationId}/commands`,
      { ...options, body },
    )
  }

  /**
   * Modifies one global command.
   *
   * @param applicationId - The application.
   * @param commandId - The command to modify.
   * @param body - The fields to change.
   * @param options - Request options.
   * @returns The updated command.
   */
  async editGlobal(
    applicationId: Snowflake,
    commandId: Snowflake,
    body: RESTPatchAPIApplicationCommandJSONBody,
    options: RouteOptions = {},
  ): Promise<APIApplicationCommand> {
    return await this.#rest.patch<APIApplicationCommand>(
      `/applications/${applicationId}/commands/${commandId}`,
      { ...options, body },
    )
  }

  /**
   * Deletes one global command.
   *
   * @param applicationId - The application.
   * @param commandId - The command to delete.
   * @param options - Request options.
   */
  async deleteGlobal(
    applicationId: Snowflake,
    commandId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(
      `/applications/${applicationId}/commands/${commandId}`,
      options,
    )
  }

  /**
   * Lists the application's commands in one guild.
   *
   * @param applicationId - The application.
   * @param guildId - The guild.
   * @param query - Whether to include localisation dictionaries.
   * @param options - Request options.
   * @returns The commands.
   */
  async getForGuild(
    applicationId: Snowflake,
    guildId: Snowflake,
    query: RESTGetAPIApplicationCommandsQuery = {},
    options: RouteOptions = {},
  ): Promise<APIApplicationCommand[]> {
    return await this.#rest.get<APIApplicationCommand[]>(
      `/applications/${applicationId}/guilds/${guildId}/commands`,
      { ...options, query: query as Record<string, string | number | boolean | undefined> },
    )
  }

  /**
   * Creates or updates one command in a guild.
   *
   * @param applicationId - The application.
   * @param guildId - The guild.
   * @param body - The command.
   * @param options - Request options.
   * @returns The command.
   *
   * @remarks
   * Live immediately, unlike the global form, which is why this is the one to develop
   * against.
   */
  async createForGuild(
    applicationId: Snowflake,
    guildId: Snowflake,
    body: RESTPostAPIApplicationCommandJSONBody,
    options: RouteOptions = {},
  ): Promise<APIApplicationCommand> {
    return await this.#rest.post<APIApplicationCommand>(
      `/applications/${applicationId}/guilds/${guildId}/commands`,
      { ...options, body },
    )
  }

  /**
   * Replaces every command in a guild in one call.
   *
   * @param applicationId - The application.
   * @param guildId - The guild.
   * @param body - The complete command set.
   * @param options - Request options.
   * @returns The commands as they now stand.
   *
   * @remarks
   * Anything absent is deleted, and it takes effect immediately.
   */
  async setForGuild(
    applicationId: Snowflake,
    guildId: Snowflake,
    body: RESTPutAPIApplicationCommandsJSONBody,
    options: RouteOptions = {},
  ): Promise<APIApplicationCommand[]> {
    return await this.#rest.put<APIApplicationCommand[]>(
      `/applications/${applicationId}/guilds/${guildId}/commands`,
      { ...options, body },
    )
  }

  /**
   * Modifies one command in a guild.
   *
   * @param applicationId - The application.
   * @param guildId - The guild.
   * @param commandId - The command to modify.
   * @param body - The fields to change.
   * @param options - Request options.
   * @returns The updated command.
   */
  async editForGuild(
    applicationId: Snowflake,
    guildId: Snowflake,
    commandId: Snowflake,
    body: RESTPatchAPIApplicationCommandJSONBody,
    options: RouteOptions = {},
  ): Promise<APIApplicationCommand> {
    return await this.#rest.patch<APIApplicationCommand>(
      `/applications/${applicationId}/guilds/${guildId}/commands/${commandId}`,
      { ...options, body },
    )
  }

  /**
   * Deletes one command from a guild.
   *
   * @param applicationId - The application.
   * @param guildId - The guild.
   * @param commandId - The command to delete.
   * @param options - Request options.
   */
  async deleteForGuild(
    applicationId: Snowflake,
    guildId: Snowflake,
    commandId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(
      `/applications/${applicationId}/guilds/${guildId}/commands/${commandId}`,
      options,
    )
  }

  /**
   * Fetches the per-command permission overrides in a guild.
   *
   * @param applicationId - The application.
   * @param guildId - The guild.
   * @param options - Request options.
   * @returns One entry per command that has overrides.
   *
   * @remarks
   * Only commands with overrides appear. A command absent from this list is governed by its
   * `default_member_permissions`, which is a different mechanism and a different field.
   */
  async getPermissions(
    applicationId: Snowflake,
    guildId: Snowflake,
    options: RouteOptions = {},
  ): Promise<APIGuildApplicationCommandPermissions[]> {
    return await this.#rest.get<APIGuildApplicationCommandPermissions[]>(
      `/applications/${applicationId}/guilds/${guildId}/commands/permissions`,
      options,
    )
  }
}
