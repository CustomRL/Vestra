/**
 * User-related enumerations.
 */

/**
 * Flags on a user account, commonly surfaced as profile badges.
 */
export const UserFlags = {
  /** Discord employee. */
  Staff: 1 << 0,
  /** Partnered server owner. */
  Partner: 1 << 1,
  /** HypeSquad events member. */
  HypeSquad: 1 << 2,
  /** Bug hunter, level 1. */
  BugHunterLevel1: 1 << 3,
  /** House Bravery member. */
  HypeSquadOnlineHouse1: 1 << 6,
  /** House Brilliance member. */
  HypeSquadOnlineHouse2: 1 << 7,
  /** House Balance member. */
  HypeSquadOnlineHouse3: 1 << 8,
  /** Early Nitro supporter. */
  PremiumEarlySupporter: 1 << 9,
  /** The user is actually a team, not a person. */
  TeamPseudoUser: 1 << 10,
  /** Bug hunter, level 2. */
  BugHunterLevel2: 1 << 14,
  /** Verified bot. */
  VerifiedBot: 1 << 16,
  /** Early verified bot developer. */
  VerifiedDeveloper: 1 << 17,
  /** Moderator programme alumni. */
  CertifiedModerator: 1 << 18,
  /** Bot uses only HTTP interactions and appears in the online member list. */
  BotHTTPInteractions: 1 << 19,
  /** Bot has been flagged as an active developer. */
  ActiveDeveloper: 1 << 22,
} as const

/**
 * A user flag.
 */
export type UserFlags = (typeof UserFlags)[keyof typeof UserFlags]

/**
 * The Nitro subscription tier on a user account.
 */
export const PremiumType = {
  /** No subscription. */
  None: 0,
  /** Nitro Classic. */
  NitroClassic: 1,
  /** Nitro. */
  Nitro: 2,
  /** Nitro Basic. */
  NitroBasic: 3,
} as const

/**
 * A Nitro subscription tier.
 */
export type PremiumType = (typeof PremiumType)[keyof typeof PremiumType]
