/**
 * Gateway dispatch event names.
 *
 * @remarks
 * These are the `t` field of an opcode 0 payload. The list is deliberately exhaustive:
 * `@vestra/core` asserts in a test that every name here either has an event handler or is
 * explicitly listed as unhandled, so anything added to this file becomes visible work
 * rather than a silent gap.
 *
 * Grouped by subject rather than documented individually — the names are self-describing,
 * and a per-member comment restating the name adds noise without adding meaning.
 */
export const GatewayDispatchEvents = {
  // Connection lifecycle
  Ready: 'READY',
  Resumed: 'RESUMED',

  // Application commands
  ApplicationCommandPermissionsUpdate: 'APPLICATION_COMMAND_PERMISSIONS_UPDATE',

  // AutoMod
  AutoModerationRuleCreate: 'AUTO_MODERATION_RULE_CREATE',
  AutoModerationRuleUpdate: 'AUTO_MODERATION_RULE_UPDATE',
  AutoModerationRuleDelete: 'AUTO_MODERATION_RULE_DELETE',
  AutoModerationActionExecution: 'AUTO_MODERATION_ACTION_EXECUTION',

  // Channels
  ChannelCreate: 'CHANNEL_CREATE',
  ChannelUpdate: 'CHANNEL_UPDATE',
  ChannelDelete: 'CHANNEL_DELETE',
  ChannelPinsUpdate: 'CHANNEL_PINS_UPDATE',

  // Threads
  ThreadCreate: 'THREAD_CREATE',
  ThreadUpdate: 'THREAD_UPDATE',
  ThreadDelete: 'THREAD_DELETE',
  ThreadListSync: 'THREAD_LIST_SYNC',
  ThreadMemberUpdate: 'THREAD_MEMBER_UPDATE',
  ThreadMembersUpdate: 'THREAD_MEMBERS_UPDATE',

  // Entitlements and subscriptions
  EntitlementCreate: 'ENTITLEMENT_CREATE',
  EntitlementUpdate: 'ENTITLEMENT_UPDATE',
  EntitlementDelete: 'ENTITLEMENT_DELETE',
  SubscriptionCreate: 'SUBSCRIPTION_CREATE',
  SubscriptionUpdate: 'SUBSCRIPTION_UPDATE',
  SubscriptionDelete: 'SUBSCRIPTION_DELETE',

  // Guilds
  GuildCreate: 'GUILD_CREATE',
  GuildUpdate: 'GUILD_UPDATE',
  GuildDelete: 'GUILD_DELETE',
  GuildAuditLogEntryCreate: 'GUILD_AUDIT_LOG_ENTRY_CREATE',
  GuildBanAdd: 'GUILD_BAN_ADD',
  GuildBanRemove: 'GUILD_BAN_REMOVE',
  GuildEmojisUpdate: 'GUILD_EMOJIS_UPDATE',
  GuildStickersUpdate: 'GUILD_STICKERS_UPDATE',
  GuildIntegrationsUpdate: 'GUILD_INTEGRATIONS_UPDATE',

  // Guild members
  GuildMemberAdd: 'GUILD_MEMBER_ADD',
  GuildMemberRemove: 'GUILD_MEMBER_REMOVE',
  GuildMemberUpdate: 'GUILD_MEMBER_UPDATE',
  GuildMembersChunk: 'GUILD_MEMBERS_CHUNK',

  // Guild roles
  GuildRoleCreate: 'GUILD_ROLE_CREATE',
  GuildRoleUpdate: 'GUILD_ROLE_UPDATE',
  GuildRoleDelete: 'GUILD_ROLE_DELETE',

  // Scheduled events
  GuildScheduledEventCreate: 'GUILD_SCHEDULED_EVENT_CREATE',
  GuildScheduledEventUpdate: 'GUILD_SCHEDULED_EVENT_UPDATE',
  GuildScheduledEventDelete: 'GUILD_SCHEDULED_EVENT_DELETE',
  GuildScheduledEventUserAdd: 'GUILD_SCHEDULED_EVENT_USER_ADD',
  GuildScheduledEventUserRemove: 'GUILD_SCHEDULED_EVENT_USER_REMOVE',

  // Soundboard
  GuildSoundboardSoundCreate: 'GUILD_SOUNDBOARD_SOUND_CREATE',
  GuildSoundboardSoundUpdate: 'GUILD_SOUNDBOARD_SOUND_UPDATE',
  GuildSoundboardSoundDelete: 'GUILD_SOUNDBOARD_SOUND_DELETE',
  GuildSoundboardSoundsUpdate: 'GUILD_SOUNDBOARD_SOUNDS_UPDATE',
  SoundboardSounds: 'SOUNDBOARD_SOUNDS',

  // Integrations
  IntegrationCreate: 'INTEGRATION_CREATE',
  IntegrationUpdate: 'INTEGRATION_UPDATE',
  IntegrationDelete: 'INTEGRATION_DELETE',

  // Interactions
  InteractionCreate: 'INTERACTION_CREATE',

  // Invites
  InviteCreate: 'INVITE_CREATE',
  InviteDelete: 'INVITE_DELETE',

  // Messages
  MessageCreate: 'MESSAGE_CREATE',
  MessageUpdate: 'MESSAGE_UPDATE',
  MessageDelete: 'MESSAGE_DELETE',
  MessageDeleteBulk: 'MESSAGE_DELETE_BULK',

  // Reactions
  MessageReactionAdd: 'MESSAGE_REACTION_ADD',
  MessageReactionRemove: 'MESSAGE_REACTION_REMOVE',
  MessageReactionRemoveAll: 'MESSAGE_REACTION_REMOVE_ALL',
  MessageReactionRemoveEmoji: 'MESSAGE_REACTION_REMOVE_EMOJI',

  // Polls
  MessagePollVoteAdd: 'MESSAGE_POLL_VOTE_ADD',
  MessagePollVoteRemove: 'MESSAGE_POLL_VOTE_REMOVE',

  // Presence and typing
  PresenceUpdate: 'PRESENCE_UPDATE',
  TypingStart: 'TYPING_START',
  UserUpdate: 'USER_UPDATE',

  // Stage instances
  StageInstanceCreate: 'STAGE_INSTANCE_CREATE',
  StageInstanceUpdate: 'STAGE_INSTANCE_UPDATE',
  StageInstanceDelete: 'STAGE_INSTANCE_DELETE',

  // Voice
  VoiceChannelEffectSend: 'VOICE_CHANNEL_EFFECT_SEND',
  VoiceStateUpdate: 'VOICE_STATE_UPDATE',
  VoiceServerUpdate: 'VOICE_SERVER_UPDATE',

  // Webhooks
  WebhooksUpdate: 'WEBHOOKS_UPDATE',
} as const

/**
 * A gateway dispatch event name.
 */
export type GatewayDispatchEvents =
  (typeof GatewayDispatchEvents)[keyof typeof GatewayDispatchEvents]
