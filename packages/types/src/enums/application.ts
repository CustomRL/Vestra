/**
 * Application-level flags and status codes.
 *
 * @remarks
 * **The privileged intent flags come in pairs and both mean "you have it".** Discord sets the
 * plain flag when an application is verified and approved for an intent, and the `Limited`
 * flag when it is under a hundred guilds and has simply toggled the intent on in the developer
 * portal. Both grant the intent; a bot testing only the plain one concludes it lacks something
 * it is currently using, and does so precisely while it is small enough for that to matter.
 */

/**
 * Flags on an application.
 *
 * @remarks
 * Read as a bit set on `APIApplication.flags`, and mostly read-only — Discord sets them in
 * response to approvals and portal toggles rather than accepting them on an edit.
 */
export const ApplicationFlags = {
  /** Uses the auto-moderation API, and has done recently enough to show the badge. */
  ApplicationAutoModerationRuleCreateBadge: 1 << 6,
  /** Verified and approved for the `GuildPresences` intent. */
  GatewayPresence: 1 << 12,
  /** Under a hundred guilds, with `GuildPresences` toggled on in the portal. */
  GatewayPresenceLimited: 1 << 13,
  /** Verified and approved for the `GuildMembers` intent. */
  GatewayGuildMembers: 1 << 14,
  /** Under a hundred guilds, with `GuildMembers` toggled on in the portal. */
  GatewayGuildMembersLimited: 1 << 15,
  /** Blocked from verification for having too many members pending verification gating. */
  VerificationPendingGuildLimit: 1 << 16,
  /** An embedded activity rather than a bot. */
  Embedded: 1 << 17,
  /** Verified and approved for the `MessageContent` intent. */
  GatewayMessageContent: 1 << 18,
  /** Under a hundred guilds, with `MessageContent` toggled on in the portal. */
  GatewayMessageContentLimited: 1 << 19,
  /** Has registered at least one global application command. */
  ApplicationCommandBadge: 1 << 23,
} as const

/** One of {@link ApplicationFlags}. */
export type ApplicationFlags = (typeof ApplicationFlags)[keyof typeof ApplicationFlags]

/**
 * Whether an application receives webhook events, and who decided.
 */
export const ApplicationEventWebhookStatus = {
  /** Turned off by the developer. */
  Disabled: 1,
  /** Turned on by the developer. */
  Enabled: 2,
  /**
   * Turned off by Discord.
   *
   * @remarks
   * Not settable, and not the same as `Disabled`: Discord disables an endpoint that has been
   * failing, so seeing this means the URL was unreachable rather than that anybody chose it.
   */
  DisabledByDiscord: 3,
} as const

/** One of {@link ApplicationEventWebhookStatus}. */
export type ApplicationEventWebhookStatus =
  (typeof ApplicationEventWebhookStatus)[keyof typeof ApplicationEventWebhookStatus]

/**
 * Where a team member stands.
 */
export const TeamMembershipState = {
  /** Invited and has not accepted. */
  Invited: 1,
  /** Accepted. */
  Accepted: 2,
} as const

/** One of {@link TeamMembershipState}. */
export type TeamMembershipState = (typeof TeamMembershipState)[keyof typeof TeamMembershipState]
