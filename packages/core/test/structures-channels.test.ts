import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ChannelType, type APIChannel, type APIVoiceChannel } from '@vestra/types'
import {
  AnnouncementChannel,
  CategoryChannel,
  createChannel,
  DMChannel,
  ForumChannel,
  GroupDMChannel,
  MediaChannel,
  StageChannel,
  TextChannel,
  ThreadChannel,
  VoiceChannel,
} from '@vestra/core'

const client = { name: 'test-client' }
const GUILD_ID = '613425648685547541'
const USER = {
  id: '80351110224678912',
  username: 'nelly',
  discriminator: '0',
  global_name: null,
  avatar: null,
}

function guildChannel(type: ChannelType, extra: Record<string, unknown> = {}): APIChannel {
  return {
    id: '41771983423143936',
    type,
    name: 'general',
    position: 3,
    permission_overwrites: [{ id: '1', type: 0, allow: '1024', deny: '0' }],
    parent_id: '99',
    nsfw: false,
    ...extra,
  } as APIChannel
}

describe('channel factory', () => {
  it('CH1: builds the class that matches the payload type', () => {
    // The one ChannelType switch in the package. A wrong arm here is a channel that answers
    // every predicate incorrectly, and nothing else in the package would notice.
    const cases: [ChannelType, unknown][] = [
      [ChannelType.GuildText, TextChannel],
      [ChannelType.GuildAnnouncement, AnnouncementChannel],
      [ChannelType.GuildVoice, VoiceChannel],
      [ChannelType.GuildStageVoice, StageChannel],
      [ChannelType.GuildCategory, CategoryChannel],
      [ChannelType.GuildForum, ForumChannel],
      [ChannelType.GuildMedia, MediaChannel],
      [ChannelType.PublicThread, ThreadChannel],
      [ChannelType.PrivateThread, ThreadChannel],
      [ChannelType.AnnouncementThread, ThreadChannel],
    ]

    for (const [type, expected] of cases) {
      const channel = createChannel(guildChannel(type), client, GUILD_ID)
      assert.ok(
        channel instanceof (expected as new () => object),
        `type ${String(type)} built ${channel?.constructor.name ?? 'nothing'}`,
      )
    }
  })

  it('CH2: builds the two DM types without a guild', () => {
    const dm = createChannel({ id: '1', type: ChannelType.DM, recipients: [USER] }, client)
    const group = createChannel(
      { id: '2', type: ChannelType.GroupDM, name: 'group', recipients: [USER] },
      client,
    )

    assert.ok(dm instanceof DMChannel)
    assert.ok(group instanceof GroupDMChannel)
    assert.equal(dm.recipient?.username, 'nelly')
  })

  it('CH3: refuses a guild channel it cannot key', () => {
    // The channels cache groups on `guildId`. A channel built with neither a payload
    // `guild_id` nor a caller-supplied one would be filed under `undefined`, which is worse
    // than not caching it: `channels.group(guildId)` would then be missing entries that the
    // store insists it holds.
    assert.equal(createChannel(guildChannel(ChannelType.GuildText), client), undefined)
  })

  it('CH4: refuses a channel type it does not model', () => {
    // GuildDirectory has no payload shape in @vestra/types. Returning a bare `Channel` would
    // be a different class from the one a later version returns, which is a breaking change
    // arriving as a bug fix.
    assert.equal(
      createChannel(guildChannel(ChannelType.GuildDirectory), client, GUILD_ID),
      undefined,
    )
  })

  it('CH5: takes the guild from the payload ahead of the argument', () => {
    // CHANNEL_CREATE carries `guild_id`; the channels nested in GUILD_CREATE do not. When
    // both are present the payload is the authority, or a stale caller-supplied ID would
    // silently re-file a channel under the wrong guild.
    const channel = createChannel(
      guildChannel(ChannelType.GuildText, { guild_id: '111' }),
      client,
      '222',
    )

    assert.ok(channel?.isGuildBased())
    assert.equal(channel.guildId, '111')
  })
})

describe('channel structures', () => {
  it('CH6: answers the predicates from the payload type', () => {
    const text = createChannel(guildChannel(ChannelType.GuildText), client, GUILD_ID)
    const voice = createChannel(guildChannel(ChannelType.GuildVoice), client, GUILD_ID)
    const stage = createChannel(guildChannel(ChannelType.GuildStageVoice), client, GUILD_ID)
    const forum = createChannel(guildChannel(ChannelType.GuildForum), client, GUILD_ID)
    const thread = createChannel(guildChannel(ChannelType.PublicThread), client, GUILD_ID)
    const dm = createChannel({ id: '1', type: ChannelType.DM }, client)

    assert.equal(text?.isTextBased(), true)
    assert.equal(text.isGuildBased(), true)
    assert.equal(text.isThread(), false)

    // Voice channels have carried text chat since 2021, so excluding them would send a caller
    // to REST for a `send()` that works.
    assert.equal(voice?.isTextBased(), true)
    assert.equal(voice.isVoiceBased(), true)
    assert.equal(stage?.isVoiceBased(), true)

    // A forum holds threads; posting to one creates a thread, not a message.
    assert.equal(forum?.isTextBased(), false)

    assert.equal(thread?.isThread(), true)
    assert.equal(thread.isTextBased(), true)

    assert.equal(dm?.isTextBased(), true)
    assert.equal(dm.isGuildBased(), false)
    assert.equal(dm.isDMBased(), true)
  })

  it('CH7: copies the overwrites instead of aliasing the payload', () => {
    // Held by reference, a consumer editing `channel.permissionOverwrites` would be editing
    // the object the dispatch arrived in.
    const payload = guildChannel(ChannelType.GuildText)
    const channel = createChannel(payload, client, GUILD_ID)

    assert.ok(channel?.isGuildBased())
    assert.equal(channel.permissionOverwrites.length, 1)
    assert.notEqual(
      channel.permissionOverwrites[0],
      (payload as { permission_overwrites: unknown[] }).permission_overwrites[0],
    )
  })

  it('CH8: flattens thread metadata rather than nesting it', () => {
    const thread = createChannel(
      guildChannel(ChannelType.PublicThread, {
        owner_id: '7',
        message_count: 12,
        thread_metadata: {
          archived: true,
          auto_archive_duration: 1440,
          archive_timestamp: '2023-01-01T00:00:00+00:00',
          locked: false,
        },
      }),
      client,
      GUILD_ID,
    )

    assert.ok(thread instanceof ThreadChannel)
    assert.equal(thread.archived, true)
    assert.equal(thread.locked, false)
    assert.equal(thread.autoArchiveDuration, 1440)
    assert.equal(thread.ownerId, '7')
    assert.equal(thread.messageCount, 12)
    assert.equal(thread.archivedAt?.getTime(), Date.parse('2023-01-01T00:00:00+00:00'))
  })

  it('CH9: keeps one shape whether the metadata arrived or not', () => {
    // The `declare`-plus-assign rule, applied through a nested object: a thread built without
    // metadata must have the same property set as one built with it, or the two get different
    // hidden classes.
    const withMetadata = createChannel(
      guildChannel(ChannelType.PublicThread, {
        thread_metadata: {
          archived: true,
          auto_archive_duration: 60,
          archive_timestamp: '2023-01-01T00:00:00+00:00',
          locked: true,
        },
      }),
      client,
      GUILD_ID,
    )
    const without = createChannel(guildChannel(ChannelType.PublicThread), client, GUILD_ID)

    assert.deepEqual(Object.keys(withMetadata as object), Object.keys(without as object))
  })

  it('CH10: renders a channel mention', () => {
    const channel = createChannel(guildChannel(ChannelType.GuildText), client, GUILD_ID)
    assert.equal(String(channel), '<#41771983423143936>')
  })

  it('CH11: patches in place through the subclass', () => {
    // `patch` is declared per class over that class's payload, and a handler only knows the
    // cached object as a `Channel`. Dynamic dispatch has to reach the subclass, or a voice
    // channel update would silently apply only the base fields.
    const channel = createChannel(
      guildChannel(ChannelType.GuildVoice, { bitrate: 64000 }),
      client,
      GUILD_ID,
    )
    assert.ok(channel instanceof VoiceChannel)

    channel.patch(
      guildChannel(ChannelType.GuildVoice, {
        bitrate: 96000,
        name: 'Renamed',
      }) as APIVoiceChannel,
    )

    assert.equal(channel.bitrate, 96000)
    assert.equal(channel.name, 'Renamed')
  })

  it('CH12: names the forum post list for what it is', () => {
    // Discord sends the newest post as `last_message_id`, which is what it is not: the posts
    // in a forum are threads. Mirroring the name would have made `lastMessageId` mean two
    // different things depending on the channel type.
    const forum = createChannel(
      guildChannel(ChannelType.GuildForum, { last_message_id: '900' }),
      client,
      GUILD_ID,
    )

    assert.ok(forum instanceof ForumChannel)
    assert.equal(forum.lastThreadId, '900')
    assert.equal(forum.isTextBased(), false)
  })
})
