/**
 * Structures: the camelCase, client-aware forms of Discord's payloads.
 *
 * @remarks
 * See `docs/design/phase-4-core.md` §4.15 to §4.17 for the conversion rule, the fixed
 * field order these rely on, and what ships as a structure versus what stays a payload.
 */

export { Base } from './Base.js'
export { ClientUser, type ClientUserChanges, type ClientUserChangeField } from './ClientUser.js'
export { Guild, type APIGuildLike, type GuildChanges, type GuildChangeField } from './Guild.js'
export {
  Activity,
  type ActivityAssets,
  type ActivityEmoji,
  type ActivityParty,
  type ActivitySecrets,
  type ActivityTimestamps,
} from './Activity.js'
export { AuditLogEntry, type AuditLogChange } from './AuditLogEntry.js'
export {
  AutoModerationActionExecution,
  AutoModerationRule,
  type AutoModerationAction,
  type AutoModerationActionMetadata,
  type AutoModerationTriggerMetadata,
} from './AutoModerationRule.js'
export type { CacheCapable, RestCapable } from './capabilities.js'
export type { Changes, ChangesDraft } from './Changes.js'
export {
  defaultAvatarUrl,
  guildBannerUrl,
  guildDiscoverySplashUrl,
  guildIconUrl,
  guildSplashUrl,
  isAnimatedHash,
  memberAvatarUrl,
  memberBannerUrl,
  roleIconUrl,
  userAvatarUrl,
  userBannerUrl,
  type ImageFormat,
  type ImageOptions,
} from './cdn.js'
export * from './channels/index.js'
export { createEmoji, Emoji } from './Emoji.js'
export { GuildMember, type GuildMemberChanges, type GuildMemberChangeField } from './GuildMember.js'
export { GuildScheduledEvent } from './GuildScheduledEvent.js'
export {
  Interaction,
  type AutocompleteInteraction,
  type CommandInteraction,
  type ComponentInteraction,
  type ModalSubmitInteraction,
} from './Interaction.js'
export { Invite } from './Invite.js'
export {
  Presence,
  type ClientStatus,
  type PresenceChanges,
  type PresenceChangeField,
} from './Presence.js'
export { messageLink, parseMessageLink, type MessageLinkTarget } from './links.js'
export {
  Message,
  type CompleteMessage,
  type MessageChanges,
  type MessageChangeField,
} from './Message.js'
export { ReactionEmoji } from './ReactionEmoji.js'
export { Role, type RoleColors, type RoleChanges, type RoleChangeField } from './Role.js'
export { StageInstance } from './StageInstance.js'
export { Sticker } from './Sticker.js'
export { User, type UserChanges, type UserChangeField } from './User.js'
export { VoiceState } from './VoiceState.js'
export { snowflakeDate, snowflakeTimestamp } from './snowflake.js'
