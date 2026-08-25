import type {
  APIActivity,
  APIClientStatus,
  APIPresenceUpdate,
  PresenceStatus,
  Snowflake,
} from '@vestra/types'
import { Activity } from './Activity.js'
import { Base } from './Base.js'
import type { Changes, ChangesDraft } from './Changes.js'

/** Which status somebody is showing on each platform they have a session on. */
export interface ClientStatus {
  /** Their status on a desktop session, on Windows, Linux or macOS. */
  desktop: PresenceStatus | undefined
  /** Their status on a mobile session, on iOS or Android. */
  mobile: PresenceStatus | undefined
  /** Their status on a web session. Bots report themselves here. */
  web: PresenceStatus | undefined
  /** Their status on a virtual reality session. */
  vr: PresenceStatus | undefined
}

/**
 * Somebody's status and what they are doing, within one guild.
 *
 * @remarks
 * **One presence per membership, not per user.** Discord sends `PRESENCE_UPDATE` once per
 * guild the bot shares with the user, so a user in five shared guilds produces five of these.
 * The cache key is `guildId:userId` for that reason; keying by user alone would make the five
 * overwrite each other and leave whichever arrived last standing for all five guilds.
 *
 * **`status` is never `invisible`.** Somebody who has set that is reported as `offline`, which
 * is the entire point of the setting. The type says so, so a consumer cannot write a branch
 * for a value that never arrives.
 *
 * **The user is not mirrored into a {@link User} structure.** `PRESENCE_UPDATE` carries a
 * partial user — Discord documents `id` as the only guaranteed field and does not validate the
 * rest — so building one would produce a `User` whose every other field is `undefined` and
 * which would then overwrite a complete cached user. Only the ID is kept; the handler upserts
 * nothing.
 */
/**
 * The fields a {@link Presence.patch} can report as changed.
 *
 * @remarks
 * **{@link Presence.activities} is deliberately absent, and this is the one exclusion made on
 * cost rather than on principle.** `PRESENCE_UPDATE` is the highest-volume dispatch a bot
 * receives by a wide margin, and the field is rebuilt into fresh {@link Activity} structures
 * on every one of them — so a reference comparison would report it as changed every time and
 * leave the record non-null forever, while a comparison deep enough to be true would run on
 * the busiest path in the library. Either answer is worse than saying nothing.
 *
 * What is left is what people actually diff: the status going from `online` to `offline`, and
 * which platform it happened on. A consumer who needs the previous activities has to keep
 * their own copy — which they would do anyway for a field that changes this often.
 */
export type PresenceChangeField = 'status' | 'clientStatus'

/**
 * What a presence update displaced.
 *
 * @typeParam Client - The client type the presence is bound to.
 *
 * @remarks
 * The second argument to `presenceUpdate`, and `null` on the very common dispatch where only
 * the activities moved. See {@link Changes}.
 */
export type PresenceChanges<Client = unknown> = Changes<Presence<Client>, PresenceChangeField>

export class Presence<Client = unknown> extends Base<Client> {
  /** The guild this presence applies to. */
  declare readonly guildId: Snowflake
  /** Whose presence this is. */
  declare readonly userId: Snowflake
  /** Their status. Never `invisible` — that arrives as `offline`. */
  declare status: PresenceStatus
  /** What they are doing. */
  declare activities: Activity[]
  /** Their status on each platform they have a session on. */
  declare clientStatus: ClientStatus

  /**
   * @param data - The payload to mirror.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIPresenceUpdate, client: Client) {
    super(client)

    this.guildId = data.guild_id
    this.userId = data.user.id
    this.status = data.status
    this.activities = toActivities(data.activities)
    this.clientStatus = toClientStatus(data.client_status)
  }

  /** Whether they are offline, or invisible, which reads the same. */
  get offline(): boolean {
    return this.status === 'offline'
  }

  /**
   * Their custom status message, if they have set one.
   *
   * @returns The message, or `undefined`.
   *
   * @remarks
   * Discord models this as an activity rather than a field, and puts the message in that
   * activity's `state` while its `name` is the literal string `Custom Status`. Reaching for
   * `presence.activities[0].name` is the natural mistake, and this exists so nobody has to
   * make it.
   */
  get customStatus(): string | undefined {
    for (const activity of this.activities) {
      if (activity.isCustomStatus()) return activity.state ?? undefined
    }
    return undefined
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   * @returns The previous status and client status, if either moved, or `null` if neither did.
   *
   * @remarks
   * `PRESENCE_UPDATE` sends the whole presence rather than a delta, so this assigns
   * unconditionally. The activities are rebuilt rather than patched: they have no identity to
   * match old against new by, so there is nothing to patch in place — and for the same reason
   * they are not reported, which {@link PresenceChangeField} explains.
   */
  patch(data: APIPresenceUpdate): PresenceChanges<Client> | null {
    let changes: ChangesDraft<Presence<Client>, PresenceChangeField> | null = null

    if (data.status !== this.status) (changes ??= {}).status = this.status
    this.status = data.status
    this.activities = toActivities(data.activities)
    // Compared by its four components rather than by reference, for the same reason
    // `Role.colors` is: `toClientStatus` builds a new object on every dispatch.
    if (
      data.client_status.desktop !== this.clientStatus.desktop ||
      data.client_status.mobile !== this.clientStatus.mobile ||
      data.client_status.web !== this.clientStatus.web ||
      data.client_status.vr !== this.clientStatus.vr
    ) {
      ;(changes ??= {}).clientStatus = this.clientStatus
    }
    this.clientStatus = toClientStatus(data.client_status)

    return changes
  }
}

/** Builds the activity structures. */
function toActivities(raw: readonly APIActivity[]): Activity[] {
  const activities: Activity[] = []
  for (const entry of raw) activities.push(new Activity(entry))
  return activities
}

/**
 * Converts the per-platform statuses, giving every platform a slot.
 *
 * @remarks
 * Absent means "no session on that platform", so the four fields are always present and
 * `undefined` rather than omitted. Omitting them would give a presence with a desktop session
 * a different shape from one without.
 */
function toClientStatus(raw: APIClientStatus): ClientStatus {
  return { desktop: raw.desktop, mobile: raw.mobile, web: raw.web, vr: raw.vr }
}
