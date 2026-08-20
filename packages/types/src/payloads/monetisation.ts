import type { ISO8601Timestamp, Snowflake } from '../globals.js'
import type { EntitlementType, SubscriptionStatus } from '../enums/monetisation.js'

/**
 * Premium offerings: what a message announces about a purchase, and the entitlements and
 * subscriptions behind one.
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

/**
 * A user's or guild's access to a premium offering in an application.
 *
 * @remarks
 * This, not {@link APISubscription}, is what decides whether to grant a perk. An
 * entitlement exists once payment has actually settled, whereas a subscription exists
 * from the moment one is attempted.
 *
 * Entitlements are not deleted when they expire — an expired one stays, with `ends_at` in
 * the past. `ENTITLEMENT_DELETE` means the purchase was reversed or revoked, which is
 * rare. To decide whether access is current, compare `ends_at`; do not wait for a delete.
 *
 * `POST /applications/{application.id}/entitlements` is the exception to the shape: it
 * returns a *partial* entitlement, because a test entitlement is valid in perpetuity and
 * so has no period to report.
 */
export interface APIEntitlement {
  /** The entitlement's ID. */
  id: Snowflake
  /** The ID of the SKU the entitlement grants access to. */
  sku_id: Snowflake
  /** The ID of the application the SKU belongs to. */
  application_id: Snowflake
  /**
   * The ID of the user granted access.
   *
   * @remarks
   * Discord's reference table marks this optional while its OpenAPI specification marks
   * it required. Treated as optional here, since assuming a field that may be absent is
   * the more expensive mistake.
   */
  user_id?: Snowflake
  /** How the entitlement was acquired. */
  type: EntitlementType
  /** Whether the entitlement has been revoked. */
  deleted: boolean
  /** When the entitlement became valid. `null` for one that never expires. */
  starts_at: ISO8601Timestamp | null
  /** When the entitlement stops being valid. `null` for one that never expires. */
  ends_at: ISO8601Timestamp | null
  /**
   * The ID of the guild granted access.
   *
   * @remarks
   * Present for a guild subscription, where the whole guild holds the entitlement rather
   * than the buyer. Discord's reference table marks it merely optional while its OpenAPI
   * specification also allows `null`, so both cases are spelled out.
   */
  guild_id?: Snowflake | null
  /**
   * Whether a one-time purchase consumable has been consumed.
   *
   * @remarks
   * Only ever set on consumable SKUs, and only after
   * `POST /applications/{application.id}/entitlements/{entitlement.id}/consume`. Discord
   * does not delete a consumed entitlement, so this flag is the only thing distinguishing
   * a spent purchase from an unspent one.
   */
  consumed?: boolean
  /** When the entitlement was fulfilled. */
  fulfilled_at?: ISO8601Timestamp | null
  /**
   * How far through fulfilment the entitlement is.
   *
   * @remarks
   * Discord's OpenAPI specification names eight values — `UNKNOWN`, `FULFILLMENT_NOT_NEEDED`,
   * `FULFILLMENT_NEEDED`, `FULFILLED`, `FULFILLMENT_FAILED`, `UNFULFILLMENT_NEEDED`,
   * `UNFULFILLED` and `UNFULFILLMENT_FAILED`, in that order from `0` — but describes none
   * of them. Left as a number rather than modelled as an enumeration whose meanings would
   * be guesses.
   */
  fulfillment_status?: number | null
  /** The ID of the user who gifted the entitlement, for the gift types. */
  gifter_user_id?: Snowflake | null
  /** The ID of the entitlement this one derives from. */
  parent_id?: Snowflake | null
}

/**
 * A user's recurring payment for one or more SKUs.
 *
 * @remarks
 * A subscription describes billing, not access. Discord creates one as soon as a purchase
 * is attempted, so `SUBSCRIPTION_CREATE` can arrive with `status` already
 * {@link SubscriptionStatus.Inactive} and no payment taken. Grant perks from
 * {@link APIEntitlement}, which only exists once money has actually changed hands.
 *
 * The subscription's own start is fixed by its ID; `current_period_start` and
 * `current_period_end` move forward on each renewal.
 */
export interface APISubscription {
  /** The subscription's ID. */
  id: Snowflake
  /** The ID of the subscribed user. */
  user_id: Snowflake
  /** The IDs of the SKUs currently subscribed to. */
  sku_ids: Snowflake[]
  /**
   * The IDs of the entitlements this subscription has granted.
   *
   * @remarks
   * Empty until the first payment settles, which is why a freshly created subscription is
   * not yet grounds for access.
   */
  entitlement_ids: Snowflake[]
  /**
   * The IDs of the SKUs the user will hold after the next renewal.
   *
   * @remarks
   * `null` when the renewal changes nothing, so a plan change is visible as this
   * differing from `sku_ids` rather than as a separate field.
   */
  renewal_sku_ids: Snowflake[] | null
  /** The start of the current subscription period. */
  current_period_start: ISO8601Timestamp
  /** The end of the current subscription period. */
  current_period_end: ISO8601Timestamp
  /** Where the subscription stands with Discord's billing. */
  status: SubscriptionStatus
  /**
   * When the user cancelled, or `null` if they have not.
   *
   * @remarks
   * Set together with {@link SubscriptionStatus.Ending}; the subscription keeps running
   * until `current_period_end`.
   */
  canceled_at: ISO8601Timestamp | null
  /**
   * The ISO 3166-1 alpha-2 country code of the payment source used.
   *
   * @remarks
   * Absent unless the subscription was queried under a private OAuth scope, so a bot
   * token never sees it. Discord's reference table marks it merely optional while its
   * OpenAPI specification also allows `null`.
   */
  country?: string | null
}
