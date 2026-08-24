/**
 * Presence-related enumerations.
 */

/**
 * A user's status.
 *
 * @remarks
 * A plain union rather than an `as const` object: these are wire strings with no numeric
 * counterpart, so a runtime constant would only restate them.
 *
 * `invisible` is send-only. It is accepted when setting the connection's own presence and
 * is never received — an invisible user is reported to everyone else as `offline`, so a
 * received presence cannot distinguish the two.
 */
export type PresenceStatus = 'dnd' | 'idle' | 'invisible' | 'offline' | 'online'

/**
 * What a user is doing, which decides the sentence Discord builds around the activity.
 *
 * @remarks
 * The type only chooses the phrasing and which of the activity's fields that phrasing
 * reads, so the same activity object says something quite different under a different
 * type. A bot may set this freely; the rest of Rich Presence is closed to it.
 */
export const ActivityType = {
  /** Phrased as `Playing {name}`. */
  Playing: 0,
  /**
   * Phrased as `Streaming {details}`.
   *
   * @remarks
   * The only type whose `url` Discord validates, and only `https://twitch.tv/` and
   * `https://youtube.com/` links are accepted. Note that this phrasing reads `details`
   * rather than `name`, unlike every other type.
   */
  Streaming: 1,
  /** Phrased as `Listening to {name}`. */
  Listening: 2,
  /** Phrased as `Watching {name}`. */
  Watching: 3,
  /**
   * Phrased as `{emoji} {state}`.
   *
   * @remarks
   * The odd one out: the text a user typed is in `state` and the emoji beside it is in
   * `emoji`, so `name` contributes nothing to what is rendered. Reading `name` to display
   * a custom status is the usual mistake.
   */
  Custom: 4,
  /** Phrased as `Competing in {name}`. */
  Competing: 5,
} as const

/**
 * An activity type.
 */
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType]

/**
 * Which field of an activity becomes the user's status text in the member list.
 *
 * @remarks
 * Applies to every activity type, not only listening ones. It changes which field the
 * member-list line is drawn from; it does not change the activity itself.
 */
export const StatusDisplayType = {
  /** Show `name`, for example "Listening to Spotify". */
  Name: 0,
  /** Show `state`, for example "Listening to Rick Astley". */
  State: 1,
  /** Show `details`, for example "Listening to Never Gonna Give You Up". */
  Details: 2,
} as const

/**
 * A status display type.
 */
export type StatusDisplayType = (typeof StatusDisplayType)[keyof typeof StatusDisplayType]

/**
 * Flags on an activity, describing what the payload includes.
 *
 * @remarks
 * Discord publishes these as a bare table of names and values. Where a bit lines up with
 * something else on the activity — `Instance` with the `instance` field, `Join` and
 * `Spectate` with the matching entries in `secrets` — that correspondence is noted below.
 * The rest are given as their wire names, because inventing a meaning for a bit Discord
 * has never described would be worse than admitting the gap.
 */
export const ActivityFlags = {
  /** The activity is an instanced game session, which the `instance` field also reports. */
  Instance: 1 << 0,
  /** The activity can be joined, and carries `secrets.join`. */
  Join: 1 << 1,
  /** The activity can be spectated, and carries `secrets.spectate`. */
  Spectate: 1 << 2,
  /** The activity takes an Ask to Join request rather than being joined outright. */
  JoinRequest: 1 << 3,
  /** `SYNC` on the wire. Discord documents the name only. */
  Sync: 1 << 4,
  /** `PLAY` on the wire. Discord documents the name only. */
  Play: 1 << 5,
  /** `PARTY_PRIVACY_FRIENDS` on the wire. Discord documents the name only. */
  PartyPrivacyFriends: 1 << 6,
  /** `PARTY_PRIVACY_VOICE_CHANNEL` on the wire. Discord documents the name only. */
  PartyPrivacyVoiceChannel: 1 << 7,
  /** `EMBEDDED` on the wire. Discord documents the name only. */
  Embedded: 1 << 8,
} as const

/**
 * An activity flag.
 */
export type ActivityFlags = (typeof ActivityFlags)[keyof typeof ActivityFlags]
