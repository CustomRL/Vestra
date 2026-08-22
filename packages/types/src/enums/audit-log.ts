/**
 * Audit log enumerations.
 */

/**
 * The administrative action an audit log entry records, carried as its `action_type`.
 *
 * @remarks
 * The numbering is grouped by subject in blocks of ten and is not contiguous. The gaps are
 * Discord's own — treat an unrecognised number as an action added since this list was
 * written rather than as a malformed entry, because entries for actions Discord has never
 * documented do arrive.
 *
 * Most actions carry a `changes` array describing the object they acted on, and the change
 * keys are normally that object's own field names. Members noted below as having no
 * `changes` array put whatever detail they have in the entry's `options` instead, or carry
 * none at all; members noting a key quirk are the exceptions described on
 * {@link APIAuditLogChange}.
 *
 * Members marked undocumented appear in Discord's OpenAPI specification but not in the
 * audit log events table of the documentation, so nothing is known about them beyond the
 * name and the value. They are included because the value can still reach a handler.
 */
export const AuditLogEvent = {
  /** Server settings were updated. */
  GuildUpdate: 1,

  /** Channel was created. */
  ChannelCreate: 10,
  /** Channel settings were updated. */
  ChannelUpdate: 11,
  /** Channel was deleted. */
  ChannelDelete: 12,
  /** Permission overwrite was added to a channel. */
  ChannelOverwriteCreate: 13,
  /** Permission overwrite was updated for a channel. */
  ChannelOverwriteUpdate: 14,
  /** Permission overwrite was deleted from a channel. */
  ChannelOverwriteDelete: 15,

  /** Member was removed from the server. No `changes` array. */
  MemberKick: 20,
  /** Members were pruned from the server. No `changes` array. */
  MemberPrune: 21,
  /** Member was banned from the server. No `changes` array. */
  MemberBanAdd: 22,
  /** Server ban was lifted for a member. No `changes` array. */
  MemberBanRemove: 23,
  /** Member was updated in the server. */
  MemberUpdate: 24,
  /**
   * Member was added to or removed from a role.
   *
   * @remarks
   * Keyed `$add` or `$remove` rather than by a field name, and the value is an array of
   * partial roles carrying only `id` and `name`.
   */
  MemberRoleUpdate: 25,
  /** Member was moved to a different voice channel. No `changes` array. */
  MemberMove: 26,
  /** Member was disconnected from a voice channel. No `changes` array. */
  MemberDisconnect: 27,
  /** Bot user was added to the server. No `changes` array. */
  BotAdd: 28,

  /** Role was created. */
  RoleCreate: 30,
  /** Role was edited. */
  RoleUpdate: 31,
  /** Role was deleted. */
  RoleDelete: 32,

  /** Server invite was created. Its channel is keyed `channel_id`, not `channel.id`. */
  InviteCreate: 40,
  /** Server invite was updated. Its channel is keyed `channel_id`, not `channel.id`. */
  InviteUpdate: 41,
  /** Server invite was deleted. Its channel is keyed `channel_id`, not `channel.id`. */
  InviteDelete: 42,

  /** Webhook was created. Its avatar is keyed `avatar_hash`, not `avatar`. */
  WebhookCreate: 50,
  /** Webhook properties or channel were updated. Its avatar is keyed `avatar_hash`. */
  WebhookUpdate: 51,
  /** Webhook was deleted. Its avatar is keyed `avatar_hash`, not `avatar`. */
  WebhookDelete: 52,

  /** Emoji was created. */
  EmojiCreate: 60,
  /** Emoji name was updated. */
  EmojiUpdate: 61,
  /** Emoji was deleted. */
  EmojiDelete: 62,

  /** Single message was deleted. No `changes` array. */
  MessageDelete: 72,
  /** Multiple messages were deleted. No `changes` array. */
  MessageBulkDelete: 73,
  /** Message was pinned to a channel. No `changes` array. */
  MessagePin: 74,
  /** Message was unpinned from a channel. No `changes` array. */
  MessageUnpin: 75,

  /** App was added to the server. */
  IntegrationCreate: 80,
  /** App was updated — its scopes, for example. */
  IntegrationUpdate: 81,
  /** App was removed from the server. */
  IntegrationDelete: 82,
  /** Stage instance was created, meaning a stage channel went live. */
  StageInstanceCreate: 83,
  /** Stage instance details were updated. */
  StageInstanceUpdate: 84,
  /** Stage instance was deleted, meaning a stage channel is no longer live. */
  StageInstanceDelete: 85,

  /** Sticker was created. */
  StickerCreate: 90,
  /** Sticker details were updated. */
  StickerUpdate: 91,
  /** Sticker was deleted. */
  StickerDelete: 92,

  /** Event was created. */
  GuildScheduledEventCreate: 100,
  /** Event was updated. */
  GuildScheduledEventUpdate: 101,
  /** Event was cancelled. */
  GuildScheduledEventDelete: 102,

  /** Thread was created in a channel. */
  ThreadCreate: 110,
  /** Thread was updated. */
  ThreadUpdate: 111,
  /** Thread was deleted. */
  ThreadDelete: 112,

  /**
   * Permissions were updated for a command.
   *
   * @remarks
   * The odd one out. `target_id` is the command ID or the app ID rather than the entity
   * whose access changed, and each change is keyed by a role, channel or user snowflake
   * with a permissions object on either side, because the array stands for the whole
   * `permissions` property rather than for individual fields.
   */
  ApplicationCommandPermissionUpdate: 121,

  /** Soundboard sound was created. */
  SoundboardSoundCreate: 130,
  /** Soundboard sound was updated. */
  SoundboardSoundUpdate: 131,
  /** Soundboard sound was deleted. */
  SoundboardSoundDelete: 132,

  /** Auto Moderation rule was created. */
  AutoModerationRuleCreate: 140,
  /** Auto Moderation rule was updated. */
  AutoModerationRuleUpdate: 141,
  /** Auto Moderation rule was deleted. */
  AutoModerationRuleDelete: 142,
  /** Message was blocked by Auto Moderation. No `changes` array. */
  AutoModerationBlockMessage: 143,
  /** Message was flagged by Auto Moderation. No `changes` array. */
  AutoModerationFlagToChannel: 144,
  /** Member was timed out by Auto Moderation. No `changes` array. */
  AutoModerationUserCommunicationDisabled: 145,
  /** Member was quarantined by Auto Moderation. No `changes` array. */
  AutoModerationQuarantineUser: 146,

  /** Creator monetization request was created. No `changes` array. */
  CreatorMonetizationRequestCreated: 150,
  /** Creator monetization terms were accepted. No `changes` array. */
  CreatorMonetizationTermsAccepted: 151,

  /** Guild onboarding question was created. */
  OnboardingPromptCreate: 163,
  /** Guild onboarding question was updated. */
  OnboardingPromptUpdate: 164,
  /** Guild onboarding question was deleted. */
  OnboardingPromptDelete: 165,
  /** Guild onboarding was created. */
  OnboardingCreate: 166,
  /** Guild onboarding was updated. */
  OnboardingUpdate: 167,

  /** Undocumented. `GUILD_HOME_FEATURE_ITEM` in Discord's OpenAPI specification. */
  GuildHomeFeatureItem: 171,
  /** Undocumented. `GUILD_HOME_REMOVE_ITEM` in Discord's OpenAPI specification. */
  GuildHomeRemoveItem: 172,

  /** Undocumented. `HARMFUL_LINKS_BLOCKED_MESSAGE` in Discord's OpenAPI specification. */
  HarmfulLinksBlockedMessage: 180,

  /** Guild server guide was created. No `changes` array. */
  HomeSettingsCreate: 190,
  /** Guild server guide was updated. No `changes` array. */
  HomeSettingsUpdate: 191,
  /** A voice channel status was set by a user. No `changes` array. */
  VoiceChannelStatusCreate: 192,
  /** A voice channel status was deleted by a user. No `changes` array. */
  VoiceChannelStatusDelete: 193,

  /** Scheduled event exception was created. Named only in the OpenAPI specification. */
  GuildScheduledEventExceptionCreate: 200,
  /** Scheduled event exception was updated. Named only in the OpenAPI specification. */
  GuildScheduledEventExceptionUpdate: 201,
  /** Scheduled event exception was deleted. Named only in the OpenAPI specification. */
  GuildScheduledEventExceptionDelete: 202,

  /** Undocumented. `GUILD_PROFILE_UPDATE` in Discord's OpenAPI specification. */
  GuildProfileUpdate: 211,
} as const

/**
 * An audit log event.
 */
export type AuditLogEvent = (typeof AuditLogEvent)[keyof typeof AuditLogEvent]
