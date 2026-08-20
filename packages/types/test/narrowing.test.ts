import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ChannelType, type APIChannel, type APIGuildMember } from '@vestra/types'

/**
 * `APIChannel` is a discriminated union on `type`. That is the single most valuable
 * property of these typings day to day, and it is easy to break by widening a member's
 * `type` field to `ChannelType`. These tests fail to *compile* if that happens, which is
 * the point -- the runtime assertions are almost incidental.
 */
describe('APIChannel narrowing', () => {
  it('narrows to a voice channel, exposing voice-only fields', () => {
    const channel: APIChannel = {
      id: '1',
      type: ChannelType.GuildVoice,
      name: 'General',
      position: 0,
      bitrate: 64_000,
      user_limit: 10,
    }

    if (channel.type !== ChannelType.GuildVoice) {
      assert.fail('did not narrow to a voice channel')
    }

    // `bitrate` does not exist on a text channel; this line only compiles after narrowing.
    assert.equal(channel.bitrate, 64_000)
    assert.equal(channel.user_limit, 10)
  })

  it('narrows to a forum channel, exposing tag configuration', () => {
    const channel: APIChannel = {
      id: '2',
      type: ChannelType.GuildForum,
      name: 'help',
      position: 1,
      available_tags: [
        { id: '10', name: 'answered', moderated: false, emoji_id: null, emoji_name: null },
      ],
    }

    if (channel.type !== ChannelType.GuildForum) {
      assert.fail('did not narrow to a forum channel')
    }

    assert.equal(channel.available_tags?.[0]?.name, 'answered')
  })

  it('narrows threads across their three channel types', () => {
    const channel: APIChannel = {
      id: '3',
      type: ChannelType.PublicThread,
      name: 'a thread',
      position: 0,
      owner_id: '99',
      total_message_sent: 12,
    }

    if (
      channel.type !== ChannelType.PublicThread &&
      channel.type !== ChannelType.PrivateThread &&
      channel.type !== ChannelType.AnnouncementThread
    ) {
      assert.fail('did not narrow to a thread')
    }

    assert.equal(channel.owner_id, '99')
  })
})

describe('APIGuildMember', () => {
  it('models the embedded-member case where user is absent', () => {
    // This is the shape Discord sends inside MESSAGE_CREATE. It must typecheck without
    // a `user`, otherwise every message handler needs a cast.
    const member: APIGuildMember = {
      roles: ['1'],
      joined_at: '2026-01-01T00:00:00.000000+00:00',
      deaf: false,
      mute: false,
      flags: 0,
    }

    assert.equal(member.user, undefined)
  })
})
