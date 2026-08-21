import type { Snowflake } from '@vestra/types'

/** What a message link points at. */
export interface MessageLinkTarget {
  /** The guild, or `undefined` for a direct message. */
  guildId: Snowflake | undefined
  /** The channel. */
  channelId: Snowflake
  /** The message. */
  messageId: Snowflake
}

const BASE = 'https://discord.com/channels'

/**
 * A direct message has no guild, and Discord puts `@me` where the guild ID would go.
 *
 * @remarks
 * Not a snowflake, which is why {@link parseMessageLink} reports `guildId` as `undefined` for
 * one rather than as the literal string. A caller who fed `'@me'` into a guild lookup would get
 * a cache miss that reads as "that guild is not cached".
 */
const DM_SEGMENT = '@me'

/**
 * Builds a jump link to a message.
 *
 * @param target - The guild, channel and message.
 * @returns The URL a Discord client opens.
 */
export function messageLink(target: MessageLinkTarget): string {
  return `${BASE}/${target.guildId ?? DM_SEGMENT}/${target.channelId}/${target.messageId}`
}

/**
 * Reads a jump link back into IDs.
 *
 * @param link - The URL to parse.
 * @returns The IDs, or `undefined` if it is not a message link.
 *
 * @remarks
 * Exists because message links are something users paste at bots — "look at this message" — and
 * the alternative is every bot writing the same regular expression, usually without handling
 * the `@me` case or the `ptb.` and `canary.` hosts.
 *
 * Returns `undefined` rather than throwing: parsing user-supplied text that turns out not to be
 * a link is an ordinary outcome, not an error.
 */
export function parseMessageLink(link: string): MessageLinkTarget | undefined {
  const match =
    /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(@me|\d+)\/(\d+)\/(\d+)\/?$/.exec(
      link,
    )
  if (match === null) return undefined

  const [, guild, channelId, messageId] = match
  if (channelId === undefined || messageId === undefined) return undefined

  return {
    guildId: guild === DM_SEGMENT ? undefined : guild,
    channelId,
    messageId,
  }
}
