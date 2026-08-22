import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  GatewayMessageCreateDispatchData,
  GatewayMessageUpdateDispatchData,
} from '@vestra/types'
import { Message, User } from '@vestra/core'

const client = { name: 'test-client' }

const AUTHOR = {
  id: '80351110224678912',
  username: 'nelly',
  discriminator: '0',
  global_name: null,
  avatar: null,
}

function created(
  overrides: Partial<GatewayMessageCreateDispatchData> = {},
): GatewayMessageCreateDispatchData {
  return {
    id: '1091234567890123456',
    channel_id: '613425648685547541',
    author: AUTHOR,
    content: 'hello',
    timestamp: '2023-03-14T12:00:00.000000+00:00',
    edited_timestamp: null,
    tts: false,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0,
    ...overrides,
  }
}

function updated(
  overrides: Partial<GatewayMessageUpdateDispatchData> = {},
): GatewayMessageUpdateDispatchData {
  // Only `id` and `channel_id` are guaranteed on an update.
  return {
    id: '1091234567890123456',
    channel_id: '613425648685547541',
    ...overrides,
  }
}

describe('Message structure', () => {
  it('MS1: mirrors a full payload and reports itself complete', () => {
    const message = new Message(created(), client)

    assert.equal(message.content, 'hello')
    assert.equal(message.author?.username, 'nelly')
    assert.equal(message.partial, false)
    assert.equal(message.isComplete(), true)
  })

  it('MS2: never throws on a partial payload', () => {
    // The partial path is the normal path: under ADR 4's defaults messages are not cached,
    // so an update for a message never seen before is routine rather than exceptional.
    const message = new Message(updated(), client)

    assert.equal(message.id, '1091234567890123456')
    assert.equal(message.content, undefined)
    assert.equal(message.author, undefined)
    assert.equal(message.partial, true)
    assert.equal(message.isComplete(), false)
  })

  it('MS3: gives a partial the same shape as a full message', () => {
    // The fields are `declare`d, so the constructor is the only thing creating properties.
    // A skipped assignment would give partial payloads their own hidden class, and every
    // `message.content` read downstream would go polymorphic across the two.
    const full = new Message(created(), client)
    const partial = new Message(updated(), client)

    assert.deepEqual(Object.keys(partial), Object.keys(full))
  })

  it('MS4: does not blank a known field when an update omits it', () => {
    // The whole reason patch and the constructor are not the same code. An edit that only
    // adds an embed carries no content, and copying absent fields would turn that update
    // into data loss.
    const message = new Message(created({ content: 'original' }), client)
    message.patch(updated({ embeds: [{ title: 'added' }] }))

    assert.equal(message.content, 'original', 'content must survive an unrelated edit')
    assert.equal(message.embeds?.[0]?.title, 'added')
  })

  it('MS5: applies the fields an update does carry', () => {
    const message = new Message(created({ content: 'before' }), client)
    message.patch(updated({ content: 'after', edited_timestamp: '2023-03-14T13:00:00+00:00' }))

    assert.equal(message.content, 'after')
    assert.equal(message.editedAt?.getUTCHours(), 13)
  })

  it('MS6: distinguishes an explicit null from an absent field', () => {
    // `edited_timestamp: null` means Discord said it was never edited. Absent means the
    // payload did not carry it. Collapsing them would make an unrelated edit look like an
    // un-edit.
    const message = new Message(created(), client)
    assert.equal(message.editedTimestamp, null, 'a full payload says never edited')

    const partial = new Message(updated(), client)
    assert.equal(partial.editedTimestamp, undefined, 'a partial says nothing at all')
  })

  it('MS7: patches the author in place rather than replacing it', () => {
    const message = new Message(created(), client)
    const held = message.author

    message.patch(updated({ author: { ...AUTHOR, username: 'renamed' } }))
    assert.equal(message.author, held, 'the author object must be the same reference')
    assert.equal(held?.username, 'renamed')
  })

  it('MS8: builds the author member with ids the payload does not carry', () => {
    // The embedded member has its user stripped, because the author sits beside it. The
    // member takes its ids from the message rather than from an absent `user`.
    const message = new Message(
      created({
        guild_id: '613425648685547500',
        member: {
          roles: [],
          joined_at: '2021-01-01T00:00:00+00:00',
          deaf: false,
          mute: false,
          flags: 0,
        },
      }),
      client,
    )

    const member = message.member
    assert.ok(member !== undefined, 'a guild message with a member payload must build one')
    assert.equal(member.guildId, '613425648685547500')
    assert.equal(member.userId, AUTHOR.id)
    assert.equal(member.user, undefined, 'the payload really does omit it')
  })

  it('MS9: converts mentions to users', () => {
    const message = new Message(created({ mentions: [{ ...AUTHOR, id: '99' }] }), client)

    const mentions = message.mentions
    assert.ok(mentions !== undefined)
    assert.equal(mentions.length, 1)
    const first = mentions[0]
    assert.ok(first instanceof User)
    assert.equal(first.id, '99')
  })

  it('MS10: builds a jump link, using @me for a direct message', () => {
    const guild = new Message(created({ guild_id: '111' }), client)
    assert.equal(
      guild.url,
      'https://discord.com/channels/111/613425648685547541/1091234567890123456',
    )

    const dm = new Message(created(), client)
    assert.match(dm.url, /channels\/@me\//)
  })

  it('MS11: reads the sent time from the ID as well as the payload', () => {
    // The ID carries it, so a partial with no `timestamp` can still answer.
    const partial = new Message(updated(), client)
    assert.ok(partial.createdAt.getTime() > Date.parse('2023-01-01'))
  })
})
