import type { Snowflake } from '../globals.js'

/**
 * Purchases and subscriptions a message can announce.
 */

/**
 * What a purchase notification message announces.
 *
 * @remarks
 * Discord's reference tables do not describe this object; the shape follows its published
 * OpenAPI specification and the community documentation, which disagree on whether
 * `guild_product_purchase` is omitted or sent as `null` when there is nothing to report.
 */
export interface APIMessagePurchaseNotification {
  /**
   * The kind of purchase.
   *
   * @remarks
   * `0`, a guild product, is the only value defined. Left as a number because this
   * package does not model the enumeration yet.
   */
  type: number
  /** The product that was bought. */
  guild_product_purchase?: APIGuildProductPurchase | null
}

/**
 * A one-off guild product purchase.
 */
export interface APIGuildProductPurchase {
  /** The ID of the product listing that was purchased. */
  listing_id: Snowflake
  /** The name of the product that was purchased. */
  product_name: string
}

/**
 * The subscription behind a role subscription purchase message.
 */
export interface APIRoleSubscriptionData {
  /** The ID of the SKU and listing the user subscribed to. */
  role_subscription_listing_id: Snowflake
  /** The name of the tier the user subscribed to. */
  tier_name: string
  /** The cumulative number of months the user has been subscribed for. */
  total_months_subscribed: number
  /** Whether the message is for a renewal rather than a new purchase. */
  is_renewal: boolean
}
