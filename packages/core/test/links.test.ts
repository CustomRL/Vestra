import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Message, messageLink, parseMessageLink } from '@vestra/core'

const GUILD_ID = '613425648685547541'
const CHANNEL_ID = '41771983423143936'
const MESSAGE_ID = '900000000000000000'

function apiMessage(extra: Record<string, unknown> = {}): unknown {
  return {
    id: MESSAGE_ID,
    channel_id: CHANNEL_ID,
    guild_id: GUILD_ID,
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

describe('message links', () => {
  it('L1: builds a guild link', () => {
    assert.equal(
      messageLink({ guildId: GUILD_ID, channelId: CHANNEL_ID, messageId: MESSAGE_ID }),
      `https://discord.com/channels/${GUILD_ID}/${CHANNEL_ID}/${MESSAGE_ID}`,
    )
  })

  it('L2: puts @me where the guild would go in a direct message', () => {
    assert.equal(
      messageLink({ guildId: undefined, channelId: CHANNEL_ID, messageId: MESSAGE_ID }),
      `https://discord.com/channels/@me/${CHANNEL_ID}/${MESSAGE_ID}`,
    )
  })

  it('L3: round-trips a link it built', () => {
    const link = messageLink({ guildId: GUILD_ID, channelId: CHANNEL_ID, messageId: MESSAGE_ID })

    assert.deepEqual(parseMessageLink(link), {
      guildId: GUILD_ID,
      channelId: CHANNEL_ID,
      messageId: MESSAGE_ID,
    })
  })

  it('L4: reports @me as no guild, not as the literal string', () => {
    // Feeding `'@me'` into a guild lookup gives a cache miss that reads as "that guild is not
    // cached", which is a different and wrong answer.
    const parsed = parseMessageLink(`https://discord.com/channels/@me/${CHANNEL_ID}/${MESSAGE_ID}`)

    assert.ok(parsed !== undefined)
    assert.equal(parsed.guildId, undefined)
    assert.equal(parsed.channelId, CHANNEL_ID)
  })

  it('L5: accepts the hosts Discord actually serves', () => {
    // People paste links from the PTB and canary clients, and from the old discordapp.com
    // domain, which still resolves.
    for (const host of ['discord.com', 'ptb.discord.com', 'canary.discord.com', 'discordapp.com']) {
      const parsed = parseMessageLink(
        `https://${host}/channels/${GUILD_ID}/${CHANNEL_ID}/${MESSAGE_ID}`,
      )
      assert.equal(parsed?.messageId, MESSAGE_ID, `${host} did not parse`)
    }
  })

  it('L6: returns undefined for text that is not a message link', () => {
    // Parsing user-supplied text that turns out not to be a link is an ordinary outcome, not
    // an error.
    for (const notALink of [
      'hello',
      'https://discord.com/channels/1/2',
      'https://discord.com/channels/1/2/3/4',
      'https://example.com/channels/1/2/3',
      `http://discord.com/channels/${GUILD_ID}/${CHANNEL_ID}/${MESSAGE_ID}`,
      'https://discord.com/channels/notanid/2/3',
    ]) {
      assert.equal(parseMessageLink(notALink), undefined, `${notALink} should not parse`)
    }
  })

  it('L7: gives a message its own link without touching the cache', () => {
    // Every message carries the three IDs, so this needs no cache and no REST call.
    const message = new Message(apiMessage() as never, undefined)
    assert.equal(
      message.url,
      `https://discord.com/channels/${GUILD_ID}/${CHANNEL_ID}/${MESSAGE_ID}`,
    )

    const dm = new Message(apiMessage({ guild_id: undefined }) as never, undefined)
    assert.equal(dm.url, `https://discord.com/channels/@me/${CHANNEL_ID}/${MESSAGE_ID}`)
  })

  it('L8: parses the link a message produced', () => {
    // The two have to agree exactly, which is why the getter delegates rather than inlining
    // its own template.
    const message = new Message(apiMessage() as never, undefined)
    assert.deepEqual(parseMessageLink(message.url), {
      guildId: GUILD_ID,
      channelId: CHANNEL_ID,
      messageId: MESSAGE_ID,
    })
  })
})
