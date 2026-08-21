import {
  ActivityType,
  type APIActivity,
  type APIActivityAssets,
  type APIActivityEmoji,
  type APIActivityParty,
  type APIActivitySecrets,
  type APIActivityTimestamps,
  type Snowflake,
  type StatusDisplayType,
} from '@vestra/types'

/** When an activity started and when it ends, in epoch milliseconds. */
export interface ActivityTimestamps {
  /** When it started. */
  start: number | undefined
  /** When it ends. */
  end: number | undefined
}

/** The emoji beside a custom status. */
export interface ActivityEmoji {
  /** The emoji's name, or the character itself for a standard emoji. */
  name: string
  /** The emoji's ID, for a custom emoji. */
  id: Snowflake | undefined
  /** Whether it is animated. */
  animated: boolean | undefined
}

/** The player's party. */
export interface ActivityParty {
  /** The party's ID. */
  id: string | undefined
  /** The current and maximum size. */
  size: readonly [current: number, max: number] | undefined
}

/** The images an activity shows, and their hover texts. */
export interface ActivityAssets {
  /** The large image's asset key. */
  largeImage: string | undefined
  /** The large image's hover text. */
  largeText: string | undefined
  /** What clicking the large image opens. */
  largeUrl: string | undefined
  /** The small image's asset key. */
  smallImage: string | undefined
  /** The small image's hover text. */
  smallText: string | undefined
  /** What clicking the small image opens. */
  smallUrl: string | undefined
  /** The invite cover image's asset key. */
  inviteCoverImage: string | undefined
}

/** The secrets for joining and spectating. */
export interface ActivitySecrets {
  /** The join secret. */
  join: string | undefined
  /** The spectate secret. */
  spectate: string | undefined
  /** The match secret. */
  match: string | undefined
}

/**
 * What somebody is doing.
 *
 * @remarks
 * **Not a {@link Base} subclass, and it takes no client.** An activity has no ID, no cache
 * scope and nothing to fetch — it is a value that arrives inside a presence and dies with it.
 * Giving it a client would add a field to every one of them to support a `client` accessor
 * nobody can do anything with.
 *
 * **The nested objects are converted, not held.** `large_image`, `created_at` and
 * `status_display_type` are the sort of names the whole conversion rule exists to keep out of
 * consumer code, and holding Discord's objects by reference would also alias the payload — so
 * a consumer who mutated `activity.assets` would be editing the dispatch.
 *
 * **A custom status is an activity, confusingly.** Discord models "somebody set a status
 * message" as an activity of type {@link ActivityType.Custom} whose `state` is the message and
 * whose `name` is always the literal string `Custom Status`. {@link Activity.isCustomStatus}
 * exists because reading `name` and finding that is a surprise worth having a name for.
 */
export class Activity {
  /** The activity's name. Always `Custom Status` for a custom status. */
  declare readonly name: string
  /** How the activity is phrased, and which of its fields that phrasing reads. */
  declare readonly type: ActivityType
  /** The stream's URL, on a streaming activity. */
  declare readonly url: string | null | undefined
  /** When the activity was added to the session, in epoch milliseconds. */
  declare readonly createdTimestamp: number
  /** When it started and when it ends. */
  declare readonly timestamps: ActivityTimestamps | undefined
  /** The application the activity belongs to. */
  declare readonly applicationId: Snowflake | undefined
  /** Which field is shown as the status text in the member list. */
  declare readonly statusDisplayType: StatusDisplayType | null | undefined
  /** What the player is doing. */
  declare readonly details: string | null | undefined
  /** What clicking the details line opens. */
  declare readonly detailsUrl: string | null | undefined
  /** The party status, or the text of a custom status. */
  declare readonly state: string | null | undefined
  /** What clicking the state line opens. */
  declare readonly stateUrl: string | null | undefined
  /** The emoji beside a custom status. */
  declare readonly emoji: ActivityEmoji | null | undefined
  /** The player's party. */
  declare readonly party: ActivityParty | undefined
  /** The images shown, and their hover texts. */
  declare readonly assets: ActivityAssets | undefined
  /** The secrets for joining and spectating. */
  declare readonly secrets: ActivitySecrets | undefined
  /** Whether this is an instanced game session. */
  declare readonly instance: boolean | undefined
  /** The activity's flags, as a bit set of `ActivityFlags`. */
  declare readonly flags: number | undefined
  /** The labels of the activity's buttons. */
  declare readonly buttons: readonly string[]

  /**
   * @param data - The payload to mirror.
   */
  constructor(data: APIActivity) {
    this.name = data.name
    this.type = data.type
    this.url = data.url
    this.createdTimestamp = data.created_at
    this.timestamps = toTimestamps(data.timestamps)
    this.applicationId = data.application_id
    this.statusDisplayType = data.status_display_type
    this.details = data.details
    this.detailsUrl = data.details_url
    this.state = data.state
    this.stateUrl = data.state_url
    this.emoji = toEmoji(data.emoji)
    this.party = toParty(data.party)
    this.assets = toAssets(data.assets)
    this.secrets = toSecrets(data.secrets)
    this.instance = data.instance
    this.flags = data.flags
    this.buttons = data.buttons === undefined ? [] : [...data.buttons]
  }

  /** When the activity was added to the session. Allocates. */
  get createdAt(): Date {
    return new Date(this.createdTimestamp)
  }

  /**
   * Whether this is a custom status rather than something the user is doing.
   *
   * @remarks
   * Discord models a status message as an activity whose `name` is the literal string
   * `Custom Status` and whose `state` carries the actual message. Checking the type is the
   * reliable form; checking the name is what people try first and it breaks under
   * localisation.
   */
  isCustomStatus(): boolean {
    return this.type === ActivityType.Custom
  }
}

/** Converts the timestamps, or `undefined` if the payload had none. */
function toTimestamps(raw: APIActivityTimestamps | undefined): ActivityTimestamps | undefined {
  return raw === undefined ? undefined : { start: raw.start, end: raw.end }
}

/** Converts the emoji, preserving the difference between absent and `null`. */
function toEmoji(raw: APIActivityEmoji | null | undefined): ActivityEmoji | null | undefined {
  if (raw === undefined || raw === null) return raw
  return { name: raw.name, id: raw.id, animated: raw.animated }
}

/** Converts the party, copying the size tuple rather than aliasing it. */
function toParty(raw: APIActivityParty | undefined): ActivityParty | undefined {
  if (raw === undefined) return undefined
  return { id: raw.id, size: raw.size === undefined ? undefined : [raw.size[0], raw.size[1]] }
}

/** Converts the asset keys and their hover texts. */
function toAssets(raw: APIActivityAssets | undefined): ActivityAssets | undefined {
  if (raw === undefined) return undefined
  return {
    largeImage: raw.large_image,
    largeText: raw.large_text,
    largeUrl: raw.large_url,
    smallImage: raw.small_image,
    smallText: raw.small_text,
    smallUrl: raw.small_url,
    inviteCoverImage: raw.invite_cover_image,
  }
}

/** Converts the secrets. */
function toSecrets(raw: APIActivitySecrets | undefined): ActivitySecrets | undefined {
  if (raw === undefined) return undefined
  return { join: raw.join, spectate: raw.spectate, match: raw.match }
}
