import type {
  GatewayInviteCreateDispatchData,
  ISO8601Timestamp,
  InviteTargetType,
  Snowflake,
} from '@vestra/types'
import { Base } from './Base.js'
import { User } from './User.js'

/** Where a Discord client resolves an invite code. */
const INVITE_BASE = 'https://discord.gg'

/**
 * An invite to a channel, as the gateway announces it.
 *
 * @remarks
 * **Built from `GatewayInviteCreateDispatchData`, not from `APIInvite`, and the two are
 * genuinely different objects.** The resource returned by `GET /invites/{code}` nests a
 * partial guild and a partial channel and says nothing about the invite's settings; the
 * dispatch carries `channel_id` and `guild_id` as bare snowflakes and adds `max_age`,
 * `max_uses`, `uses`, `temporary`, `created_at` and the target fields. They overlap on three
 * fields. Accepting both would mean a structure where most properties are `undefined`
 * depending on which payload built it, and a consumer could not tell which case they had
 * without checking. `@vestra/rest` has no invite routes, so `APIInvite` never reaches this
 * package today — when it does, the honest shape is a second structure or a discriminant,
 * decided then rather than guessed at now.
 *
 * **Not cached, and there is no invites scope.** Every other scope is keyed by a snowflake;
 * an invite is keyed by its code, which is a user-chosen string. A store keyed by something
 * else would be a special case in `CacheKeys`, in `evictGuild`, and in every adapter — for an
 * entity with no route to fetch it back, whose count per guild is unbounded, and which
 * expires on a timer Discord never announces. `INVITE_DELETE` would then be the only way an
 * entry left the cache, and it does not fire for an invite that simply ran out of uses.
 *
 * **`uses` is always `0` here.** Discord sends `INVITE_CREATE` at creation and never again,
 * so the count is a snapshot of the moment it was made rather than a live figure — a bot
 * tracking who joined through which invite has to fetch the guild's invites and diff them.
 */
export class Invite<Client = unknown> extends Base<Client> {
  /**
   * The invite's code, which is its identity.
   *
   * @remarks
   * The trailing segment of a `discord.gg` link, and a string rather than a snowflake —
   * Discord generates a short random one, and a guild with the feature can set a vanity code
   * of its own choosing.
   */
  declare readonly code: string
  /** The channel the invite leads to. */
  declare readonly channelId: Snowflake
  /** The guild the invite leads to, or `undefined` for a group direct message invite. */
  declare readonly guildId: Snowflake | undefined
  /**
   * When the invite was created, as the raw ISO string.
   *
   * @remarks
   * Named for the timestamp rather than mirroring `created_at`, because the mechanical name
   * is taken by the {@link Invite.createdAt} `Date` getter beside it — the same rule
   * {@link Guild.joinedTimestamp} follows.
   */
  declare createdTimestamp: ISO8601Timestamp
  /** Who created the invite, when Discord said. */
  declare inviter: User<Client> | undefined
  /** How long the invite lives, in seconds, where `0` never expires. */
  declare maxAge: number
  /** How many times it may be used, where `0` is unlimited. */
  declare maxUses: number
  /** What the invite points at, on a voice channel invite. */
  declare targetType: InviteTargetType | undefined
  /** The user whose stream the invite points at. */
  declare targetUser: User<Client> | undefined
  /**
   * The embedded application the invite launches.
   *
   * @remarks
   * `unknown`, mirroring the payload. `@vestra/types` does not model the application resource
   * yet, and naming a shape this package cannot promise would be worse than making the
   * consumer narrow it themselves.
   */
  declare targetApplication: unknown
  /** Whether joining through this invite grants membership only until the member disconnects. */
  declare temporary: boolean
  /** How many times it had been used when Discord sent the dispatch, which is always `0`. */
  declare uses: number
  /**
   * When the invite expires, as the raw ISO string, or `null` if it never does.
   *
   * @remarks
   * The same suffix rule as {@link Invite.createdTimestamp}: {@link Invite.expiresAt} is the
   * `Date` form.
   */
  declare expiresTimestamp: ISO8601Timestamp | null
  /** The roles a member joining through this invite is given. */
  declare roleIds: readonly Snowflake[] | undefined

  /**
   * @param data - The payload to mirror.
   * @param client - The client that produced this structure.
   */
  constructor(data: GatewayInviteCreateDispatchData, client: Client) {
    super(client)

    this.code = data.code
    this.channelId = data.channel_id
    this.guildId = data.guild_id
    this.createdTimestamp = data.created_at
    this.inviter = data.inviter === undefined ? undefined : new User(data.inviter, client)
    this.maxAge = data.max_age
    this.maxUses = data.max_uses
    this.targetType = data.target_type
    this.targetUser =
      data.target_user === undefined ? undefined : new User(data.target_user, client)
    this.targetApplication = data.target_application
    this.temporary = data.temporary
    this.uses = data.uses
    this.expiresTimestamp = data.expires_at
    this.roleIds = data.role_ids
  }

  /** When the invite was created. Allocates. */
  get createdAt(): Date {
    return new Date(this.createdTimestamp)
  }

  /** When the invite expires, or `null` if it never does. Allocates. */
  get expiresAt(): Date | null {
    const raw = this.expiresTimestamp
    return raw === null ? null : new Date(raw)
  }

  /**
   * The link a person would paste.
   *
   * @remarks
   * `discord.gg` rather than `discord.com/invite`. Both resolve, and Discord's own share
   * button produces the short one, so this is the form a user recognises.
   */
  get url(): string {
    return `${INVITE_BASE}/${this.code}`
  }

  /**
   * Whether the invite is unlimited in both age and uses.
   *
   * @remarks
   * Both halves, because either one running out kills it. Discord spells "no limit" as `0`
   * for each, which reads as "expires immediately" to anybody who has not met the convention
   * — the mistake this exists to stop being made per call site.
   */
  get permanent(): boolean {
    return this.maxAge === 0 && this.maxUses === 0
  }

  /** The link, so an invite can be dropped straight into message content. */
  override toString(): string {
    return this.url
  }
}
