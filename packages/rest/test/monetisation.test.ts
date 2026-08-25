import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REST } from '@vestra/rest'
import { EntitlementOwnerType } from '@vestra/types'
import { json, startMockDiscord, type MockDiscord, type RecordedRequest } from './mock-discord.ts'

/**
 * Entitlement, SKU and subscription endpoints.
 *
 * @remarks
 * The last of the absent REST families, and the one where a default is actively dangerous.
 * **Listing entitlements includes expired ones unless `exclude_ended` says otherwise**, so the
 * obvious "does this user have the premium SKU" check answers yes for somebody whose
 * subscription lapsed months ago. `MN2` is that flag reaching the wire.
 *
 * The rest is keeping two similar resources apart. A SKU is what is for sale; an entitlement
 * is what a purchase produced. They live under the same application and read alike, and only
 * one of them answers an access question.
 */

const APPLICATION = '292180391104217088'
const ENTITLEMENT = '1019653849998299136'
const SKU = '1088510058284990888'
const USER = '80351110224678912'
const GUILD = '613425648685547541'

/** Records every request and answers each with the given body. */
async function recording(body: unknown = {}): Promise<MockDiscord> {
  return await startMockDiscord((_request, response) => {
    json(response, 200, body)
  })
}

function clientFor(mock: MockDiscord): REST {
  return new REST({ api: mock.url, version: '10', timeout: 2_000 }).setToken('t0ken')
}

/** The one request the mock received. */
function only(mock: MockDiscord): RecordedRequest {
  assert.equal(mock.requests.length, 1, 'expected exactly one request')
  const request = mock.requests[0]
  assert.ok(request !== undefined)
  return request
}

describe('SKU and entitlement routes', () => {
  it('MN1: keeps SKUs and entitlements on separate paths', async () => {
    // Same application, two resources, and only one of them answers "may this user do the
    // premium thing". Reading the store listing as an access check is the confusion the two
    // paths exist to prevent.
    const mock = await recording([])
    try {
      const rest = clientFor(mock)
      await rest.monetisation.getSKUs(APPLICATION)
      await rest.monetisation.getEntitlements(APPLICATION)

      assert.deepEqual(
        mock.requests.map((request) => request.url),
        [`/v10/applications/${APPLICATION}/skus`, `/v10/applications/${APPLICATION}/entitlements`],
      )
    } finally {
      await mock.close()
    }
  })

  it('MN2: sends exclude_ended, without which the check is wrong for every lapsed user', async () => {
    // Discord's default is `false`. A bot that omits this and treats a non-empty result as
    // "has premium" grants access to everybody who ever paid, forever.
    const mock = await recording([])
    try {
      await clientFor(mock).monetisation.getEntitlements(APPLICATION, {
        user_id: USER,
        exclude_ended: true,
        limit: 100,
      })
      const request = only(mock)

      assert.match(request.url, new RegExp(`^/v10/applications/${APPLICATION}/entitlements\\?`))
      assert.match(request.url, /[?&]exclude_ended=true(&|$)/)
      assert.match(request.url, new RegExp(`[?&]user_id=${USER}(&|$)`))
      assert.equal(request.body, '', 'a GET must not carry a body')
    } finally {
      await mock.close()
    }
  })

  it('MN3: consumes with POST and deletes a test entitlement with DELETE', async () => {
    // Two operations on nearly the same path with different meanings and different
    // eligibility: consuming applies to a `Consumable` SKU and is irreversible; deleting
    // applies only to a test entitlement, because a real one is the record of a payment.
    const mock = await recording()
    try {
      const rest = clientFor(mock)
      await rest.monetisation.consumeEntitlement(APPLICATION, ENTITLEMENT)
      await rest.monetisation.deleteTestEntitlement(APPLICATION, ENTITLEMENT)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `POST /v10/applications/${APPLICATION}/entitlements/${ENTITLEMENT}/consume`,
          `DELETE /v10/applications/${APPLICATION}/entitlements/${ENTITLEMENT}`,
        ],
      )
    } finally {
      await mock.close()
    }
  })

  it('MN4: grants a test entitlement with an owner and its type', async () => {
    // `owner_type` decides whether the grant is guild-wide or one person's, and both IDs are
    // snowflakes — so nothing but the field says which was meant.
    const mock = await recording({ id: ENTITLEMENT })
    try {
      await clientFor(mock).monetisation.createTestEntitlement(APPLICATION, {
        sku_id: SKU,
        owner_id: GUILD,
        owner_type: EntitlementOwnerType.Guild,
      })
      const request = only(mock)

      assert.equal(request.method, 'POST')
      assert.deepEqual(JSON.parse(request.body), {
        sku_id: SKU,
        owner_id: GUILD,
        owner_type: EntitlementOwnerType.Guild,
      })
    } finally {
      await mock.close()
    }
  })
})

describe('subscription routes', () => {
  it('MN5: reads subscriptions under the SKU, not under the application', async () => {
    // The one family member that hangs off `/skus` rather than `/applications`, which is easy
    // to get wrong given everything else here is addressed by application.
    const mock = await recording([])
    try {
      const rest = clientFor(mock)
      await rest.monetisation.getSubscriptions(SKU, { user_id: USER })
      await rest.monetisation.getSubscription(SKU, '1')

      const listed = mock.requests[0]
      assert.ok(listed !== undefined)
      assert.match(listed.url, new RegExp(`^/v10/skus/${SKU}/subscriptions\\?`))
      assert.match(listed.url, new RegExp(`[?&]user_id=${USER}(&|$)`))
      assert.equal(mock.requests[1]?.url, `/v10/skus/${SKU}/subscriptions/1`)
    } finally {
      await mock.close()
    }
  })
})
