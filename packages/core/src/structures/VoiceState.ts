import type { APIVoiceState, ISO8601Timestamp, Snowflake } from '@vestra/types'
import { Base } from './Base.js'

/**
 * Where a member is in voice, and what they can do there.
 *
 * @remarks
 * **Keyed by (guild, user), not by an ID of its own.** A voice state has no snowflake — it is
 * a fact about a membership rather than a resource — which is why {@link Base} declares no
 * `id` for structures to inherit and lie about. `guildId` and `userId` are constructor
 * arguments for the same reason {@link Role} takes its guild: `guild_id` is absent on the
 * voice states nested inside a `GUILD_CREATE`, which is where most of them arrive.
 *
 * **A disconnect is a `channelId` of `null`, not a missing state.** Discord sends
 * `VOICE_STATE_UPDATE` with `channel_id: null` when somebody leaves, and the handler deletes
 * the entry — so a cached voice state always means "in a channel". The field is still nullable
 * because the payload is, and a structure that hid that would be lying about what arrived.
 *
 * **The two mute flags are not the same fact.** `mute` is the server muting them and
 * `selfMute` is them muting themselves; a bot deciding whether somebody can be heard needs
 * both, and collapsing them into one boolean silently makes moderation tooling wrong.
 */
export class VoiceState<Client = unknown> extends Base<Client> {
  /** The guild this state belongs to. */
  declare readonly guildId: Snowflake
  /** The user this state is for. */
  declare readonly userId: Snowflake
  /** The channel they are connected to, or `null` if they have disconnected. */
  declare channelId: Snowflake | null
  /** The voice session's ID. */
  declare sessionId: string
  /** Whether the server has deafened them. */
  declare deaf: boolean
  /** Whether the server has muted them. */
  declare mute: boolean
  /** Whether they have deafened themselves. */
  declare selfDeaf: boolean
  /** Whether they have muted themselves. */
  declare selfMute: boolean
  /** Whether they are streaming with Go Live. */
  declare selfStream: boolean | undefined
  /** Whether their camera is on. */
  declare selfVideo: boolean
  /** Whether their permission to speak is denied. */
  declare suppress: boolean
  /** When they asked to speak in a stage channel, as the raw ISO string. */
  declare requestToSpeakTimestamp: ISO8601Timestamp | null

  /**
   * @param data - The payload to mirror.
   * @param guildId - The guild the state belongs to.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIVoiceState, guildId: Snowflake, client: Client) {
    super(client)

    this.guildId = guildId
    this.userId = data.user_id
    this.channelId = data.channel_id
    this.sessionId = data.session_id
    this.deaf = data.deaf
    this.mute = data.mute
    this.selfDeaf = data.self_deaf
    this.selfMute = data.self_mute
    this.selfStream = data.self_stream
    this.selfVideo = data.self_video
    this.suppress = data.suppress
    this.requestToSpeakTimestamp = data.request_to_speak_timestamp
  }

  /** Whether they are connected to a voice channel at all. */
  get connected(): boolean {
    return this.channelId !== null
  }

  /**
   * Whether nobody can hear them, for any reason.
   *
   * @remarks
   * Server mute or self mute. Deafening is not muting — a deafened member can still speak —
   * so it is deliberately not part of this.
   */
  get muted(): boolean {
    return this.mute || this.selfMute
  }

  /** Whether they cannot hear anyone, for any reason. */
  get deafened(): boolean {
    return this.deaf || this.selfDeaf
  }

  /** When they asked to speak in a stage channel, or `null` if they have not. Allocates. */
  get requestToSpeakAt(): Date | null {
    const raw = this.requestToSpeakTimestamp
    return raw === null ? null : new Date(raw)
  }

  /**
   * Copies this state, detached from the cache.
   *
   * @returns A new structure with the same field values.
   *
   * @remarks
   * The one structure in the library with a `clone`, and the reason is
   * `ClientEvents.voiceStateUpdate` carrying the previous state. The general rule against
   * "old object" arguments (see {@link ClientEvents.messageUpdate}) rests on two objections:
   * cloning costs, and a partial update means most of the old object was never known. Neither
   * holds here — a voice state is a dozen scalars, and `VOICE_STATE_UPDATE` always sends the
   * whole thing — while the questions the event exists to answer, *did they move channel* or
   * *did they just mute themselves*, are unanswerable without it. Every consumer would
   * otherwise keep a shadow copy of the cache to compute the same thing.
   *
   * Built through the constructor rather than by copying properties, so a clone has the same
   * hidden class as everything else of this type.
   */
  clone(): VoiceState<Client> {
    return new VoiceState(
      {
        user_id: this.userId,
        channel_id: this.channelId,
        session_id: this.sessionId,
        deaf: this.deaf,
        mute: this.mute,
        self_deaf: this.selfDeaf,
        self_mute: this.selfMute,
        ...(this.selfStream === undefined ? {} : { self_stream: this.selfStream }),
        self_video: this.selfVideo,
        suppress: this.suppress,
        request_to_speak_timestamp: this.requestToSpeakTimestamp,
      },
      this.guildId,
      this.client,
    )
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   *
   * @remarks
   * `VOICE_STATE_UPDATE` sends the whole state every time rather than a delta, so this assigns
   * unconditionally. `userId` and `guildId` are not reassigned: a state that changed either
   * would be a different state, and the cache key is built from both.
   */
  patch(data: APIVoiceState): void {
    this.channelId = data.channel_id
    this.sessionId = data.session_id
    this.deaf = data.deaf
    this.mute = data.mute
    this.selfDeaf = data.self_deaf
    this.selfMute = data.self_mute
    this.selfStream = data.self_stream
    this.selfVideo = data.self_video
    this.suppress = data.suppress
    this.requestToSpeakTimestamp = data.request_to_speak_timestamp
  }
}
