import type { Snowflake } from '../globals.js'
import type { ActivityType, PresenceStatus, StatusDisplayType } from '../enums/presence.js'
import type { APIUser } from './user.js'

/**
 * A user's current state on a guild.
 *
 * @remarks
 * Backs `PRESENCE_UPDATE`, which requires the privileged `GuildPresences` intent. The
 * event fires for changes to the user record as well as to the presence itself, so a
 * rename or an avatar change arrives here too.
 *
 * `GUILD_CREATE` embeds these as partial presence updates. Discord does not document
 * which fields it drops there, so treat this shape as the event's, not as a guarantee
 * about the ones nested in a guild.
 */
export interface APIPresenceUpdate {
  /**
   * The user whose presence changed. Only `id` is guaranteed to be present.
   *
   * @remarks
   * Deliberately not {@link APIUser}. Discord documents this object as partial: `id` is
   * the only field that must be sent, nothing else is required, and the field types are
   * not validated. Typing it as a full user would promise fields that routinely are not
   * there, since the event carries only what changed.
   */
  user: Partial<APIUser> & Pick<APIUser, 'id'>
  /** The ID of the guild the presence applies to. */
  guild_id: Snowflake
  /**
   * The user's status.
   *
   * @remarks
   * Never `invisible`: a user who has set that is reported as `offline` here, which is
   * the whole point of the setting.
   */
  status: Exclude<PresenceStatus, 'invisible'>
  /** The user's current activities. */
  activities: APIActivity[]
  /** The user's status on each platform they have a session on. */
  client_status: APIClientStatus
}

/**
 * A user's status on each platform they have an active session on.
 *
 * @remarks
 * A field is present only while a session on that platform is active, so absence is the
 * signal: a user who is offline or invisible has no fields at all, and there is no
 * `offline` value to test for here. The top-level `status` is the resolved answer across
 * every session; this is the breakdown.
 */
export interface APIClientStatus {
  /** The status of an active desktop session, on Windows, Linux or macOS. */
  desktop?: Exclude<PresenceStatus, 'invisible' | 'offline'>
  /** The status of an active mobile session, on iOS or Android. */
  mobile?: Exclude<PresenceStatus, 'invisible' | 'offline'>
  /** The status of an active web session. Bot users report themselves here. */
  web?: Exclude<PresenceStatus, 'invisible' | 'offline'>
  /** The status of an active virtual reality session. */
  vr?: Exclude<PresenceStatus, 'invisible' | 'offline'>
}

/**
 * Something a user is doing, shown beneath their name.
 *
 * @remarks
 * Most of this object is Rich Presence, which only a game or an application using the SDK
 * fills in. A bot setting its own presence may send `name`, `type`, `url` and `state` and
 * nothing else; every other field is ignored on the way out, however it arrives on the way
 * in. Presence updates are limited to five per twenty seconds.
 */
export interface APIActivity {
  /** The activity's name. */
  name: string
  /** How the activity is phrased, and which of its fields that phrasing reads. */
  type: ActivityType
  /**
   * The stream's URL.
   *
   * @remarks
   * Validated only for {@link ActivityType.Streaming}, where Discord accepts Twitch and
   * YouTube links and rejects everything else.
   */
  url?: string | null
  /** When the activity was added to the user's session, as a Unix time in milliseconds. */
  created_at: number
  /** When the activity started and when it ends. */
  timestamps?: APIActivityTimestamps
  /** The ID of the application the activity belongs to. */
  application_id?: Snowflake
  /** Which of this activity's fields is shown as the status text in the member list. */
  status_display_type?: StatusDisplayType | null
  /** What the player is currently doing. */
  details?: string | null
  /** The URL opened by clicking the details line. */
  details_url?: string | null
  /** The user's party status, or the text of a custom status. */
  state?: string | null
  /** The URL opened by clicking the state line. */
  state_url?: string | null
  /** The emoji beside the text of a custom status. */
  emoji?: APIActivityEmoji | null
  /** The player's current party. */
  party?: APIActivityParty
  /** The images shown for the activity, and their hover texts. */
  assets?: APIActivityAssets
  /** The secrets for joining and spectating. */
  secrets?: APIActivitySecrets
  /** Whether the activity is an instanced game session. */
  instance?: boolean
  /** The activity's flags. A bit set of {@link ActivityFlags}. */
  flags?: number
  /**
   * The labels of the buttons shown on the activity, at most two.
   *
   * @remarks
   * Strings, not objects. Over the gateway Discord sends only the labels, because a bot
   * is not allowed to read the URLs behind another user's activity buttons.
   * {@link APIActivityButton} is the object form, and it is what a client sends when
   * setting an activity rather than anything it receives.
   */
  buttons?: string[]
}

/**
 * When an activity started and when it ends.
 *
 * @remarks
 * Unix times in milliseconds, unlike most timestamps on the API, which are ISO 8601
 * strings. Sending both on a listening or watching activity draws a progress bar instead
 * of a counter.
 */
export interface APIActivityTimestamps {
  /** When the activity started. */
  start?: number
  /** When the activity ends. */
  end?: number
}

/**
 * The emoji attached to a custom status.
 *
 * @remarks
 * Narrower than the emoji objects used elsewhere on the API: `name` is required here and
 * cannot be `null`, and `id` is absent rather than `null` for a unicode emoji.
 */
export interface APIActivityEmoji {
  /** The emoji's name, or the character itself for a unicode emoji. */
  name: string
  /** The emoji's ID. Custom emoji only. */
  id?: Snowflake
  /** Whether the emoji is animated. */
  animated?: boolean
}

/**
 * The party a player is in.
 */
export interface APIActivityParty {
  /**
   * The party's ID.
   *
   * @remarks
   * A free-form string chosen by the game, not a snowflake — Discord's own example is a
   * UUID. It is only ever compared for equality, to group players into the same party.
   */
  id?: string
  /**
   * The party's current and maximum size, in that order.
   *
   * @remarks
   * A two-element array rather than an object, which is why this is a tuple: the maximum
   * is `size[1]`, with nothing naming it.
   */
  size?: [number, number]
}

/**
 * The images shown on a Rich Presence activity.
 *
 * @remarks
 * The image fields are neither URLs nor ordinary image hashes. Each is either an
 * application asset ID, served from the application's asset path, or a media proxy image
 * ID prefixed `mp:`, served from `media.discordapp.net`. An external URL may be sent and
 * is converted, so `mp:` is the only form ever received over the gateway. These values are
 * user-specifiable and unsanitised — decide which form a value is in before building a URL
 * out of it.
 */
export interface APIActivityAssets {
  /** The large image, as an asset ID or an `mp:` media proxy ID. */
  large_image?: string
  /** The text shown when hovering over the large image. */
  large_text?: string
  /** The URL opened by clicking the large image. */
  large_url?: string
  /** The small image, as an asset ID or an `mp:` media proxy ID. */
  small_image?: string
  /** The text shown when hovering over the small image. */
  small_text?: string
  /** The URL opened by clicking the small image. */
  small_url?: string
  /** The banner shown on a game invite, in the same two forms as the other images. */
  invite_cover_image?: string
}

/**
 * The secrets a Rich Presence activity carries for joining and spectating.
 */
export interface APIActivitySecrets {
  /** The secret for joining a party. */
  join?: string
  /** The secret for spectating a game. */
  spectate?: string
  /** The secret for a specific instanced match. */
  match?: string
}

/**
 * A button on a Rich Presence activity.
 *
 * @remarks
 * The form used when setting an activity, never the form received: over the gateway
 * `buttons` is an array of label strings, since a bot cannot read another user's button
 * URLs.
 */
export interface APIActivityButton {
  /** The text on the button, 1 to 32 characters. */
  label: string
  /** The URL opened by clicking the button, 1 to 512 characters. */
  url: string
}
