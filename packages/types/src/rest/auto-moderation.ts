import type { Snowflake } from '../globals.js'
import type {
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
} from '../enums/auto-moderation.js'
import type {
  APIAutoModerationAction,
  APIAutoModerationRule,
  APIAutoModerationTriggerMetadata,
} from '../payloads/auto-moderation.js'

/**
 * Auto-moderation rule bodies and results.
 *
 * @remarks
 * **`trigger_type` is fixed at creation**, which is why the edit body is not simply the
 * create body made partial: changing what a rule triggers on means deleting it and making
 * another. Discord rejects the field on a `PATCH` rather than ignoring it.
 *
 * **Guilds are limited per trigger type**, not overall — a handful of keyword rules, one
 * spam rule, one mention-limit rule. Creating past the limit fails with a 400 that names the
 * trigger type rather than the count.
 */

/** The result of `GET /guilds/{guild.id}/auto-moderation/rules`. */
export type RESTGetAPIAutoModerationRulesResult = APIAutoModerationRule[]

/** The result of `GET /guilds/{guild.id}/auto-moderation/rules/{rule.id}`. */
export type RESTGetAPIAutoModerationRuleResult = APIAutoModerationRule

/**
 * `POST /guilds/{guild.id}/auto-moderation/rules`
 */
export interface RESTPostAPIAutoModerationRuleJSONBody {
  /** The rule's name. */
  name: string
  /** Which event the rule inspects. Only `MessageSend` exists today. */
  event_type: AutoModerationRuleEventType
  /** What the rule triggers on. Cannot be changed afterwards. */
  trigger_type: AutoModerationRuleTriggerType
  /**
   * The trigger's configuration.
   *
   * @remarks
   * Which fields are read depends entirely on `trigger_type`, and sending the wrong ones is
   * a 400 rather than a silent ignore. Required for every trigger except `Spam`, which has
   * nothing to configure.
   */
  trigger_metadata?: APIAutoModerationTriggerMetadata
  /** What to do when it fires. At least one. */
  actions: APIAutoModerationAction[]
  /** Whether the rule is live. Defaults to `false`, so a new rule does nothing until enabled. */
  enabled?: boolean
  /** Roles the rule ignores, at most 20. */
  exempt_roles?: Snowflake[]
  /** Channels the rule ignores, at most 50. */
  exempt_channels?: Snowflake[]
}

/** The result of `POST /guilds/{guild.id}/auto-moderation/rules`. */
export type RESTPostAPIAutoModerationRuleResult = APIAutoModerationRule

/**
 * `PATCH /guilds/{guild.id}/auto-moderation/rules/{rule.id}`
 *
 * @remarks
 * Everything the create body takes except `trigger_type`, which is fixed for the rule's
 * lifetime. `exempt_roles` and `exempt_channels` replace their lists rather than adding to
 * them.
 */
export type RESTPatchAPIAutoModerationRuleJSONBody = Partial<
  Omit<RESTPostAPIAutoModerationRuleJSONBody, 'trigger_type'>
>

/** The result of `PATCH /guilds/{guild.id}/auto-moderation/rules/{rule.id}`. */
export type RESTPatchAPIAutoModerationRuleResult = APIAutoModerationRule
