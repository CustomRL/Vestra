import type { Snowflake } from '../globals.js'
import type {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
} from '../enums/auto-moderation.js'

/**
 * A guild rule that inspects content and executes actions when it matches.
 *
 * @remarks
 * Every Auto Moderation resource, the four gateway events included, is only visible to
 * bots with `ManageGuild` — a bot without it never sees a rule at all, rather than seeing
 * a reduced one.
 *
 * `trigger_type` decides which fields of `trigger_metadata` are populated. Nothing in the
 * type system ties the two together, so narrow on `trigger_type` before reading metadata.
 */
export interface APIAutoModerationRule {
  /** The rule's ID. */
  id: Snowflake
  /** The ID of the guild the rule belongs to. */
  guild_id: Snowflake
  /** The rule's name. */
  name: string
  /**
   * The ID of the user who first created the rule.
   *
   * @remarks
   * The original creator, not whoever last edited it. Editing a rule does not move it.
   */
  creator_id: Snowflake
  /** The event context in which the rule is checked. */
  event_type: AutoModerationRuleEventType
  /** The kind of content the rule inspects. */
  trigger_type: AutoModerationRuleTriggerType
  /** Configuration specific to `trigger_type`. */
  trigger_metadata: APIAutoModerationTriggerMetadata
  /** The actions executed when the rule matches. */
  actions: APIAutoModerationAction[]
  /** Whether the rule is enabled. Rules are created disabled unless asked otherwise. */
  enabled: boolean
  /** The IDs of roles the rule ignores, at most 20. */
  exempt_roles: Snowflake[]
  /** The IDs of channels the rule ignores, at most 50. */
  exempt_channels: Snowflake[]
}

/**
 * The trigger-specific configuration of a rule.
 *
 * @remarks
 * One shape covers every trigger type, so every field is optional and which of them
 * Discord actually sends follows from the rule's `trigger_type`:
 *
 * - `Keyword` and `MemberProfile`: `keyword_filter`, `regex_patterns`, `allow_list`.
 * - `KeywordPreset`: `presets`, `allow_list`.
 * - `MentionSpam`: `mention_total_limit`, `mention_raid_protection_enabled`.
 * - `Spam`: none of them; the object arrives empty.
 *
 * Fields outside the rule's trigger type are absent rather than `null`, and the fields
 * that do apply are always sent — an empty `keyword_filter` on a `Keyword` rule is an
 * empty array, not a missing field.
 */
export interface APIAutoModerationTriggerMetadata {
  /**
   * Substrings searched for in content, at most 1000 of them and 60 characters each.
   *
   * @remarks
   * A keyword may be a multi-word phrase, and matching is case insensitive. A leading or
   * trailing `*` widens the match: `cat*` matches a word starting with it, `*cat` one
   * ending with it, `*cat*` anywhere within a word. Without a wildcard the keyword only
   * matches as a whole word or phrase surrounded by whitespace.
   */
  keyword_filter?: string[]
  /**
   * Regular expressions matched against content, at most 10 of them and 260 characters
   * each.
   *
   * @remarks
   * Rust-flavoured regex, not JavaScript's, so a pattern accepted here will not
   * necessarily behave the same way — or compile at all — when passed to `RegExp`.
   */
  regex_patterns?: string[]
  /** The internal wordsets searched for in content. */
  presets?: AutoModerationRuleKeywordPresetType[]
  /**
   * Substrings that stop the rule matching, 60 characters each.
   *
   * @remarks
   * The array limit depends on the trigger type: 100 entries for `Keyword` and
   * `MemberProfile` rules, 1000 for `KeywordPreset`. Wildcards work exactly as they do in
   * `keyword_filter`.
   */
  allow_list?: string[]
  /** Unique role and user mentions allowed in one message, at most 50. */
  mention_total_limit?: number
  /** Whether mention raids are detected automatically, on top of `mention_total_limit`. */
  mention_raid_protection_enabled?: boolean
}

/**
 * An action executed when a rule matches.
 */
export interface APIAutoModerationAction {
  /** What the action does. */
  type: AutoModerationActionType
  /**
   * Configuration specific to `type`.
   *
   * @remarks
   * Discord's reference marks this optional and says it can be omitted for action types
   * that need no configuration, while its OpenAPI specification marks it present on every
   * action in a response — as an empty object where there is nothing to carry. It is typed
   * optional so reading code has to survive both.
   */
  metadata?: APIAutoModerationActionMetadata
}

/**
 * The action-specific configuration of an action.
 *
 * @remarks
 * As with {@link APIAutoModerationTriggerMetadata}, one shape covers every action type and
 * the action's `type` decides which field applies: `channel_id` for `SendAlertMessage`,
 * `duration_seconds` for `Timeout`, `custom_message` for `BlockMessage`. A
 * `BlockMemberInteraction` action carries none of them.
 */
export interface APIAutoModerationActionMetadata {
  /** The channel the offending content is logged to. `SendAlertMessage` only. */
  channel_id?: Snowflake
  /**
   * How long the member is timed out for, in seconds. `Timeout` only.
   *
   * @remarks
   * At most 2419200, which is four weeks.
   */
  duration_seconds?: number
  /**
   * The explanation shown to the member when their message is blocked, at most 150
   * characters. `BlockMessage` only, and optional even there.
   */
  custom_message?: string
}

/**
 * The data of an `AUTO_MODERATION_ACTION_EXECUTION` dispatch.
 *
 * @remarks
 * Sent when a rule matched and one of its actions ran. `action` is that single action, not
 * the rule's whole `actions` array — the rest of the rule has to be fetched by `rule_id`.
 *
 * The `MessageContent` intent gates `content` and `matched_content`. Discord documents
 * both as always present on the event, so a bot without the intent should expect them
 * empty rather than missing.
 */
export interface APIAutoModerationActionExecution {
  /** The ID of the guild the action ran in. */
  guild_id: Snowflake
  /** The action that ran. */
  action: APIAutoModerationAction
  /** The ID of the rule the action belongs to. */
  rule_id: Snowflake
  /** The trigger type of the rule that matched. */
  rule_trigger_type: AutoModerationRuleTriggerType
  /** The ID of the user whose content triggered the rule. */
  user_id: Snowflake
  /** The ID of the channel the content was posted in, if it was posted in one. */
  channel_id?: Snowflake
  /**
   * The ID of the message the content belongs to.
   *
   * @remarks
   * Absent when Auto Moderation blocked the message, since it was never posted and so
   * never got an ID, and absent when the content was not part of a message at all — a
   * `MemberProfile` rule matching a member's profile, for example.
   */
  message_id?: Snowflake
  /**
   * The ID of the system message Auto Moderation posted about this action.
   *
   * @remarks
   * Absent unless the action was a `SendAlertMessage`.
   */
  alert_system_message_id?: Snowflake
  /** The user-generated text that triggered the rule. Requires the `MessageContent` intent. */
  content: string
  /** The keyword configured in the rule that matched, or `null` if no keyword did. */
  matched_keyword: string | null
  /**
   * The substring of `content` that matched, or `null`.
   *
   * @remarks
   * Requires the `MessageContent` intent, so this is `null` for a bot without it whether
   * or not something matched.
   */
  matched_content: string | null
}
