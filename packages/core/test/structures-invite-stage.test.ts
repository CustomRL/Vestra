import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DiscordEpoch,
  InviteTargetType,
  StageInstancePrivacyLevel,
  type APIStageInstance,
  type APIUser,
  type GatewayInviteCreateDispatchData,
} from '@vestra/types'
import { Invite, StageInstance, User } from '@vestra/core'

/** A stand-in client. Both structures only ever hand it back, so its shape is irrelevant. */
const client = { name: 'test-client' }

const GUILD_ID = '613425648685547541'
const CHANNEL_ID = '41771983423143936'
const STAGE_ID = '840647391636226060'

const INVITER: APIUser = {
  id: '80351110224678912',
  username: 'nelly',
  discriminator: '0',
  global_name: 'Nelly',
  avatar: null,
}

const STREAMER: APIUser = { ...INVITER, id: '90351110224678912', username: 'streamer' }

/**
 * Every field `GatewayInviteCreateDispatchData` can carry, all at once.
 *
 * @remarks
 * Exhaustive on purpose: the field-coverage tests derive what the structure must mirror from
 * this object's own keys, so a payload missing a field would quietly narrow what is checked.
 * IC1 asserts the key count so that stays true.
 */
function invitePayload(
  extra: Partial<GatewayInviteCreateDispatchData> = {},
): GatewayInviteCreateDispatchData {
  return {
    channel_id: CHANNEL_ID,
    code: 'vestra',
    created_at: '2024-03-01T12:00:00.000000+00:00',
    guild_id: GUILD_ID,
    inviter: INVITER,
    max_age: 86_400,
    max_uses: 25,
    target_type: InviteTargetType.Stream,
    target_user: STREAMER,
    target_application: { id: '1', name: 'an app' },
    temporary: true,
    uses: 0,
    expires_at: '2024-03-02T12:00:00.000000+00:00',
    role_ids: ['41771983423143937'],
    ...extra,
  }
}

function stagePayload(extra: Partial<APIStageInstance> = {}): APIStageInstance {
  return {
    id: STAGE_ID,
    guild_id: GUILD_ID,
    channel_id: CHANNEL_ID,
    topic: 'Office hours',
    privacy_level: StageInstancePrivacyLevel.GuildOnly,
    discoverable_disabled: true,
    guild_scheduled_event_id: null,
    ...extra,
  }
}

/** The mechanical rule the structures name their fields by. */
function toCamelCase(field: string): string {
  return field.replaceAll(/_(.)/g, (_match, next: string) => next.toUpperCase())
}

/**
 * Wire fields whose structure field is deliberately named something else.
 *
 * @remarks
 * The local equivalent of `naming.test.ts`'s `RENAMES`, which cannot cover these two: its
 * `STRUCTURE_SOURCES` table pairs a structure with one `API*` type, and `Invite` mirrors a
 * `Gateway*` dispatch payload instead.
 */
const RENAMED: Record<string, string> = {
  // created_at and expires_at both have a `Date` getter beside them wanting the mechanical
  // name, which is the suffix rule Guild.joinedTimestamp and Message.editedTimestamp follow.
  created_at: 'createdTimestamp',
  expires_at: 'expiresTimestamp',
}

/** What a structure built from `payload` must have as own properties. */
function expectedFields(payload: object): string[] {
  return Object.keys(payload)
    .map((field) => RENAMED[field] ?? toCamelCase(field))
    .sort()
}

describe('Invite', () => {
  it('IC1: mirrors every field the dispatch carries and invents none', () => {
    // Own keys rather than declared type, so a `declare`d field with no constructor
    // assignment fails here — the declaration alone emits nothing under `declare`.
    const payload = invitePayload()
    assert.equal(Object.keys(payload).length, 14, 'the fixture must stay exhaustive')

    const invite = new Invite(payload, client)
    assert.deepEqual(Object.keys(invite).sort(), expectedFields(payload))
  })

  it('IC2: carries the payload values through unchanged', () => {
    const invite = new Invite(invitePayload(), client)

    assert.equal(invite.code, 'vestra')
    assert.equal(invite.channelId, CHANNEL_ID)
    assert.equal(invite.guildId, GUILD_ID)
    assert.equal(invite.createdTimestamp, '2024-03-01T12:00:00.000000+00:00')
    assert.equal(invite.maxAge, 86_400)
    assert.equal(invite.maxUses, 25)
    assert.equal(invite.targetType, InviteTargetType.Stream)
    assert.deepEqual(invite.targetApplication, { id: '1', name: 'an app' })
    assert.equal(invite.temporary, true)
    assert.equal(invite.uses, 0)
    assert.equal(invite.expiresTimestamp, '2024-03-02T12:00:00.000000+00:00')
    assert.deepEqual(invite.roleIds, ['41771983423143937'])
  })

  it('IC3: builds the inviter and the target user as separate users', () => {
    // Two distinct users in the payload, so a constructor that assigned one field from the
    // other shows up as a swapped ID rather than as two objects that happen to look alike.
    const invite = new Invite(invitePayload(), client)

    assert.ok(invite.inviter !== undefined, 'the inviter must be built')
    assert.ok(invite.inviter instanceof User)
    assert.equal(invite.inviter.id, INVITER.id)
    assert.equal(invite.inviter.client, client)

    assert.ok(invite.targetUser !== undefined, 'the target user must be built')
    assert.ok(invite.targetUser instanceof User)
    assert.equal(invite.targetUser.id, STREAMER.id)
  })

  it('IC4: keeps the same shape when the optional fields are absent', () => {
    // The hot-path rule: every field assigned unconditionally, so a group DM invite and a
    // guild invite are the same hidden class. A conditional assignment passes IC1 and fails
    // here, which is the whole reason this is a separate case.
    const bare = invitePayload()
    const optional = new Set([
      'guild_id',
      'inviter',
      'target_type',
      'target_user',
      'target_application',
      'role_ids',
    ])
    const trimmed = Object.fromEntries(
      Object.entries(bare).filter(([field]) => !optional.has(field)),
    )
    assert.equal(Object.keys(trimmed).length, 8, 'the trimmed payload must actually be smaller')

    const invite = new Invite(trimmed as unknown as GatewayInviteCreateDispatchData, client)

    assert.deepEqual(Object.keys(invite).sort(), expectedFields(bare))
    assert.equal(invite.guildId, undefined)
    assert.equal(invite.inviter, undefined)
    assert.equal(invite.targetUser, undefined)
    assert.equal(invite.roleIds, undefined)
  })

  it('IC5: reads created_at and expires_at back as dates', () => {
    const invite = new Invite(invitePayload(), client)

    assert.equal(invite.createdAt.getTime(), Date.parse('2024-03-01T12:00:00Z'))
    assert.equal(invite.expiresAt?.getTime(), Date.parse('2024-03-02T12:00:00Z'))
  })

  it('IC6: reports a never-expiring invite as a null date rather than an invalid one', () => {
    // `new Date(null)` is the epoch, not an error, so getting this wrong produces an invite
    // that appears to have expired in 1970 rather than one that never expires.
    const invite = new Invite(invitePayload({ expires_at: null }), client)

    assert.equal(invite.expiresTimestamp, null)
    assert.equal(invite.expiresAt, null)
  })

  it('IC7: builds the short link, and uses it for toString', () => {
    const invite = new Invite(invitePayload(), client)

    assert.equal(invite.url, 'https://discord.gg/vestra')
    assert.equal(String(invite), 'https://discord.gg/vestra')
  })

  it('IC8: calls an invite permanent only when neither limit is set', () => {
    // Both halves, because either limit running out kills the invite. Discord spells "no
    // limit" as 0 for each.
    assert.equal(new Invite(invitePayload({ max_age: 0, max_uses: 0 }), client).permanent, true)
    assert.equal(new Invite(invitePayload({ max_age: 0, max_uses: 5 }), client).permanent, false)
    assert.equal(new Invite(invitePayload({ max_age: 600, max_uses: 0 }), client).permanent, false)
  })
})

describe('StageInstance', () => {
  it('SI1: mirrors every field the payload carries and invents none', () => {
    const payload = stagePayload()
    assert.equal(Object.keys(payload).length, 7, 'the fixture must stay exhaustive')

    const stage = new StageInstance(payload, client)
    assert.deepEqual(Object.keys(stage).sort(), expectedFields(payload))
  })

  it('SI2: carries the payload values through unchanged', () => {
    const stage = new StageInstance(stagePayload(), client)

    assert.equal(stage.id, STAGE_ID)
    assert.equal(stage.guildId, GUILD_ID)
    assert.equal(stage.channelId, CHANNEL_ID)
    assert.equal(stage.topic, 'Office hours')
    assert.equal(stage.privacyLevel, StageInstancePrivacyLevel.GuildOnly)
    assert.equal(stage.discoverableDisabled, true)
    assert.equal(stage.guildScheduledEventId, null)
    assert.equal(stage.client, client)
  })

  it('SI3: keeps the instance ID and the channel ID apart', () => {
    // The one confusion this structure exists to prevent: two stages run in the same channel
    // on different days share `channelId` and differ in `id`, so a listener keying on the
    // wrong one merges them.
    const stage = new StageInstance(stagePayload(), client)

    assert.notEqual(stage.id, stage.channelId)
    assert.equal(stage.channelId, CHANNEL_ID)
  })

  it('SI4: takes its creation time from its own snowflake', () => {
    const id = String(BigInt(4_000) << 22n)
    const stage = new StageInstance(stagePayload({ id }), client)

    assert.equal(stage.createdTimestamp, DiscordEpoch + 4_000)
    assert.equal(stage.createdAt.getTime(), DiscordEpoch + 4_000)
  })

  it('SI5: carries a scheduled event ID when the stage was started from one', () => {
    const stage = new StageInstance(stagePayload({ guild_scheduled_event_id: '999' }), client)

    assert.equal(stage.guildScheduledEventId, '999')
  })
})
