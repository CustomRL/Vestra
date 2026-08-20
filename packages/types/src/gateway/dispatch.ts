import type {
  GatewayChannelPinsUpdateDispatchData,
  GatewayGuildAuditLogEntryCreateDispatchData,
  GatewayGuildBanDispatchData,
  GatewayGuildCreateDispatchData,
  GatewayGuildEmojisUpdateDispatchData,
  GatewayGuildIntegrationsUpdateDispatchData,
  GatewayGuildMemberAddDispatchData,
  GatewayGuildMemberRemoveDispatchData,
  GatewayGuildMemberUpdateDispatchData,
  GatewayGuildMembersChunkDispatchData,
  GatewayGuildRoleDeleteDispatchData,
  GatewayGuildRoleModifyDispatchData,
  GatewayGuildScheduledEventUserDispatchData,
  GatewayGuildSoundboardSoundsUpdateDispatchData,
  GatewayGuildStickersUpdateDispatchData,
  GatewayIntegrationCreateDispatchData,
  GatewayIntegrationDeleteDispatchData,
  GatewayInviteCreateDispatchData,
  GatewayInviteDeleteDispatchData,
  GatewayMessageCreateDispatchData,
  GatewayMessageDeleteBulkDispatchData,
  GatewayMessageDeleteDispatchData,
  GatewayMessagePollVoteDispatchData,
  GatewayMessageReactionAddDispatchData,
  GatewayMessageReactionRemoveAllDispatchData,
  GatewayMessageReactionRemoveDispatchData,
  GatewayMessageReactionRemoveEmojiDispatchData,
  GatewayMessageUpdateDispatchData,
  GatewayRateLimitedDispatchData,
  GatewayReadyDispatchData,
  GatewaySoundboardSoundsDispatchData,
  GatewayThreadCreateDispatchData,
  GatewayThreadDeleteDispatchData,
  GatewayThreadListSyncDispatchData,
  GatewayThreadMemberUpdateDispatchData,
  GatewayThreadMembersUpdateDispatchData,
  GatewayTypingStartDispatchData,
  GatewayVoiceServerUpdateDispatchData,
  GatewayWebhooksUpdateDispatchData,
} from './dispatch-data.js'
import type {
  APIAutoModerationActionExecution,
  APIAutoModerationRule,
} from '../payloads/auto-moderation.js'
import type { APIChannel, APIThreadChannel } from '../payloads/channel.js'
import type { APIEntitlement, APISubscription } from '../payloads/monetisation.js'
import type { APIGuild, APIUnavailableGuild } from '../payloads/guild.js'
import type { APIGuildScheduledEvent } from '../payloads/scheduled-event.js'
import type { APIPresenceUpdate } from '../payloads/presence.js'
import type { APISoundboardSound, APIVoiceChannelEffect } from '../payloads/soundboard.js'
import type { APIStageInstance } from '../payloads/stage-instance.js'
import type { APIUser } from '../payloads/user.js'
import type { APIVoiceState } from '../payloads/member.js'

/**
 * Data carried by each dispatch event.
 *
 * @remarks
 * An interface rather than a type alias, so a downstream package can extend it by
 * declaration merging while Vestra fills in the remainder.
 *
 * Events absent from this map resolve to `unknown` through {@link GatewayDispatchData}.
 * That is deliberate: `unknown` forces a consumer to narrow, which is honest, whereas
 * `any` would silently claim a precision these typings do not yet have. The gaps are
 * tracked, and the event-coverage test in `@vestra/core` keeps them visible.
 */
export interface GatewayDispatchEventMap {
  /** The initial state after identifying. */
  READY: GatewayReadyDispatchData
  /** Sent after a successful resume; carries no data. */
  RESUMED: undefined

  /** A guild became available, or the bot joined one. */
  GUILD_CREATE: GatewayGuildCreateDispatchData
  /** A guild was updated. */
  GUILD_UPDATE: APIGuild
  /** A guild became unavailable, or the bot was removed from one. */
  GUILD_DELETE: APIUnavailableGuild

  /** A channel was created. */
  CHANNEL_CREATE: APIChannel
  /** A channel was updated. */
  CHANNEL_UPDATE: APIChannel
  /** A channel was deleted. */
  CHANNEL_DELETE: APIChannel

  /** A message was sent. */
  MESSAGE_CREATE: GatewayMessageCreateDispatchData
  /** A message was edited. */
  MESSAGE_UPDATE: GatewayMessageUpdateDispatchData
  /** A message was deleted. */
  MESSAGE_DELETE: GatewayMessageDeleteDispatchData
  /** Several messages were deleted at once. */
  MESSAGE_DELETE_BULK: GatewayMessageDeleteBulkDispatchData

  /** A member joined a guild. */
  GUILD_MEMBER_ADD: GatewayGuildMemberAddDispatchData
  /** A member was updated. */
  GUILD_MEMBER_UPDATE: GatewayGuildMemberUpdateDispatchData
  /** A member left or was removed from a guild. */
  GUILD_MEMBER_REMOVE: GatewayGuildMemberRemoveDispatchData

  /** A role was created. */
  GUILD_ROLE_CREATE: GatewayGuildRoleModifyDispatchData
  /** A role was updated. */
  GUILD_ROLE_UPDATE: GatewayGuildRoleModifyDispatchData
  /** A role was deleted. */
  GUILD_ROLE_DELETE: GatewayGuildRoleDeleteDispatchData

  /** The current user was updated. */
  USER_UPDATE: APIUser
  /** A user joined, left or moved between voice channels. */
  VOICE_STATE_UPDATE: APIVoiceState
  /** A user started typing. */
  TYPING_START: GatewayTypingStartDispatchData
  /** A page of members requested with opcode 8. */
  GUILD_MEMBERS_CHUNK: GatewayGuildMembersChunkDispatchData
  /** A gateway command was rejected for exceeding a rate limit. */
  RATE_LIMITED: GatewayRateLimitedDispatchData

  /** A thread was created, or the current user was added to one. */
  THREAD_CREATE: GatewayThreadCreateDispatchData
  /** A thread was updated. Not sent for `last_message_id` changes. */
  THREAD_UPDATE: APIThreadChannel
  /** A thread was deleted. Carries only four fields, not a whole channel. */
  THREAD_DELETE: GatewayThreadDeleteDispatchData
  /** The threads the current user can see, sent on gaining access to a channel. */
  THREAD_LIST_SYNC: GatewayThreadListSyncDispatchData
  /** The current user's thread membership changed. */
  THREAD_MEMBER_UPDATE: GatewayThreadMemberUpdateDispatchData
  /** Members were added to or removed from a thread. */
  THREAD_MEMBERS_UPDATE: GatewayThreadMembersUpdateDispatchData

  /** A reaction was added to a message. */
  MESSAGE_REACTION_ADD: GatewayMessageReactionAddDispatchData
  /** A reaction was removed from a message. */
  MESSAGE_REACTION_REMOVE: GatewayMessageReactionRemoveDispatchData
  /** Every reaction was cleared from a message. */
  MESSAGE_REACTION_REMOVE_ALL: GatewayMessageReactionRemoveAllDispatchData
  /** Every reaction of one emoji was cleared from a message. */
  MESSAGE_REACTION_REMOVE_EMOJI: GatewayMessageReactionRemoveEmojiDispatchData

  /** A vote was cast on a poll. */
  MESSAGE_POLL_VOTE_ADD: GatewayMessagePollVoteDispatchData
  /** A vote was withdrawn from a poll. */
  MESSAGE_POLL_VOTE_REMOVE: GatewayMessagePollVoteDispatchData

  /** A channel's pinned messages changed. */
  CHANNEL_PINS_UPDATE: GatewayChannelPinsUpdateDispatchData

  /** A user was banned from a guild. */
  GUILD_BAN_ADD: GatewayGuildBanDispatchData
  /** A user was unbanned from a guild. */
  GUILD_BAN_REMOVE: GatewayGuildBanDispatchData
  /** A guild's emojis changed. Carries the full set, not a delta. */
  GUILD_EMOJIS_UPDATE: GatewayGuildEmojisUpdateDispatchData
  /** A guild's stickers changed. Carries the full set, not a delta. */
  GUILD_STICKERS_UPDATE: GatewayGuildStickersUpdateDispatchData
  /** A guild's integrations changed. A signal to refetch. */
  GUILD_INTEGRATIONS_UPDATE: GatewayGuildIntegrationsUpdateDispatchData
  /** A channel's webhooks changed. A signal to refetch. */
  WEBHOOKS_UPDATE: GatewayWebhooksUpdateDispatchData

  /** An invite was created. */
  INVITE_CREATE: GatewayInviteCreateDispatchData
  /** An invite was deleted. */
  INVITE_DELETE: GatewayInviteDeleteDispatchData

  /** Where to connect for a guild's voice traffic. */
  VOICE_SERVER_UPDATE: GatewayVoiceServerUpdateDispatchData

  /** An AutoMod rule was created. */
  AUTO_MODERATION_RULE_CREATE: APIAutoModerationRule
  /** An AutoMod rule was updated. */
  AUTO_MODERATION_RULE_UPDATE: APIAutoModerationRule
  /** An AutoMod rule was deleted. */
  AUTO_MODERATION_RULE_DELETE: APIAutoModerationRule
  /** An AutoMod rule acted on a message. */
  AUTO_MODERATION_ACTION_EXECUTION: APIAutoModerationActionExecution

  /** An audit log entry was recorded. */
  GUILD_AUDIT_LOG_ENTRY_CREATE: GatewayGuildAuditLogEntryCreateDispatchData

  /** A scheduled event was created. */
  GUILD_SCHEDULED_EVENT_CREATE: APIGuildScheduledEvent
  /** A scheduled event was updated. */
  GUILD_SCHEDULED_EVENT_UPDATE: APIGuildScheduledEvent
  /** A scheduled event was deleted. */
  GUILD_SCHEDULED_EVENT_DELETE: APIGuildScheduledEvent
  /** A user subscribed to a scheduled event. */
  GUILD_SCHEDULED_EVENT_USER_ADD: GatewayGuildScheduledEventUserDispatchData
  /** A user unsubscribed from a scheduled event. */
  GUILD_SCHEDULED_EVENT_USER_REMOVE: GatewayGuildScheduledEventUserDispatchData

  /** A stage instance was created. */
  STAGE_INSTANCE_CREATE: APIStageInstance
  /** A stage instance was updated. */
  STAGE_INSTANCE_UPDATE: APIStageInstance
  /** A stage instance was deleted. */
  STAGE_INSTANCE_DELETE: APIStageInstance

  /** An integration was added to a guild. `user` is stripped by the gateway. */
  INTEGRATION_CREATE: GatewayIntegrationCreateDispatchData
  /** An integration was updated. `user` is stripped by the gateway. */
  INTEGRATION_UPDATE: GatewayIntegrationCreateDispatchData
  /** An integration was removed from a guild. */
  INTEGRATION_DELETE: GatewayIntegrationDeleteDispatchData

  /** A soundboard sound was created. */
  GUILD_SOUNDBOARD_SOUND_CREATE: APISoundboardSound
  /** A soundboard sound was updated. */
  GUILD_SOUNDBOARD_SOUND_UPDATE: APISoundboardSound
  /** A soundboard sound was deleted. */
  GUILD_SOUNDBOARD_SOUND_DELETE: APISoundboardSound
  /** A guild's soundboard sounds changed. Carries the full set, not a delta. */
  GUILD_SOUNDBOARD_SOUNDS_UPDATE: GatewayGuildSoundboardSoundsUpdateDispatchData
  /** Soundboard sounds for the guilds that were asked about. */
  SOUNDBOARD_SOUNDS: GatewaySoundboardSoundsDispatchData
  /** A soundboard sound was played in a voice channel. */
  VOICE_CHANNEL_EFFECT_SEND: APIVoiceChannelEffect

  /** An entitlement was created. */
  ENTITLEMENT_CREATE: APIEntitlement
  /** An entitlement was updated. */
  ENTITLEMENT_UPDATE: APIEntitlement
  /** An entitlement was deleted. */
  ENTITLEMENT_DELETE: APIEntitlement

  /** A subscription was created. */
  SUBSCRIPTION_CREATE: APISubscription
  /** A subscription was updated. */
  SUBSCRIPTION_UPDATE: APISubscription
  /** A subscription was deleted. */
  SUBSCRIPTION_DELETE: APISubscription

  /** A user's presence or activities changed. */
  PRESENCE_UPDATE: APIPresenceUpdate
}

/**
 * The data type for a dispatch event, or `unknown` if it is not yet modelled.
 */
export type GatewayDispatchData<Event extends string> = Event extends keyof GatewayDispatchEventMap
  ? GatewayDispatchEventMap[Event]
  : unknown
