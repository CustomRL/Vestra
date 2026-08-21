import { ChannelType, type APIChannel, type Snowflake } from '@vestra/types'
import { AnnouncementChannel } from './AnnouncementChannel.js'
import { CategoryChannel } from './CategoryChannel.js'
import type { Channel } from './Channel.js'
import { DMChannel } from './DMChannel.js'
import { ForumChannel } from './ForumChannel.js'
import { GroupDMChannel } from './GroupDMChannel.js'
import { MediaChannel } from './MediaChannel.js'
import { StageChannel } from './StageChannel.js'
import { TextChannel } from './TextChannel.js'
import { ThreadChannel } from './ThreadChannel.js'
import { VoiceChannel } from './VoiceChannel.js'

/**
 * Builds the right channel structure for a payload.
 *
 * @param data - The channel payload.
 * @param client - The client that will own the structure.
 * @param guildId - The guild the channel is in, for payloads that omit it.
 * @returns The structure, or `undefined` for a channel this version cannot build.
 *
 * @remarks
 * **The only `switch` on `ChannelType` in the package.** Every other file narrows through the
 * class hierarchy or the discriminated union. One switch is maintainable; a second one that
 * has to agree with it is how a library ends up returning a `TextChannel` for a forum.
 *
 * **Returns `undefined` rather than a base `Channel` for an unknown type.** Discord adds
 * channel types, and `GuildDirectory` is already one this package has no payload shape for.
 * The tempting fallback is a bare `Channel`, and it is wrong twice over: it would be a
 * different class from the one a later version returns for that same type, which is a
 * breaking change disguised as a fix, and every predicate on it would answer for a payload
 * nobody has modelled. A caller who gets `undefined` knows the library did not understand the
 * channel, which is the truth.
 *
 * **`guildId` comes from the payload first.** `CHANNEL_CREATE` and friends carry `guild_id`;
 * the channel objects nested in `GUILD_CREATE` do not, and the caller supplies it there. A
 * guild channel with neither is unbuildable — the cache groups on that field — so it is
 * refused rather than keyed under `undefined`.
 */
export function createChannel<Client>(
  data: APIChannel,
  client: Client,
  guildId?: Snowflake,
): Channel<Client> | undefined {
  if (data.type === ChannelType.DM) return new DMChannel(data, client)
  if (data.type === ChannelType.GroupDM) return new GroupDMChannel(data, client)

  const guild = data.guild_id ?? guildId
  if (guild === undefined) return undefined

  switch (data.type) {
    case ChannelType.GuildText:
      return new TextChannel(data, guild, client)
    case ChannelType.GuildAnnouncement:
      return new AnnouncementChannel(data, guild, client)
    case ChannelType.GuildVoice:
      return new VoiceChannel(data, guild, client)
    case ChannelType.GuildStageVoice:
      return new StageChannel(data, guild, client)
    case ChannelType.GuildCategory:
      return new CategoryChannel(data, guild, client)
    case ChannelType.GuildForum:
      return new ForumChannel(data, guild, client)
    case ChannelType.GuildMedia:
      return new MediaChannel(data, guild, client)
    case ChannelType.AnnouncementThread:
    case ChannelType.PublicThread:
    case ChannelType.PrivateThread:
      return new ThreadChannel(data, guild, client)
    default:
      return undefined
  }
}
