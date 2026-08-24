import type { Snowflake } from '../globals.js'
import type { APIEmoji } from './emoji.js'
import type { APIUser } from './user.js'

/**
 * Soundboard sounds and the voice channel effects that play them.
 */

/**
 * A sound playable into a voice channel from the soundboard.
 *
 * @remarks
 * The identifier is `sound_id`, not `id`, so this object does not fit any helper that
 * assumes the usual field name.
 *
 * Two kinds of sound share the shape. Discord's own default sounds, returned by
 * `GET /soundboard-default-sounds`, are available to every user and carry no `guild_id`;
 * their IDs are small counters rendered as strings (`"1"`, `"2"`) rather than snowflakes,
 * and the same IDs arrive as JSON numbers on {@link APIVoiceChannelEffect}. Guild sounds
 * are uploads, always carry `guild_id`, and are usable outside their guild only by Nitro
 * subscribers.
 */
export interface APISoundboardSound {
  /** The sound's name. */
  name: string
  /**
   * The sound's ID.
   *
   * @remarks
   * Also the CDN filename: the audio is served from `/soundboard-sounds/{sound_id}` with
   * no extension, as MP3 or Ogg depending on what was uploaded.
   */
  sound_id: Snowflake
  /** The sound's playback volume, from `0` to `1`. */
  volume: number
  /**
   * The ID of the custom emoji shown on the sound.
   *
   * @remarks
   * `emoji_id` and `emoji_name` are mutually exclusive and both are always present: a
   * custom emoji sets the first and nulls the second, a standard emoji does the reverse,
   * and a sound with no emoji has both `null`.
   */
  emoji_id: Snowflake | null
  /** The unicode character of the standard emoji shown on the sound. */
  emoji_name: string | null
  /** The ID of the guild the sound belongs to. Absent on Discord's default sounds. */
  guild_id?: Snowflake
  /**
   * Whether the sound can be used.
   *
   * @remarks
   * Goes `false` when the guild drops below the boost level that granted the slot the
   * sound occupies. The sound is not deleted, and becomes usable again if the guild
   * regains the level.
   */
  available: boolean
  /**
   * The user who created the sound.
   *
   * @remarks
   * Present only when the request was made with `CreateGuildExpressions` or
   * `ManageGuildExpressions`; absent otherwise, including on gateway payloads.
   */
  user?: APIUser
}

/**
 * An effect someone played in a voice channel: the body of `VOICE_CHANNEL_EFFECT_SEND`.
 *
 * @remarks
 * One shape covers two effects and nothing in it says which arrived. An emoji reaction
 * carries `emoji` and the animation fields; a soundboard sound carries those *and*
 * `sound_id` with `sound_volume`. Testing for `sound_id` is the only way to tell them
 * apart.
 *
 * The event only reaches clients already connected to the voice channel, so it is not a
 * way to observe soundboard use across a guild.
 */
export interface APIVoiceChannelEffect {
  /** The ID of the voice channel the effect was played in. */
  channel_id: Snowflake
  /** The ID of the guild the effect was played in. */
  guild_id: Snowflake
  /** The ID of the user who played the effect. */
  user_id: Snowflake
  /** The emoji shown, for emoji reaction and soundboard effects. */
  emoji?: APIEmoji | null
  /**
   * The animation played with the emoji, for emoji reaction and soundboard effects.
   *
   * @remarks
   * `0` is the premium animation, sent by Nitro subscribers, and `1` is the standard one.
   * Left as a number because this package does not model the enumeration.
   */
  animation_type?: number | null
  /** The ID of the emoji animation, for emoji reaction and soundboard effects. */
  animation_id?: number
  /**
   * The ID of the soundboard sound, for soundboard effects.
   *
   * @remarks
   * Discord documents this as "snowflake or integer" and means it: a guild sound arrives
   * as a snowflake string, while one of the default sounds arrives as a bare JSON number.
   * Compare it with `String(sound_id)` rather than assuming either.
   */
  sound_id?: Snowflake | number
  /** The volume the sound was played at, from `0` to `1`, for soundboard effects. */
  sound_volume?: number
}
