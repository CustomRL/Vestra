import type {
  APIEntitlement,
  APISKU,
  APISubscription,
  RESTGetAPIEntitlementsQuery,
  RESTGetAPISKUSubscriptionsQuery,
  RESTPostAPIEntitlementJSONBody,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * Entitlement, SKU and subscription endpoints.
 *
 * @remarks
 * **A SKU is what is for sale; an entitlement is what a purchase produced.** An access check
 * reads entitlements, a store listing reads SKUs, and a bot usually has one of each — which is
 * what makes them easy to confuse.
 *
 * **Listing entitlements includes expired ones unless asked otherwise.** `exclude_ended`
 * defaults to `false`, so the obvious "does this user have the premium SKU" check answers yes
 * for somebody whose subscription lapsed months ago. That default is Discord's, and it is the
 * easiest mistake to make in this family — {@link MonetisationRoutes.getEntitlements} says so
 * where a caller will read it.
 *
 * **A test entitlement is not a purchase.** It grants access without payment and comes back
 * with no `starts_at` or `ends_at`, so code that reads those to decide validity behaves
 * differently in testing from in production unless it tolerates their absence.
 */
export class MonetisationRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Lists what an application sells.
   *
   * @param applicationId - The application.
   * @param options - Request options.
   * @returns Its SKUs.
   *
   * @remarks
   * A subscription SKU always arrives with a `SubscriptionGroup` beside it, created by Discord
   * and not purchasable. A store listing that does not filter offers the container as if it
   * were a product.
   */
  async getSKUs(applicationId: Snowflake, options: RouteOptions = {}): Promise<APISKU[]> {
    return await this.#rest.get<APISKU[]>(`/applications/${applicationId}/skus`, options)
  }

  /**
   * Lists an application's entitlements.
   *
   * @param applicationId - The application.
   * @param query - Filters and pagination.
   * @param options - Request options.
   * @returns The entitlements.
   *
   * @remarks
   * **Send `exclude_ended: true` for an access check.** It defaults to `false`, so without it
   * this answers with entitlements that expired months ago and a bot that treats a non-empty
   * result as "has premium" is wrong for every lapsed subscriber.
   *
   * Narrow with `guild_id` or `user_id` rather than filtering afterwards: the unfiltered
   * listing pages through the application's entire purchase history.
   */
  async getEntitlements(
    applicationId: Snowflake,
    query: RESTGetAPIEntitlementsQuery = {},
    options: RouteOptions = {},
  ): Promise<APIEntitlement[]> {
    return await this.#rest.get<APIEntitlement[]>(`/applications/${applicationId}/entitlements`, {
      ...options,
      query: query as Record<string, string | number | boolean | undefined>,
    })
  }

  /**
   * Fetches one entitlement.
   *
   * @param applicationId - The application.
   * @param entitlementId - The entitlement.
   * @param options - Request options.
   * @returns The entitlement.
   */
  async getEntitlement(
    applicationId: Snowflake,
    entitlementId: Snowflake,
    options: RouteOptions = {},
  ): Promise<APIEntitlement> {
    return await this.#rest.get<APIEntitlement>(
      `/applications/${applicationId}/entitlements/${entitlementId}`,
      options,
    )
  }

  /**
   * Marks a consumable entitlement as used up.
   *
   * @param applicationId - The application.
   * @param entitlementId - The entitlement.
   * @param options - Request options.
   *
   * @remarks
   * Only for `Consumable` SKUs, and irreversible. A durable or subscription entitlement
   * answers a 400 rather than doing nothing, which is the right way round: consuming what
   * cannot be consumed is a bug rather than a no-op.
   */
  async consumeEntitlement(
    applicationId: Snowflake,
    entitlementId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.post<undefined>(
      `/applications/${applicationId}/entitlements/${entitlementId}/consume`,
      options,
    )
  }

  /**
   * Grants a test entitlement, without payment.
   *
   * @param applicationId - The application.
   * @param body - The SKU, and who to grant it to.
   * @param options - Request options.
   * @returns The entitlement.
   *
   * @remarks
   * For exercising the premium path in development. It comes back with **no `starts_at` or
   * `ends_at`**, so code reading those to decide validity has to tolerate their absence or it
   * behaves differently here from in production.
   */
  async createTestEntitlement(
    applicationId: Snowflake,
    body: RESTPostAPIEntitlementJSONBody,
    options: RouteOptions = {},
  ): Promise<APIEntitlement> {
    return await this.#rest.post<APIEntitlement>(`/applications/${applicationId}/entitlements`, {
      ...options,
      body,
    })
  }

  /**
   * Removes a test entitlement.
   *
   * @param applicationId - The application.
   * @param entitlementId - The entitlement.
   * @param options - Request options.
   *
   * @remarks
   * Test entitlements only. A real one cannot be deleted, because it is the record of a
   * payment.
   */
  async deleteTestEntitlement(
    applicationId: Snowflake,
    entitlementId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(
      `/applications/${applicationId}/entitlements/${entitlementId}`,
      options,
    )
  }

  /**
   * Lists a SKU's subscriptions.
   *
   * @param skuId - The SKU.
   * @param query - Filters and pagination.
   * @param options - Request options.
   * @returns The subscriptions.
   *
   * @remarks
   * `user_id` is required unless the request carries an OAuth token for that user, which for a
   * bot token means always.
   */
  async getSubscriptions(
    skuId: Snowflake,
    query: RESTGetAPISKUSubscriptionsQuery = {},
    options: RouteOptions = {},
  ): Promise<APISubscription[]> {
    return await this.#rest.get<APISubscription[]>(`/skus/${skuId}/subscriptions`, {
      ...options,
      query: query as Record<string, string | number | boolean | undefined>,
    })
  }

  /**
   * Fetches one subscription.
   *
   * @param skuId - The SKU.
   * @param subscriptionId - The subscription.
   * @param options - Request options.
   * @returns The subscription.
   */
  async getSubscription(
    skuId: Snowflake,
    subscriptionId: Snowflake,
    options: RouteOptions = {},
  ): Promise<APISubscription> {
    return await this.#rest.get<APISubscription>(
      `/skus/${skuId}/subscriptions/${subscriptionId}`,
      options,
    )
  }
}
