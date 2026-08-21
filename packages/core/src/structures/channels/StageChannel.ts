import { VoiceChannel } from './VoiceChannel.js'

/**
 * A voice channel for hosting events with an audience.
 *
 * @remarks
 * Discord gives it exactly the voice channel payload, so this adds no fields. It exists so
 * that `channel.type === ChannelType.GuildStageVoice` and `channel instanceof StageChannel`
 * agree, and so the stage-specific API surface has somewhere to live when it arrives.
 *
 * Extending {@link VoiceChannel} rather than sitting beside it is what makes
 * `Channel.isVoiceBased()` narrow to one type instead of a union.
 */
export class StageChannel<Client = unknown> extends VoiceChannel<Client> {}
