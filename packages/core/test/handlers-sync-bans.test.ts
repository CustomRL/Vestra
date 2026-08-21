import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import { ChannelType, GatewayOpcodes, type GatewayDispatchPayload } from '@vestra/types'
import {
  CacheRegistry,
  EventRouter,
  handlers,
  User,
  type CacheOptions,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }
const GUILD_ID = '613425648685547541'
const OTHER_GUILD = '999'
const PARENT_A = '100'
const PARENT_B = '200'
const USER = {
  id: '80351110224678912',
  username: 'nelly',
  discriminator: '0',
  global_name: null,
  avatar: null,
}

function thread(id: string, parentId: string): unknown {
  return {
    id,
    type: ChannelType.PublicThread,
    name: `thread-${id}`,
    position: 0,
    parent_id: parentId,
    thread_metadata: {
      archived: false,
      auto_archive_duration: 1440,
      archive_timestamp: '2023-01-01T00:00:00+00:00',
      locked: false,
    },
  }
}

function harness(options: CacheOptions = { threads: true, users: true }): {
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

describe('thread list sync', () => {
  it('TS1: caches the threads it was given', () => {
    const { router, context, emitted } = harness()
    router.route(
      dispatch('THREAD_LIST_SYNC', {
        guild_id: GUILD_ID,
        threads: [thread('1', PARENT_A), thread('2', PARENT_A)],
        members: [],
      }),
      shard,
      false,
    )

    assert.equal(context.cache.threads.size, 2)
    assert.equal(emitted.at(-1)?.event, 'threadListSync')
  })

  it('TS2: drops a thread the sync no longer lists', () => {
    // A thread that was archived while the bot was away is expressed only as an absence from
    // the next sync. Adding what arrived and stopping there leaves it cached forever.
    const { router, context } = harness()
    router.route(
      dispatch('THREAD_LIST_SYNC', {
        guild_id: GUILD_ID,
        threads: [thread('1', PARENT_A), thread('2', PARENT_A)],
        members: [],
      }),
      shard,
      false,
    )

    router.route(
      dispatch('THREAD_LIST_SYNC', {
        guild_id: GUILD_ID,
        threads: [thread('1', PARENT_A)],
        members: [],
      }),
      shard,
      false,
    )

    assert.equal(context.cache.threads.get('1')?.id, '1')
    assert.equal(context.cache.threads.get('2'), undefined)
  })

  it('TS3: leaves other guilds alone', () => {
    const { router, context } = harness()
    router.route(
      dispatch('THREAD_LIST_SYNC', {
        guild_id: OTHER_GUILD,
        threads: [thread('9', PARENT_A)],
        members: [],
      }),
      shard,
      false,
    )

    router.route(
      dispatch('THREAD_LIST_SYNC', { guild_id: GUILD_ID, threads: [], members: [] }),
      shard,
      false,
    )

    assert.equal(context.cache.threads.get('9')?.id, '9')
  })

  it('TS4: a scoped sync touches only the channels it names', () => {
    // Regaining access to one channel must not evict the threads of every other, which is what
    // makes `channel_ids` load-bearing rather than informational.
    const { router, context } = harness()
    router.route(
      dispatch('THREAD_LIST_SYNC', {
        guild_id: GUILD_ID,
        threads: [thread('1', PARENT_A), thread('2', PARENT_B)],
        members: [],
      }),
      shard,
      false,
    )

    router.route(
      dispatch('THREAD_LIST_SYNC', {
        guild_id: GUILD_ID,
        channel_ids: [PARENT_A],
        threads: [],
        members: [],
      }),
      shard,
      false,
    )

    assert.equal(context.cache.threads.get('1'), undefined)
    assert.equal(context.cache.threads.get('2')?.id, '2')
  })

  it('TS5: an empty guild-wide sync means the guild has no active threads', () => {
    // Absent `channel_ids` covers everything, so this is "there are none" rather than "nothing
    // to report" — and getting that backwards leaves every thread cached forever.
    const { router, context } = harness()
    router.route(
      dispatch('THREAD_LIST_SYNC', {
        guild_id: GUILD_ID,
        threads: [thread('1', PARENT_A), thread('2', PARENT_B)],
        members: [],
      }),
      shard,
      false,
    )

    router.route(
      dispatch('THREAD_LIST_SYNC', { guild_id: GUILD_ID, threads: [], members: [] }),
      shard,
      false,
    )

    assert.equal(context.cache.threads.size, 0)
  })

  it('TS6: patches a surviving thread rather than replacing it', () => {
    const { router, context } = harness()
    router.route(
      dispatch('THREAD_LIST_SYNC', {
        guild_id: GUILD_ID,
        threads: [thread('1', PARENT_A)],
        members: [],
      }),
      shard,
      false,
    )
    const held = context.cache.threads.get('1')

    router.route(
      dispatch('THREAD_LIST_SYNC', {
        guild_id: GUILD_ID,
        threads: [{ ...(thread('1', PARENT_A) as object), name: 'renamed' }],
        members: [],
      }),
      shard,
      false,
    )

    assert.equal(held?.name, 'renamed')
    assert.equal(context.cache.threads.get('1'), held)
  })
})

describe('bans', () => {
  it('TS7: reports the guild and the banned user', () => {
    const { router, emitted } = harness()
    router.route(dispatch('GUILD_BAN_ADD', { guild_id: GUILD_ID, user: USER }), shard, false)

    const last = emitted.at(-1)
    assert.equal(last?.event, 'guildBanAdd')
    assert.equal(last.args[0], GUILD_ID)
    assert.ok(last.args[1] instanceof User)
  })

  it('TS8: caches the user, which is often the only record of them', () => {
    const { router, context } = harness()
    router.route(dispatch('GUILD_BAN_ADD', { guild_id: GUILD_ID, user: USER }), shard, false)

    assert.equal(context.cache.users.get(USER.id)?.username, 'nelly')
  })

  it('TS9: does not evict the member, because the member remove already did', () => {
    // Doing it here as well would drop the member twice and emit guildMemberRemove for a
    // member that had already gone.
    const { router, context, emitted } = harness({ members: true, users: true })
    router.route(
      dispatch('GUILD_MEMBER_ADD', { guild_id: GUILD_ID, user: USER, roles: [], flags: 0 }),
      shard,
      false,
    )

    router.route(dispatch('GUILD_BAN_ADD', { guild_id: GUILD_ID, user: USER }), shard, false)

    assert.equal(context.cache.member(GUILD_ID, USER.id)?.userId, USER.id)
    assert.equal(emitted.filter((entry) => entry.event === 'guildMemberRemove').length, 0)
  })

  it('TS10: reports an unban separately', () => {
    const { router, emitted } = harness()
    router.route(dispatch('GUILD_BAN_REMOVE', { guild_id: GUILD_ID, user: USER }), shard, false)

    assert.equal(emitted.at(-1)?.event, 'guildBanRemove')
  })
})
