/**
 * Monetisation enumerations.
 */

/**
 * How an entitlement was acquired.
 *
 * @remarks
 * Most values describe how Discord itself granted access and never appear for an
 * ordinary application: `ApplicationSubscription` is what a subscribing user's
 * entitlement carries, and `TestModePurchase` is what the test entitlement endpoints
 * produce. There is no `9`.
 */
export const EntitlementType = {
  /** The user bought the SKU outright. */
  Purchase: 1,
  /** The entitlement comes from a Discord Nitro subscription, not from an application. */
  PremiumSubscription: 2,
  /** The application's developer gifted the entitlement. */
  DeveloperGift: 3,
  /** Created through the test entitlement endpoint, valid in perpetuity. */
  TestModePurchase: 4,
  /** Granted automatically because the SKU was free. */
  FreePurchase: 5,
  /** Another user gifted the entitlement. */
  UserGift: 6,
  /** Claimed for free by a Nitro subscriber. */
  PremiumPurchase: 7,
  /** Bought as a subscription to the application. */
  ApplicationSubscription: 8,
  /**
   * Granted as a reward for completing a quest.
   *
   * @remarks
   * Present in Discord's OpenAPI specification but absent from its reference tables.
   */
  QuestReward: 10,
} as const

/**
 * An entitlement type.
 */
export type EntitlementType = (typeof EntitlementType)[keyof typeof EntitlementType]

/**
 * What a test entitlement is granted to.
 *
 * @remarks
 * Only used when creating a test entitlement, to say how `owner_id` should be read. It
 * is not a field on {@link APIEntitlement}, which distinguishes the two cases by which of
 * `user_id` and `guild_id` it carries.
 */
export const EntitlementOwnerType = {
  /** `owner_id` is a guild ID, granting the whole guild access. */
  Guild: 1,
  /** `owner_id` is a user ID, granting one user access. */
  User: 2,
} as const

/**
 * An entitlement owner type.
 */
export type EntitlementOwnerType = (typeof EntitlementOwnerType)[keyof typeof EntitlementOwnerType]

/**
 * Where a subscription stands with Discord's billing.
 *
 * @remarks
 * Not a signal to grant perks. A subscription can be `Active` outside its current period
 * while a failed payment is retried, and `Inactive` inside one after a refund or
 * chargeback, so the status and the period disagree often enough that acting on it grants
 * access that was paid for and then reversed. Entitlements are the authority; this is
 * billing state.
 */
export const SubscriptionStatus = {
  /** Being charged and scheduled to renew. */
  Active: 0,
  /** Not being charged. */
  Inactive: 1,
  /** Cancelled, still running out the current period, and will not renew. */
  Ending: 2,
} as const

/**
 * A subscription status.
 */
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus]

/**
 * What a SKU sells.
 *
 * @remarks
 * Only `Subscription` is purchasable; `SubscriptionGroup` is the container Discord creates
 * alongside it and shows in the store, and a bot listing SKUs sees both. Filtering to
 * `Subscription` is almost always what a caller wants — the group has no price and cannot be
 * bought.
 */
export const SKUType = {
  /** A one-off purchase that stays owned. */
  Durable: 2,
  /** A one-off purchase that is used up. */
  Consumable: 3,
  /** A recurring subscription. */
  Subscription: 5,
  /** The system-created container for a subscription. Not purchasable. */
  SubscriptionGroup: 6,
} as const

/** One of {@link SKUType}. */
export type SKUType = (typeof SKUType)[keyof typeof SKUType]

/**
 * Flags on a SKU.
 *
 * @remarks
 * `GuildSubscription` and `UserSubscription` are mutually exclusive and decide who owns the
 * entitlement a purchase creates — a guild-wide unlock or one person's. Reading the wrong one
 * grants the wrong scope.
 */
export const SKUFlags = {
  /** The SKU is available for purchase. */
  Available: 1 << 2,
  /** Bought once for a guild, and everybody in it has access. */
  GuildSubscription: 1 << 7,
  /** Bought by one user, who has access everywhere. */
  UserSubscription: 1 << 8,
} as const

/** One of {@link SKUFlags}. */
export type SKUFlags = (typeof SKUFlags)[keyof typeof SKUFlags]
