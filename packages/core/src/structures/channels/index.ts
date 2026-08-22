/**
 * The channel structures.
 *
 * @remarks
 * A directory of its own because the hierarchy is four deep and fourteen wide, which is more
 * than `structures/` should hold flat. Build one with {@link createChannel} rather than by
 * naming a constructor: picking the class is a job with one correct answer, and it lives in
 * one place.
 */

export { AnnouncementChannel } from './AnnouncementChannel.js'
export { CategoryChannel } from './CategoryChannel.js'
export { Channel, type TextBased } from './Channel.js'
export { createChannel } from './createChannel.js'
export { DMChannel } from './DMChannel.js'
export { ForumChannel } from './ForumChannel.js'
export { GroupDMChannel } from './GroupDMChannel.js'
export { GuildChannel, type PermissionOverwrite } from './GuildChannel.js'
export { GuildTextBasedChannel } from './GuildTextBasedChannel.js'
export { MediaChannel } from './MediaChannel.js'
export { StageChannel } from './StageChannel.js'
export { TextChannel } from './TextChannel.js'
export { ThreadChannel } from './ThreadChannel.js'
export { ThreadOnlyChannel } from './ThreadOnlyChannel.js'
export { VoiceChannel } from './VoiceChannel.js'
