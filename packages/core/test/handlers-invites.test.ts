import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import {
  GatewayOpcodes,
  InviteTargetType,
  type APIUser,
  type GatewayDispatchPayload,
} from '@vestra/types'
import {
  CacheRegistry,
  EventRouter,
  Invite,
  handlers,
  type CacheOptions,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }
const GUILD_ID = '613425648685547541'
const CHANNEL_ID = '41771983423143936'

const INVITER: APIUser = {
  id: '80351110224678912',
  username: 'nelly',
  discriminator: '0',
  global_name: 'Nelly',
  avatar: null,
}

const STREAMER: APIUser = { ...INVITER, id: '90351110224678912', username: 'streamer' }

function invitePayload(extra: Record<string, unknown> = {}): unknown {
  return {
    channel_id: CHANNEL_ID,
    code: 'vestra',
    created_at: '2024-03-01T12:00:00.000000+00:00',
    guild_id: GUILD_ID,
    inviter: INVITER,
    max_age: 86_400,
    max_uses: 25,
    temporary: false,
    uses: 0,
    expires_at: null,
    ...extra,
  }
}

function harness(options: CacheOptions = { users: true }): {
  router: EventRouter
  context: EventContext
  emitted: { event: string; args: unknown[] }[]
} {
  const emitted: { event: string; args: unknown[] }[] = []
  const context: EventContext = {
    cache: new CacheRegistry(options),
    rest: undefined as never,
    user: undefined,
    emit: (event: string, ...args: unknown[]) => {
      emitted.push({ event, args })
      return true
    },
    listenerCount: () => 0,
  } as EventContext

  return { router: new EventRouter(context, handlers), context, emitted }
}

function dispatch(t: string, d: unknown): GatewayDispatchPayload {
  return { op: GatewayOpcodes.Dispatch, t, s: 1, d } as GatewayDispatchPayload
}

describe('invite handlers', () => {
  it('IH1: emits the created invite as a structure', () => {
    const { router, emitted } = harness()
    router.route(dispatch('INVITE_CREATE', invitePayload()), shard, false)

    const last = emitted.at(-1)
    assert.equal(last?.event, 'inviteCreate')
    const invite = last.args[0]
    assert.ok(invite instanceof Invite)
    assert.equal(invite.code, 'vestra')
    assert.equal(invite.channelId, CHANNEL_ID)
    assert.equal(invite.guildId, GUILD_ID)
  })

  it('IH2: learns the inviter and the stream target as users', () => {
    // An invite is often the first full user object a bot sees for whoever made it — the same
    // reasoning `bans.ts` gives. Without the upsert the payload's user is thrown away and the
    // users scope never hears about it.
    const { router, context } = harness()
    router.route(
      dispatch(
        'INVITE_CREATE',
        invitePayload({ target_type: InviteTargetType.Stream, target_user: STREAMER }),
      ),
      shard,
      false,
    )

    assert.equal(context.cache.users.get(INVITER.id)?.username, 'nelly')
    assert.equal(context.cache.users.get(STREAMER.id)?.username, 'streamer')
  })

  it('IH3: keeps the user object a listener already holds', () => {
    // Upsert rather than replace: a replay of the same dispatch after a resume must not swap
    // out the `User` somebody is holding, or a held reference silently stops tracking.
    const { router, context } = harness()
    router.route(dispatch('INVITE_CREATE', invitePayload()), shard, false)
    const first = context.cache.users.get(INVITER.id)

    router.route(dispatch('INVITE_CREATE', invitePayload()), shard, true)

    assert.equal(context.cache.users.get(INVITER.id), first)
    assert.equal(context.cache.users.size, 1)
  })

  it('IH4: emits an invite with no inviter when Discord sends none', () => {
    // A vanity URL invite and an invite made by a since-deleted integration both arrive
    // without one, so the absent case is real rather than defensive.
    const { router, context, emitted } = harness()
    router.route(dispatch('INVITE_CREATE', invitePayload({ inviter: undefined })), shard, false)

    const invite = emitted.at(-1)?.args[0]
    assert.ok(invite instanceof Invite)
    assert.equal(invite.inviter, undefined)
    assert.equal(context.cache.users.size, 0)
  })

  it('IH5: emits the code, channel and guild of a deleted invite, in that order', () => {
    // IDs rather than a structure: nothing is cached and the payload carries nothing else, so
    // there is no invite to hand over. The order is asserted because all three are strings and
    // a swap type-checks.
    const { router, emitted } = harness()
    router.route(
      dispatch('INVITE_DELETE', { channel_id: CHANNEL_ID, guild_id: GUILD_ID, code: 'vestra' }),
      shard,
      false,
    )

    assert.deepEqual(emitted.at(-1), {
      event: 'inviteDelete',
      args: ['vestra', CHANNEL_ID, GUILD_ID],
    })
  })

  it('IH6: reports no guild for a group direct message invite', () => {
    const { router, emitted } = harness()
    router.route(
      dispatch('INVITE_DELETE', { channel_id: CHANNEL_ID, code: 'vestra' }),
      shard,
      false,
    )

    assert.deepEqual(emitted.at(-1), {
      event: 'inviteDelete',
      args: ['vestra', CHANNEL_ID, undefined],
    })
  })

  it('IH7: caches no invite anywhere', () => {
    // The decision recorded on `Invite`: an invite is keyed by a code rather than a snowflake
    // and expires on a timer Discord never announces, so there is no scope for it. This fails
    // if one is quietly added by writing invites into an existing store.
    const { router, context } = harness({
      guilds: true,
      channels: true,
      threads: true,
      roles: true,
      members: true,
      users: true,
      messages: true,
      emojis: true,
      stickers: true,
      presences: true,
      voiceStates: true,
    })

    router.route(dispatch('INVITE_CREATE', invitePayload({ inviter: undefined })), shard, false)

    const filled = context.cache.stores
      .filter((store) => store.size > 0)
      .map((store) => store.scope)
    assert.deepEqual(filled, [], 'INVITE_CREATE must write to no scope')
  })
})
