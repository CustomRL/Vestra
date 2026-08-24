/**
 * Guild-related enumerations.
 */

/**
 * How verified a member must be before they can speak in a guild.
 */
export const VerificationLevel = {
  /** Unrestricted. */
  None: 0,
  /** Must have a verified email. */
  Low: 1,
  /** Must also be registered on Discord for longer than 5 minutes. */
  Medium: 2,
  /** Must also be a member of this guild for longer than 10 minutes. */
  High: 3,
  /** Must also have a verified phone number. */
  VeryHigh: 4,
} as const

/**
 * A guild verification level.
 */
export type VerificationLevel = (typeof VerificationLevel)[keyof typeof VerificationLevel]

/**
 * The default notification setting for a guild's members.
 */
export const DefaultMessageNotificationLevel = {
  /** Notify for every message. */
  AllMessages: 0,
  /** Notify only for messages that mention the member. */
  OnlyMentions: 1,
} as const

/**
 * A default notification level.
 */
export type DefaultMessageNotificationLevel =
  (typeof DefaultMessageNotificationLevel)[keyof typeof DefaultMessageNotificationLevel]

/**
 * Whose messages Discord scans for explicit content.
 */
export const ExplicitContentFilterLevel = {
  /** Nobody's. */
  Disabled: 0,
  /** Members without a role. */
  MembersWithoutRoles: 1,
  /** Everybody's. */
  AllMembers: 2,
} as const

/**
 * An explicit content filter level.
 */
export type ExplicitContentFilterLevel =
  (typeof ExplicitContentFilterLevel)[keyof typeof ExplicitContentFilterLevel]

/**
 * Whether two-factor authentication is required for moderation actions.
 */
export const MFALevel = {
  /** Not required. */
  None: 0,
  /** Required for members with moderation permissions. */
  Elevated: 1,
} as const

/**
 * An MFA requirement level.
 */
export type MFALevel = (typeof MFALevel)[keyof typeof MFALevel]

/**
 * A guild's NSFW classification.
 */
export const GuildNSFWLevel = {
  /** Not yet classified. */
  Default: 0,
  /** Explicit. */
  Explicit: 1,
  /** Safe. */
  Safe: 2,
  /** Age restricted. */
  AgeRestricted: 3,
} as const

/**
 * A guild NSFW level.
 */
export type GuildNSFWLevel = (typeof GuildNSFWLevel)[keyof typeof GuildNSFWLevel]

/**
 * A guild's server boost tier.
 */
export const PremiumTier = {
  /** Unboosted. */
  None: 0,
  /** Boost level 1. */
  Tier1: 1,
  /** Boost level 2. */
  Tier2: 2,
  /** Boost level 3. */
  Tier3: 3,
} as const

/**
 * A server boost tier.
 */
export type PremiumTier = (typeof PremiumTier)[keyof typeof PremiumTier]

/**
 * Which system messages a guild suppresses in its system channel.
 */
export const SystemChannelFlags = {
  /** Suppress member join notifications. */
  SuppressJoinNotifications: 1 << 0,
  /** Suppress server boost notifications. */
  SuppressPremiumSubscriptions: 1 << 1,
  /** Suppress server setup tips. */
  SuppressGuildReminderNotifications: 1 << 2,
  /** Hide the sticker reply button on member join notifications. */
  SuppressJoinNotificationReplies: 1 << 3,
  /** Suppress role subscription purchase notifications. */
  SuppressRoleSubscriptionPurchaseNotifications: 1 << 4,
  /** Hide the sticker reply button on role subscription purchase notifications. */
  SuppressRoleSubscriptionPurchaseNotificationReplies: 1 << 5,
} as const

/**
 * A system channel flag.
 */
export type SystemChannelFlags = (typeof SystemChannelFlags)[keyof typeof SystemChannelFlags]

/**
 * Flags on a guild member.
 */
export const GuildMemberFlags = {
  /** The member has left and rejoined the guild. */
  DidRejoin: 1 << 0,
  /** The member has completed onboarding. */
  CompletedOnboarding: 1 << 1,
  /** The member bypasses guild verification requirements. */
  BypassesVerification: 1 << 2,
  /** The member has started onboarding. */
  StartedOnboarding: 1 << 3,
} as const

/**
 * A guild member flag.
 */
export type GuildMemberFlags = (typeof GuildMemberFlags)[keyof typeof GuildMemberFlags]

/**
 * What a voice-channel invite points at.
 *
 * @remarks
 * Only ever present on invites to a voice channel, and there is no `0`: Discord numbers
 * these from 1, so a falsy check on the field is wrong for `Stream`.
 */
export const InviteTargetType = {
  /** The invite opens a user's ongoing stream in the channel. */
  Stream: 1,
  /** The invite launches an embedded application in the channel. */
  EmbeddedApplication: 2,
} as const

/**
 * An invite target type.
 */
export type InviteTargetType = (typeof InviteTargetType)[keyof typeof InviteTargetType]
