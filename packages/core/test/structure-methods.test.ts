import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ChannelType, type APIMessage, type Snowflake } from '@vestra/types'
import {
  CacheRegistry,
  createChannel,
  Guild,
  Message,
  Role,
  TextChannel,
  type CacheCapable,
  type RestCapable,
} from '@vestra/core'

const GUILD_ID = '613425648685547541'
const CHANNEL_ID = '41771983423143936'
const USER = {
  id: '80351110224678912',
  username: 'nelly',
  discriminator: '0',
  global_name: null,
  avatar: null,
}

/** Records what would have been sent, so the methods can be driven without a socket. */
function restStub(): {
  client: RestCapable
  sent: { channelId: Snowflake; body: Record<string, unknown> }[]
} {
  const sent: { channelId: Snowflake; body: Record<string, unknown> }[] = []
  const client = {
    rest: {
      channels: {
        createMessage: (channelId: Snowflake, body: Record<string, unknown>) => {
          sent.push({ channelId, body })
          return Promise.resolve(apiMessage('sent-1') as APIMessage)
        },
      },
    },
  } as unknown as RestCapable

  return { client, sent }
}

function apiMessage(id: string, extra: Record<string, unknown> = {}): unknown {
  return {
    id,
    channel_id: CHANNEL_ID,
    guild_id: GUILD_ID,
    author: USER,
    content: 'hello',
    timestamp: '2023-01-01T00:00:00+00:00',
    edited_timestamp: null,
    tts: false,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0,
    ...extra,
  }
}

function apiGuild(): unknown {
  return {
    id: GUILD_ID,
    name: 'Vestra',
    icon: null,
    splash: null,
    discovery_splash: null,
    home_header: null,
    owner_id: USER.id,
    afk_channel_id: null,
    afk_timeout: 300,
    verification_level: 1,
    default_message_notifications: 0,
    explicit_content_filter: 0,
    roles: [],
    emojis: [],
    features: [],
    mfa_level: 0,
    application_id: null,
    system_channel_id: null,
    system_channel_flags: 0,
    rules_channel_id: null,
    vanity_url_code: null,
    description: null,
    banner: null,
    premium_tier: 0,
    preferred_locale: 'en-US',
    public_updates_channel_id: null,
    nsfw: false,
    nsfw_level: 0,
    premium_progress_bar_enabled: false,
    safety_alerts_channel_id: null,
    incidents_data: null,
  }
}

function apiRole(id: string): unknown {
  return {
    id,
    name: 'Moderator',
    color: 0,
    colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
    hoist: false,
    position: 1,
    permissions: '0',
    managed: false,
    mentionable: false,
    flags: 0,
  }
}

describe('sending from a structure', () => {
  it('SM1: sends by channel ID, without needing the channel cached', () => {
    // The obvious spelling — reach for `message.channel`, then send — fails on a client with
    // `channels: false`, and cache configuration must not decide whether a bot can reply.
    const { client, sent } = restStub()
    const message = new Message(apiMessage('1') as never, client)

    return message.send({ content: 'pong' }).then((reply) => {
      assert.equal(sent.length, 1)
      assert.equal(sent[0]?.channelId, CHANNEL_ID)
      assert.deepEqual(sent[0].body, { content: 'pong' })
      assert.ok(reply instanceof Message)
      assert.equal(reply.id, 'sent-1')
    })
  })

  it('SM2: builds a reply reference pointing at the message replied to', () => {
    const { client, sent } = restStub()
    const message = new Message(apiMessage('1') as never, client)

    return message.reply({ content: 'pong' }).then(() => {
      assert.deepEqual(sent[0]?.body, {
        content: 'pong',
        message_reference: {
          message_id: '1',
          channel_id: CHANNEL_ID,
          guild_id: GUILD_ID,
        },
      })
    })
  })

  it('SM3: leaves fail_if_not_exists alone', () => {
    // Discord defaults it to true, so replying to a deleted message errors rather than posting
    // a detached one. Flipping that here would turn a visible failure into a confusing one.
    const { client, sent } = restStub()
    const message = new Message(apiMessage('1') as never, client)

    return message.reply({ content: 'pong' }).then(() => {
      const reference = sent[0]?.body.message_reference as Record<string, unknown>
      assert.equal('fail_if_not_exists' in reference, false)
    })
  })

  it('SM4: lets a caller-supplied reference win', () => {
    // Replying across channels is what crossposting needs, and overriding the reference would
    // make it inexpressible.
    const { client, sent } = restStub()
    const message = new Message(apiMessage('1') as never, client)

    return message
      .reply({ content: 'pong', message_reference: { message_id: '999', channel_id: '888' } })
      .then(() => {
        assert.deepEqual(sent[0]?.body.message_reference, {
          message_id: '999',
          channel_id: '888',
        })
      })
  })

  it('SM5: omits the guild on a direct message reply', () => {
    const { client, sent } = restStub()
    const message = new Message(apiMessage('1', { guild_id: undefined }) as never, client)

    return message.reply({ content: 'pong' }).then(() => {
      const reference = sent[0]?.body.message_reference as Record<string, unknown>
      assert.equal('guild_id' in reference, false)
    })
  })

  it('SM6: sends from a channel by its own ID', () => {
    const { client, sent } = restStub()
    const channel = createChannel(
      {
        id: CHANNEL_ID,
        type: ChannelType.GuildText,
        name: 'general',
        position: 0,
        permission_overwrites: [],
      },
      client,
      GUILD_ID,
    )

    assert.ok(channel instanceof TextChannel)
    return channel.send({ content: 'hello' }).then(() => {
      assert.equal(sent[0]?.channelId, CHANNEL_ID)
    })
  })
})

describe('cache-backed accessors', () => {
  it('SM7: reads the guild roles out of the cache', () => {
    const cache = new CacheRegistry({ roles: true, guilds: true })
    const client: CacheCapable = { cache }
    cache.roles.add(new Role(apiRole('r1') as never, GUILD_ID, client))
    cache.roles.add(new Role(apiRole('r2') as never, '999', client))

    const guild = new Guild(apiGuild() as never, client)

    assert.deepEqual(
      guild.roles().map((role) => role.id),
      ['r1'],
    )
  })

  it('SM8: answers empty rather than throwing when the scope is off', () => {
    // ADR 4: a cache-backed accessor never lies and never throws. An accessor that threw would
    // make cache configuration a source of runtime exceptions in code that never mentions
    // caching.
    const client: CacheCapable = { cache: new CacheRegistry({ roles: false }) }
    const guild = new Guild(apiGuild() as never, client)

    assert.deepEqual(guild.roles(), [])
    assert.deepEqual(guild.channels(), [])
    assert.deepEqual(guild.members(), [])
  })

  it('SM9: reports an uncached channel as undefined, not as a throw', () => {
    const client: CacheCapable = { cache: new CacheRegistry({ channels: false }) }
    const message = new Message(apiMessage('1') as never, client)

    assert.equal(message.channel(), undefined)
    assert.equal(message.guild(), undefined)
  })

  it('SM10: finds a message channel in either the channel or the thread scope', () => {
    // A thread is a channel, and the message does not say which store holds it.
    const cache = new CacheRegistry({ channels: true, threads: true })
    const client: CacheCapable = { cache }
    const thread = createChannel(
      {
        id: CHANNEL_ID,
        type: ChannelType.PublicThread,
        name: 'a thread',
        position: 0,
        parent_id: '5',
      },
      client,
      GUILD_ID,
    )
    assert.ok(thread?.isThread())
    cache.threads.add(thread)

    const message = new Message(apiMessage('1') as never, client)
    assert.equal(message.channel()?.id, CHANNEL_ID)
  })

  it('SM11: lists a category children by parent, not by everything in the guild', () => {
    const cache = new CacheRegistry({ channels: true })
    const client: CacheCapable = { cache }
    const category = createChannel(
      { id: 'cat', type: ChannelType.GuildCategory, name: 'Text', position: 0 },
      client,
      GUILD_ID,
    )
    for (const [id, parent] of [
      ['a', 'cat'],
      ['b', 'cat'],
      ['c', null],
    ] as const) {
      const channel = createChannel(
        {
          id,
          type: ChannelType.GuildText,
          name: id,
          position: 0,
          permission_overwrites: [],
          parent_id: parent,
        },
        client,
        GUILD_ID,
      )
      if (channel !== undefined) cache.channels.add(channel)
    }

    assert.ok(category !== undefined && 'children' in category)
    assert.deepEqual(
      (category as { children: () => { id: string }[] }).children().map((entry) => entry.id),
      ['a', 'b'],
    )
  })
})
