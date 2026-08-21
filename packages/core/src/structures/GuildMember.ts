import type { APIGuildMember, ISO8601Timestamp, Snowflake } from '@vestra/types'
import { Base } from './Base.js'
import { User } from './User.js'

/**
 * A user as they exist inside one guild.
 *
 * @remarks
 * **Timestamp naming.** A raw ISO string carries a `Timestamp` suffix and the natural name
 * is the `Date` getter: `joinedTimestamp` is the string Discord sent, `joinedAt` allocates
 * a `Date`. The mechanical camelCase of `joined_at` is `joinedAt`, which collides with the
 * getter, and `docs/design/phase-4-core.md` §4.15 sets the renaming bar at exactly that —
 * "the mechanical result is ambiguous or collides". The suffix rule is then applied to
 * every ISO field rather than only the colliding one, because a rule with an exception is
 * worse to remember than a rule.
 *
 * It also matches the two examples the specification already fixes: message `timestamp`
 * becomes `createdTimestamp` beside `createdAt`, and `edited_timestamp` stays
 * `editedTimestamp`.
 *
 * **No eager `Date` parsing.** `globals.ts` keeps timestamps as strings because most are
 * never read, and parsing every one on construction would pay for all of them to serve the
 * few. The getters allocate on access and say so.
 */
export class GuildMember<Client = unknown> extends Base<Client> {
  /**
   * The underlying user.
   *
   * @remarks
   * Absent on a member embedded in another payload — a message's `member`, an interaction's
   * — because the user is carried alongside it rather than inside it. Present on
   * `GUILD_MEMBER_ADD` and on anything fetched.
   */
  user: User<Client> | undefined
  /** The member's guild-specific nickname. */
  nick: string | null | undefined
  /** The member's guild-specific avatar hash. */
  avatar: string | null | undefined
  /** The member's guild-specific banner hash. */
  banner: string | null | undefined
  /**
   * The IDs of the roles the member has.
   *
   * @remarks
   * IDs rather than resolved roles, and held by reference rather than copied. The array
   * came out of `JSON.parse` moments ago and nothing else aliases it. Resolving to `Role`
   * objects would need the cache, which may be off — see ADR 4.
   */
  roles: readonly Snowflake[]
  /** When the member joined the guild, as the raw ISO string. */
  joinedTimestamp: ISO8601Timestamp
  /** When the member started boosting the guild, as the raw ISO string. */
  premiumSinceTimestamp: ISO8601Timestamp | null | undefined
  /** Whether the member is server-deafened in voice channels. */
  deaf: boolean
  /** Whether the member is server-muted in voice channels. */
  mute: boolean
  /** The member's flags, as a bit set. */
  flags: number
  /**
   * Whether the member has passed the guild's membership screening.
   *
   * @remarks
   * Note the inversion: `true` means the member is still pending and cannot interact.
   *
   * Carried across from the payload TSDoc verbatim, and deliberately **not** renamed to
   * something like `screened`. A rename would hide the trap rather than flag it, and would
   * break grep against Discord's own documentation.
   */
  pending: boolean | undefined
  /** The member's computed permissions, present only inside an interaction payload. */
  permissions: string | undefined
  /** When the member's timeout expires, as the raw ISO string. */
  communicationDisabledUntilTimestamp: ISO8601Timestamp | null | undefined

  /**
   * @param data - The payload to mirror.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIGuildMember, client: Client) {
    super(client)

    this.user = data.user === undefined ? undefined : new User(data.user, client)
    this.nick = data.nick
    this.avatar = data.avatar
    this.banner = data.banner
    this.roles = data.roles
    this.joinedTimestamp = data.joined_at
    this.premiumSinceTimestamp = data.premium_since
    this.deaf = data.deaf
    this.mute = data.mute
    this.flags = data.flags
    this.pending = data.pending
    this.permissions = data.permissions
    this.communicationDisabledUntilTimestamp = data.communication_disabled_until
  }

  /** The user's ID, when the user was carried with the member. */
  get id(): Snowflake | undefined {
    return this.user?.id
  }

  /** When the member joined the guild. Allocates. */
  get joinedAt(): Date {
    return new Date(this.joinedTimestamp)
  }

  /** When the member started boosting, or `null` if they are not. Allocates. */
  get premiumSince(): Date | null {
    const raw = this.premiumSinceTimestamp
    return raw === undefined || raw === null ? null : new Date(raw)
  }

  /** When the member's timeout expires, or `null` if none is set. Allocates. */
  get communicationDisabledUntil(): Date | null {
    const raw = this.communicationDisabledUntilTimestamp
    return raw === undefined || raw === null ? null : new Date(raw)
  }

  /**
   * Whether the member is currently timed out.
   *
   * @param now - The moment to test against, defaulting to now.
   * @returns Whether they are silenced.
   *
   * @remarks
   * Discord does not clear `communication_disabled_until` when a timeout expires, so the
   * field being set is not the same as the member being timed out. Comparing against the
   * clock is the only correct reading, and it is exactly the check consumers get wrong.
   */
  isTimedOut(now: number = Date.now()): boolean {
    const until = this.communicationDisabledUntilTimestamp
    if (until === undefined || until === null) return false
    return Date.parse(until) > now
  }

  /** The display name, preferring the guild nickname. */
  get displayName(): string | undefined {
    return this.nick ?? this.user?.globalName ?? this.user?.username
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   *
   * @remarks
   * A member whose user arrives again is patched rather than replaced, so a consumer
   * holding `member.user` keeps a live object.
   */
  patch(data: APIGuildMember): void {
    if (data.user !== undefined) {
      if (this.user === undefined) {
        this.user = new User(data.user, this.client)
      } else {
        this.user.patch(data.user)
      }
    }
    this.nick = data.nick
    this.avatar = data.avatar
    this.banner = data.banner
    this.roles = data.roles
    this.joinedTimestamp = data.joined_at
    this.premiumSinceTimestamp = data.premium_since
    this.deaf = data.deaf
    this.mute = data.mute
    this.flags = data.flags
    this.pending = data.pending
    this.permissions = data.permissions
    this.communicationDisabledUntilTimestamp = data.communication_disabled_until
  }

  /**
   * The mention form.
   *
   * @remarks
   * A plain user mention. Discord retired the `<@!id>` nickname form and renders both
   * identically, so there is nothing to choose between them.
   */
  override toString(): string {
    return this.user === undefined ? '' : `<@${this.user.id}>`
  }
}
