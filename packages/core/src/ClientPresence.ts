import {
  ActivityType,
  GatewayOpcodes,
  type GatewayActivityUpdateData,
  type GatewayPresenceUpdateData,
} from '@vestra/types'

/** What the bot may show itself as. */
export type PresenceStatusOption = 'online' | 'idle' | 'dnd' | 'invisible'

/** One activity the bot wants to display. */
export interface ActivityOption {
  /**
   * The text shown after the verb.
   *
   * @remarks
   * Ignored by Discord for {@link ActivityType.Custom}, which reads `state` instead — see
   * {@link resolvePresence}.
   */
  name: string
  /** How it is phrased. Defaults to `Playing`. */
  type?: ActivityType
  /**
   * The stream URL, for a `Streaming` activity.
   *
   * @remarks
   * Discord validates this and accepts only Twitch and YouTube links. A `Streaming` activity
   * with any other URL, or none, silently renders as `Playing` instead.
   */
  url?: string
  /** The status text of a custom status. */
  state?: string
}

/** What the bot should appear as. */
export interface PresenceOptions {
  /** The status to show. Defaults to `online`. */
  status?: PresenceStatusOption
  /** What the bot is doing. Defaults to nothing. */
  activities?: readonly ActivityOption[]
  /** Whether the client is marked away. Defaults to `false`. */
  afk?: boolean
  /**
   * When the bot went idle, in epoch milliseconds.
   *
   * @remarks
   * Only meaningful with `status: 'idle'`, where Discord renders it as "idle for 20 minutes".
   * Defaults to now when the status is idle and `null` otherwise, which is what Discord's own
   * documentation specifies rather than something invented here.
   */
  since?: number
}

/**
 * Turns presence options into the payload the gateway wants.
 *
 * @param options - What the bot should appear as.
 * @param now - The current time in epoch milliseconds, for the idle default.
 * @returns The opcode 3 data.
 *
 * @remarks
 * **A custom status is not what anybody expects.** Discord renders
 * {@link ActivityType.Custom} from the activity's `state`, not its `name`, and requires a
 * `name` anyway — it conventionally reads `Custom Status` and is never displayed. Passing
 * `{ name: 'hello', type: ActivityType.Custom }` therefore shows nothing at all, which is a
 * confusing way to fail. This copies `name` into `state` when the caller gave no `state`, so
 * the obvious spelling works and the explicit one still wins.
 *
 * **`since` is only read when the status is idle.** Discord's documentation is specific about
 * this, and sending a timestamp alongside `online` is at best ignored.
 */
export function resolvePresence(options: PresenceOptions, now: number): GatewayPresenceUpdateData {
  const status = options.status ?? 'online'

  const activities: GatewayActivityUpdateData[] = []
  for (const activity of options.activities ?? []) {
    const type = activity.type ?? ActivityType.Playing
    const entry: GatewayActivityUpdateData = { name: activity.name, type }

    if (activity.url !== undefined) entry.url = activity.url

    // The custom-status fallback. Explicit `state` wins, so a caller who knows the rule is
    // not second-guessed.
    if (activity.state !== undefined) {
      entry.state = activity.state
    } else if (type === ActivityType.Custom) {
      entry.state = activity.name
    }

    activities.push(entry)
  }

  return {
    since: options.since ?? (status === 'idle' ? now : null),
    activities,
    status,
    afk: options.afk ?? false,
  }
}

/**
 * Builds the gateway payload for a presence update.
 *
 * @param options - What the bot should appear as.
 * @param now - The current time in epoch milliseconds.
 * @returns The payload to send.
 */
export function presencePayload(
  options: PresenceOptions,
  now: number,
): { op: typeof GatewayOpcodes.PresenceUpdate; d: GatewayPresenceUpdateData } {
  return { op: GatewayOpcodes.PresenceUpdate, d: resolvePresence(options, now) }
}
