import type {
  APIAutoModerationRule,
  RESTPatchAPIAutoModerationRuleJSONBody,
  RESTPostAPIAutoModerationRuleJSONBody,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * Auto-moderation rule endpoints.
 *
 * @remarks
 * The library already mirrored the rules and emitted every one of their four gateway events,
 * and had no way to make a rule. A bot could watch auto-moderation act and not configure it.
 *
 * **A new rule is off unless `enabled` says otherwise.** The field defaults to `false`, so
 * creating one and never sending `enabled: true` produces a rule that exists, appears in the
 * client, and does nothing.
 *
 * **`trigger_type` is fixed for the rule's lifetime**, which is why {@link edit} takes a
 * different body rather than a partial of {@link create}'s. Changing what a rule watches for
 * means deleting it and making another.
 *
 * Every method needs `ManageGuild`.
 */
export class AutoModerationRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Lists a guild's auto-moderation rules.
   *
   * @param guildId - The guild.
   * @param options - Request options.
   * @returns Every rule, enabled or not.
   */
  async getRules(guildId: Snowflake, options: RouteOptions = {}): Promise<APIAutoModerationRule[]> {
    return await this.#rest.get<APIAutoModerationRule[]>(
      `/guilds/${guildId}/auto-moderation/rules`,
      options,
    )
  }

  /**
   * Fetches one rule.
   *
   * @param guildId - The guild.
   * @param ruleId - The rule.
   * @param options - Request options.
   * @returns The rule.
   */
  async getRule(
    guildId: Snowflake,
    ruleId: Snowflake,
    options: RouteOptions = {},
  ): Promise<APIAutoModerationRule> {
    return await this.#rest.get<APIAutoModerationRule>(
      `/guilds/${guildId}/auto-moderation/rules/${ruleId}`,
      options,
    )
  }

  /**
   * Creates a rule.
   *
   * @param guildId - The guild.
   * @param body - The rule to create.
   * @param options - Request options.
   * @returns The rule that was created.
   *
   * @remarks
   * Guilds are limited per trigger type rather than overall — a handful of keyword rules, one
   * spam rule, one mention-limit rule. Going over fails with a 400 naming the trigger type
   * rather than the count.
   */
  async create(
    guildId: Snowflake,
    body: RESTPostAPIAutoModerationRuleJSONBody,
    options: RouteOptions = {},
  ): Promise<APIAutoModerationRule> {
    return await this.#rest.post<APIAutoModerationRule>(
      `/guilds/${guildId}/auto-moderation/rules`,
      { ...options, body },
    )
  }

  /**
   * Edits a rule.
   *
   * @param guildId - The guild.
   * @param ruleId - The rule.
   * @param body - The fields to change.
   * @param options - Request options.
   * @returns The updated rule.
   *
   * @remarks
   * `exempt_roles` and `exempt_channels` replace their lists rather than adding to them, so
   * sending one ID to exempt a channel un-exempts every other.
   */
  async edit(
    guildId: Snowflake,
    ruleId: Snowflake,
    body: RESTPatchAPIAutoModerationRuleJSONBody,
    options: RouteOptions = {},
  ): Promise<APIAutoModerationRule> {
    return await this.#rest.patch<APIAutoModerationRule>(
      `/guilds/${guildId}/auto-moderation/rules/${ruleId}`,
      { ...options, body },
    )
  }

  /**
   * Deletes a rule.
   *
   * @param guildId - The guild.
   * @param ruleId - The rule.
   * @param options - Request options.
   */
  async delete(guildId: Snowflake, ruleId: Snowflake, options: RouteOptions = {}): Promise<void> {
    await this.#rest.delete<undefined>(
      `/guilds/${guildId}/auto-moderation/rules/${ruleId}`,
      options,
    )
  }
}
