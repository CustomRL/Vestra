import type {
  APIAutoModerationAction,
  APIAutoModerationActionExecution,
  APIAutoModerationActionMetadata,
  APIAutoModerationRule,
  APIAutoModerationTriggerMetadata,
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
  Snowflake,
} from '@vestra/types'
import { Base } from './Base.js'
import { snowflakeDate, snowflakeTimestamp } from './snowflake.js'

/**
 * The trigger-specific configuration of a rule.
 *
 * @remarks
 * Converted rather than held by reference, for the two reasons {@link RoleColors} records: a
 * held reference puts `rule.triggerMetadata.keyword_filter` in user code, and it aliases the
 * dispatch, so a consumer who edited it would be editing the payload the router still holds.
 *
 * **An absent field stays `undefined` rather than becoming an empty array.** Which fields
 * Discord sends follows from the rule's {@link AutoModerationRule.triggerType}: a
 * `MentionSpam` rule has no `keywordFilter` at all, while a `Keyword` rule with nothing in it
 * has an empty one. Normalising the first into the second would erase a difference Discord
 * takes care to send. {@link Activity} normalises `buttons` the other way round because there
 * absence has only one meaning.
 */
export interface AutoModerationTriggerMetadata {
  /** Substrings searched for in content. `Keyword` and `MemberProfile` rules. */
  keywordFilter: readonly string[] | undefined
  /** Rust-flavoured regular expressions matched against content, which `RegExp` may reject. */
  regexPatterns: readonly string[] | undefined
  /** The internal wordsets searched for in content. `KeywordPreset` rules. */
  presets: readonly AutoModerationRuleKeywordPresetType[] | undefined
  /** Substrings that stop the rule matching. */
  allowList: readonly string[] | undefined
  /** Unique role and user mentions allowed in one message. `MentionSpam` rules. */
  mentionTotalLimit: number | undefined
  /** Whether mention raids are detected on top of {@link AutoModerationTriggerMetadata.mentionTotalLimit}. */
  mentionRaidProtectionEnabled: boolean | undefined
}

/**
 * The action-specific configuration of an action.
 *
 * @remarks
 * One shape covers every action type and the action's `type` decides which field applies, so
 * reading one outside its own action type says nothing.
 */
export interface AutoModerationActionMetadata {
  /** The channel offending content is logged to. `SendAlertMessage` only. */
  channelId: Snowflake | undefined
  /** How long the member is timed out for, in seconds. `Timeout` only. */
  durationSeconds: number | undefined
  /** What the member is shown in place of their message. `BlockMessage` only. */
  customMessage: string | undefined
}

/**
 * An action a rule executes when it matches.
 */
export interface AutoModerationAction {
  /** What the action does. */
  type: AutoModerationActionType
  /**
   * The action's configuration, or `undefined`.
   *
   * @remarks
   * Discord omits it on action types that need no configuration and sends `{}` for them
   * elsewhere, so both forms occur and both mean the same thing. Mirrored rather than
   * normalised: a metadata object this library invented would claim configuration arrived
   * where none did.
   */
  metadata: AutoModerationActionMetadata | undefined
}

/**
 * Converts an action's metadata, or passes `undefined` through.
 *
 * @param raw - The payload's metadata.
 * @returns The converted metadata.
 */
function toActionMetadata(
  raw: APIAutoModerationActionMetadata | undefined,
): AutoModerationActionMetadata | undefined {
  if (raw === undefined) return undefined
  return {
    channelId: raw.channel_id,
    durationSeconds: raw.duration_seconds,
    customMessage: raw.custom_message,
  }
}

/**
 * Converts one action.
 *
 * @param raw - The payload's action.
 * @returns The converted action.
 */
function toAction(raw: APIAutoModerationAction): AutoModerationAction {
  return { type: raw.type, metadata: toActionMetadata(raw.metadata) }
}

/**
 * Converts the trigger configuration, copying each array rather than aliasing it.
 *
 * @param raw - The payload's `trigger_metadata`.
 * @returns The converted configuration.
 */
function toTriggerMetadata(raw: APIAutoModerationTriggerMetadata): AutoModerationTriggerMetadata {
  return {
    keywordFilter: raw.keyword_filter === undefined ? undefined : [...raw.keyword_filter],
    regexPatterns: raw.regex_patterns === undefined ? undefined : [...raw.regex_patterns],
    presets: raw.presets === undefined ? undefined : [...raw.presets],
    allowList: raw.allow_list === undefined ? undefined : [...raw.allow_list],
    mentionTotalLimit: raw.mention_total_limit,
    mentionRaidProtectionEnabled: raw.mention_raid_protection_enabled,
  }
}

/**
 * A guild rule that inspects content and acts when it matches.
 *
 * @remarks
 * **Not cached, and there is no autoModerationRules scope.** A guild is capped at ten rules,
 * every one of them is only visible to a bot with `ManageGuild`, and the three rule
 * dispatches carry the whole rule — the delete included — so nothing has to be read back out
 * of a cache to answer them. A scope would add a store, a key row, an `evictGuild` branch and
 * a case in every adapter, to hold at most ten cold configuration objects per guild for the
 * subset of bots that can see them at all. The same reasoning {@link StageInstance} records.
 *
 * **No `patch`.** Nothing holds a rule between dispatches, so `AUTO_MODERATION_RULE_UPDATE`
 * builds a fresh structure rather than editing one in place, and two updates for one rule
 * produce two objects that share an {@link AutoModerationRule.id}.
 *
 * **`triggerType` decides which of `triggerMetadata`'s fields are populated**, and nothing in
 * the type system ties the two together. Narrow on it before reading the metadata.
 */
export class AutoModerationRule<Client = unknown> extends Base<Client> {
  /** The rule's ID. */
  declare readonly id: Snowflake
  /**
   * The guild the rule belongs to.
   *
   * @remarks
   * On the payload, unlike {@link Role.guildId} — every Auto Moderation dispatch carries it
   * inside the rule — so the constructor takes no separate argument for it.
   */
  declare readonly guildId: Snowflake
  /** The rule's name. */
  declare readonly name: string
  /**
   * Who first created the rule.
   *
   * @remarks
   * The original creator rather than whoever last edited it; editing does not move it.
   */
  declare readonly creatorId: Snowflake
  /** The event context in which the rule is checked. */
  declare readonly eventType: AutoModerationRuleEventType
  /** The kind of content the rule inspects. */
  declare readonly triggerType: AutoModerationRuleTriggerType
  /** The configuration belonging to {@link AutoModerationRule.triggerType}. */
  declare readonly triggerMetadata: AutoModerationTriggerMetadata
  /** The actions executed when the rule matches. */
  declare readonly actions: readonly AutoModerationAction[]
  /** Whether the rule is enabled. Rules are created disabled unless asked otherwise. */
  declare readonly enabled: boolean
  /** The roles the rule ignores. */
  declare readonly exemptRoles: readonly Snowflake[]
  /** The channels the rule ignores. */
  declare readonly exemptChannels: readonly Snowflake[]

  /**
   * @param data - The payload to mirror.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIAutoModerationRule, client: Client) {
    super(client)

    this.id = data.id
    this.guildId = data.guild_id
    this.name = data.name
    this.creatorId = data.creator_id
    this.eventType = data.event_type
    this.triggerType = data.trigger_type
    this.triggerMetadata = toTriggerMetadata(data.trigger_metadata)
    this.actions = data.actions.map(toAction)
    this.enabled = data.enabled
    this.exemptRoles = [...data.exempt_roles]
    this.exemptChannels = [...data.exempt_channels]
  }

  /** When the rule was created, in epoch milliseconds. */
  get createdTimestamp(): number {
    return snowflakeTimestamp(this.id)
  }

  /** When the rule was created. Allocates. */
  get createdAt(): Date {
    return snowflakeDate(this.id)
  }
}

/**
 * A report that a rule matched and one of its actions ran.
 *
 * @remarks
 * **Not a rule, and deliberately not carrying one.** `AUTO_MODERATION_ACTION_EXECUTION` has
 * its own payload: it names the rule by {@link AutoModerationActionExecution.ruleId} and
 * carries the single action that ran rather than the rule's whole `actions` array, so the
 * rest of the rule has to be fetched. Emitting an {@link AutoModerationRule} here would mean
 * inventing nine fields the dispatch never sent.
 *
 * **A structure rather than a spread of event arguments**, which is the other shape this
 * could have taken. The payload has eleven fields, three of them optional and two of them
 * nullable, and a listener would then be reading `args[8]` to find `matchedKeyword`. The
 * comparison is with {@link ClientEvents.guildBanAdd}, which is two arguments and reads
 * fine — eleven does not. The `action` field also has to be converted whichever shape wins,
 * because {@link AutoModerationActionMetadata} is snake_case on the wire, so a raw-payload
 * event would put `action.metadata.channel_id` in user code beside camelCase everywhere else.
 *
 * **On {@link Base} like every other emitted structure**, so `client` is reachable and
 * cache-backed accessors for the guild, channel and user can be added later without changing
 * what the event carries. {@link Activity} is off `Base` because it is a value nested inside
 * a presence; this is what a dispatch hands a listener.
 *
 * **`content` and `matchedContent` are gated by the `MessageContent` intent.** A bot without
 * it gets an empty string and `null` rather than an absent field, so neither is evidence
 * that nothing matched.
 */
export class AutoModerationActionExecution<Client = unknown> extends Base<Client> {
  /** The guild the action ran in. */
  declare readonly guildId: Snowflake
  /** The one action that ran, not the rule's whole set. */
  declare readonly action: AutoModerationAction
  /** The rule the action belongs to. */
  declare readonly ruleId: Snowflake
  /** The trigger type of the rule that matched. */
  declare readonly ruleTriggerType: AutoModerationRuleTriggerType
  /** Whose content triggered the rule. */
  declare readonly userId: Snowflake
  /** The channel the content was posted in, if it was posted in one. */
  declare readonly channelId: Snowflake | undefined
  /**
   * The message the content belongs to.
   *
   * @remarks
   * `undefined` when the message was blocked — it was never posted, so it never got an ID —
   * and when the content was not a message at all, as on a `MemberProfile` rule.
   */
  declare readonly messageId: Snowflake | undefined
  /** The system message Auto Moderation posted, on a `SendAlertMessage` action. */
  declare readonly alertSystemMessageId: Snowflake | undefined
  /** The text that triggered the rule, empty without the `MessageContent` intent. */
  declare readonly content: string
  /** The keyword configured in the rule that matched, or `null`. */
  declare readonly matchedKeyword: string | null
  /** The substring of {@link AutoModerationActionExecution.content} that matched, or `null`. */
  declare readonly matchedContent: string | null

  /**
   * @param data - The payload to mirror.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIAutoModerationActionExecution, client: Client) {
    super(client)

    this.guildId = data.guild_id
    this.action = toAction(data.action)
    this.ruleId = data.rule_id
    this.ruleTriggerType = data.rule_trigger_type
    this.userId = data.user_id
    this.channelId = data.channel_id
    this.messageId = data.message_id
    this.alertSystemMessageId = data.alert_system_message_id
    this.content = data.content
    this.matchedKeyword = data.matched_keyword
    this.matchedContent = data.matched_content
  }
}
