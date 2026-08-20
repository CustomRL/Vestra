/**
 * Auto Moderation enumerations.
 */

/**
 * The kind of content a rule inspects.
 *
 * @remarks
 * A guild's limit is per trigger type rather than overall: six `Keyword` rules, and one
 * each of `Spam`, `KeywordPreset`, `MentionSpam` and `MemberProfile`.
 *
 * This value also decides which fields of a rule's `trigger_metadata` are populated; see
 * {@link APIAutoModerationTriggerMetadata}.
 *
 * The numbering skips `2` — Discord's tables list no trigger type with that value.
 */
export const AutoModerationRuleTriggerType = {
  /** Message content contains a substring from a keyword list the guild supplied. */
  Keyword: 1,
  /** Message content is generic spam, judged by Discord rather than by guild configuration. */
  Spam: 3,
  /** Message content contains a word from one of Discord's internal wordsets. */
  KeywordPreset: 4,
  /** Message content contains more unique role and user mentions than the rule allows. */
  MentionSpam: 5,
  /**
   * A member's profile contains a substring from a keyword list the guild supplied.
   *
   * @remarks
   * Discord's OpenAPI specification calls this `USER_PROFILE`; same value, and the same
   * `trigger_metadata` fields as `Keyword`.
   */
  MemberProfile: 6,
} as const

/**
 * An Auto Moderation trigger type.
 */
export type AutoModerationRuleTriggerType =
  (typeof AutoModerationRuleTriggerType)[keyof typeof AutoModerationRuleTriggerType]

/**
 * The event context in which a rule is checked.
 */
export const AutoModerationRuleEventType = {
  /** A member sends or edits a message in the guild. */
  MessageSend: 1,
  /**
   * A member edits their profile.
   *
   * @remarks
   * The name understates the coverage: Discord's OpenAPI specification calls this
   * `GUILD_MEMBER_JOIN_OR_UPDATE` and describes it as a user attempting to join the guild
   * *or* a member's properties changing, so it is checked on join too.
   */
  MemberUpdate: 2,
} as const

/**
 * An Auto Moderation rule event type.
 */
export type AutoModerationRuleEventType =
  (typeof AutoModerationRuleEventType)[keyof typeof AutoModerationRuleEventType]

/**
 * What an action does when its rule matches.
 *
 * @remarks
 * Every Auto Moderation resource needs `ManageGuild`; `Timeout` needs `ModerateMembers` on
 * top of it, and can only be configured on `Keyword` and `MentionSpam` rules.
 */
export const AutoModerationActionType = {
  /**
   * Block the message so it is never posted.
   *
   * @remarks
   * The action's `custom_message` metadata, if set, is what the member sees in place of
   * their message.
   */
  BlockMessage: 1,
  /** Log the offending content to the channel named in the action's metadata. */
  SendAlertMessage: 2,
  /** Time the member out for the number of seconds in the action's metadata. */
  Timeout: 3,
  /**
   * Stop the member using text, voice or other interactions in the guild.
   *
   * @remarks
   * Discord's OpenAPI specification calls this `QUARANTINE_USER`; same value.
   */
  BlockMemberInteraction: 4,
} as const

/**
 * An Auto Moderation action type.
 */
export type AutoModerationActionType =
  (typeof AutoModerationActionType)[keyof typeof AutoModerationActionType]

/**
 * One of Discord's internally maintained wordsets.
 *
 * @remarks
 * The contents are Discord's and are not published, so a guild cannot see or edit which
 * words a preset covers — only exempt words from it through `allow_list`.
 */
export const AutoModerationRuleKeywordPresetType = {
  /** Words that may be considered forms of swearing or cursing. */
  Profanity: 1,
  /** Words that refer to sexually explicit behaviour or activity. */
  SexualContent: 2,
  /** Personal insults or words that may be considered hate speech. */
  Slurs: 3,
} as const

/**
 * An Auto Moderation keyword preset type.
 */
export type AutoModerationRuleKeywordPresetType =
  (typeof AutoModerationRuleKeywordPresetType)[keyof typeof AutoModerationRuleKeywordPresetType]
