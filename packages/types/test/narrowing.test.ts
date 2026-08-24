import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ChannelType,
  GatewayOpcodes,
  type APIChannel,
  type APIGuildMember,
  type GatewayDispatchPayload,
} from '@vestra/types'

/**
 * `APIChannel` is a discriminated union on `type`. That is the single most valuable
 * property of these typings day to day, and it is easy to break by widening a member's
 * `type` field to `ChannelType`. These tests fail to *compile* if that happens, which is
 * the point -- the runtime assertions are almost incidental.
 *
 * Narrowing is exercised across a function boundary rather than on a `const`. Given a
 * literal object, TypeScript already knows the exact member and the checks would be
 * statically redundant, which tests nothing.
 */

/**
 * Reaches for a field that exists on exactly one branch of the union, proving the branch
 * was actually narrowed rather than widened to a common base.
 */
function summarise(channel: APIChannel): string {
  switch (channel.type) {
    case ChannelType.GuildVoice:
    case ChannelType.GuildStageVoice:
      // `bitrate` does not exist on a text channel; this only compiles after narrowing.
      return `voice:${String(channel.bitrate)}:${String(channel.user_limit)}`
    case ChannelType.GuildForum:
      return `forum:${String(channel.available_tags?.[0]?.name)}`
    case ChannelType.GuildText:
      return `text:${String(channel.topic)}`
    case ChannelType.PublicThread:
    case ChannelType.PrivateThread:
    case ChannelType.AnnouncementThread:
      return `thread:${String(channel.owner_id)}:${String(channel.total_message_sent)}`
    case ChannelType.GuildCategory:
      return `category:${channel.name}`
    case ChannelType.DM:
    case ChannelType.GroupDM:
      return `dm:${String(channel.recipients?.length)}`
    default:
      return `other:${String(channel.type)}`
  }
}

describe('APIChannel narrowing', () => {
  it('narrows to a voice channel, exposing voice-only fields', () => {
    assert.equal(
      summarise({
        id: '1',
        type: ChannelType.GuildVoice,
        name: 'General',
        position: 0,
        bitrate: 64_000,
        user_limit: 10,
      }),
      'voice:64000:10',
    )
  })

  it('narrows to a forum channel, exposing tag configuration', () => {
    assert.equal(
      summarise({
        id: '2',
        type: ChannelType.GuildForum,
        name: 'help',
        position: 1,
        available_tags: [
          { id: '10', name: 'answered', moderated: false, emoji_id: null, emoji_name: null },
        ],
      }),
      'forum:answered',
    )
  })

  it('narrows threads across all three of their channel types', () => {
    assert.equal(
      summarise({
        id: '3',
        type: ChannelType.PublicThread,
        name: 'a thread',
        position: 0,
        owner_id: '99',
        total_message_sent: 12,
      }),
      'thread:99:12',
    )
  })

  it('narrows a DM, which has no guild fields at all', () => {
    assert.equal(
      summarise({
        id: '4',
        type: ChannelType.DM,
        recipients: [
          {
            id: '5',
            username: 'someone',
            discriminator: '0',
            global_name: null,
            avatar: null,
          },
        ],
      }),
      'dm:1',
    )
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

/**
 * Reaches into `d` after checking `t`, which only compiles if the two are correlated.
 *
 * @remarks
 * `GatewayDispatchPayload` is the type every consumer of the `dispatch` event receives, so
 * this property is the difference between using the typings and casting past them.
 *
 * It is worth pinning because the failure is silent and was real: as a single interface
 * parameterised by the event name, `t` narrowed and `d` did not. Worse, `d` did not even
 * resolve to the union of every event's data — an event missing from
 * `GatewayDispatchEventMap` takes the `unknown` branch of `GatewayDispatchData`, and
 * `unknown` absorbs every other member of a union, so `d` was exactly `unknown`.
 *
 * Taken across a function boundary rather than on a literal, so TypeScript cannot shortcut
 * the narrowing.
 */
function describeDispatch(payload: GatewayDispatchPayload): string {
  switch (payload.t) {
    case 'MESSAGE_CREATE':
      // `content` exists on no other event's data.
      return `message:${payload.d.content}`
    case 'THREAD_MEMBERS_UPDATE':
      return `thread:${String(payload.d.member_count)}`
    case 'VOICE_SERVER_UPDATE':
      // Nullable on purpose: null means the voice server is being reallocated.
      return `voice:${payload.d.endpoint ?? 'reallocating'}`
    case 'CHANNEL_PINS_UPDATE':
      // Optional *and* nullable, which are different things here.
      return `pins:${payload.d.last_pin_timestamp ?? 'none'}`
    default:
      return payload.t
  }
}

describe('GatewayDispatchPayload narrowing', () => {
  it('correlates the event name with its payload data', () => {
    const message = describeDispatch({
      op: GatewayOpcodes.Dispatch,
      t: 'MESSAGE_CREATE',
      s: 1,
      d: { content: 'hello' } as never,
    })
    assert.equal(message, 'message:hello')
  })

  it('narrows an event whose data is nullable', () => {
    const reallocating = describeDispatch({
      op: GatewayOpcodes.Dispatch,
      t: 'VOICE_SERVER_UPDATE',
      s: 2,
      d: { token: 't', guild_id: '1', endpoint: null },
    })
    assert.equal(reallocating, 'voice:reallocating')
  })

  it('keeps the event name available on the branches it does not model', () => {
    const other = describeDispatch({
      op: GatewayOpcodes.Dispatch,
      t: 'USER_UPDATE',
      s: 3,
      d: { id: '1' } as never,
    })
    assert.equal(other, 'USER_UPDATE')
  })
})
