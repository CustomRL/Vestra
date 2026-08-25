import type { Snowflake } from '../globals.js'
import type { EntitlementOwnerType } from '../enums/monetisation.js'
import type { APIEntitlement, APISKU, APISubscription } from '../payloads/monetisation.js'

/**
 * Monetisation queries, bodies and results.
 *
 * @remarks
 * **An entitlement is what a purchase produces, and a SKU is what was bought.** Access checks
 * read entitlements; a store listing reads SKUs. The two are easy to confuse because a bot
 * usually has one of each.
 *
 * **Listing entitlements includes expired ones by default.** `exclude_ended` is what turns the
 * route into an access check, and without it a bot grants premium features to somebody whose
 * subscription lapsed months ago. That default is Discord's, and it is the single easiest
 * mistake to make in this family.
 */

/**
 * `GET /applications/{application.id}/entitlements`
 *
 * @remarks
 * `before` and `after` are entitlement IDs and page in opposite directions. `guild_id` and
 * `user_id` narrow to one owner, which is what an access check wants — listing everything and
 * filtering client-side works and pages through the whole history to do it.
 */
export interface RESTGetAPIEntitlementsQuery {
  /** Only entitlements for this user. */
  user_id?: Snowflake
  /** Only entitlements for these SKUs, comma-separated. */
  sku_ids?: string
  /** Entitlements before this ID. */
  before?: Snowflake
  /** Entitlements after this ID. */
  after?: Snowflake
  /** How many, from 1 to 100. Defaults to 100. */
  limit?: number
  /** Only entitlements for this guild. */
  guild_id?: Snowflake
  /** Whether to leave out entitlements that have ended. Defaults to `false`. */
  exclude_ended?: boolean
  /** Whether to leave out entitlements that have been deleted. Defaults to `true`. */
  exclude_deleted?: boolean
}

/** The result of `GET /applications/{application.id}/entitlements`. */
export type RESTGetAPIEntitlementsResult = APIEntitlement[]

/** The result of `GET /applications/{application.id}/entitlements/{entitlement.id}`. */
export type RESTGetAPIEntitlementResult = APIEntitlement

/**
 * `POST /applications/{application.id}/entitlements`
 *
 * @remarks
 * **A test entitlement, and it is not a purchase.** It grants access without payment so a
 * developer can exercise the premium path, and it comes back with no `starts_at` or `ends_at`
 * — which means code that reads those to decide validity has to tolerate their absence, or it
 * will behave differently in testing from in production.
 */
export interface RESTPostAPIEntitlementJSONBody {
  /** The SKU to grant. */
  sku_id: Snowflake
  /** The guild or user to grant it to. */
  owner_id: Snowflake
  /** Whether `owner_id` is a guild or a user. */
  owner_type: EntitlementOwnerType
}

/** The result of `POST /applications/{application.id}/entitlements`. */
export type RESTPostAPIEntitlementResult = APIEntitlement

/** The result of `GET /applications/{application.id}/skus`. */
export type RESTGetAPISKUsResult = APISKU[]

/**
 * `GET /skus/{sku.id}/subscriptions`
 *
 * @remarks
 * `user_id` is required unless the request carries an OAuth token for that user, which for a
 * bot means it is always required.
 */
export interface RESTGetAPISKUSubscriptionsQuery {
  /** Subscriptions before this ID. */
  before?: Snowflake
  /** Subscriptions after this ID. */
  after?: Snowflake
  /** How many, from 1 to 100. Defaults to 50. */
  limit?: number
  /** Whose subscriptions. Required for a bot token. */
  user_id?: Snowflake
}

/** The result of `GET /skus/{sku.id}/subscriptions`. */
export type RESTGetAPISKUSubscriptionsResult = APISubscription[]

/** The result of `GET /skus/{sku.id}/subscriptions/{subscription.id}`. */
export type RESTGetAPISKUSubscriptionResult = APISubscription
