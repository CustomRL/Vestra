import type { APIUser, PremiumType, Snowflake } from '@vestra/types'
import { Base } from './Base.js'
import type { Changes, ChangesDraft } from './Changes.js'
import { defaultAvatarUrl, userAvatarUrl, userBannerUrl, type ImageOptions } from './cdn.js'
import { snowflakeDate, snowflakeTimestamp } from './snowflake.js'

/**
 * A Discord user.
 *
 * @remarks
 * Fields are `declare`d and assigned in a fixed order in the constructor, every one of
 * them, every time. The two halves are one rule: `declare` emits nothing, so no redundant
 * field initialisation runs before the assignment — which is what CONTRIBUTING.md asks for
 * — and it also makes the constructor the only thing that creates properties. A constructor
 * that skipped an absent field would then produce a different shape per payload variant and
 * turn `user.username` polymorphic in consumer code. Assigning `undefined` costs one slot
 * and keeps the shape.
 *
 * Written plainly rather than with `declare`, the emit defines every property up front and
 * the shape holds regardless — but at the cost of a define and a set per field on the hot
 * path. See `docs/design/phase-4-core.md` §8-F1.
 *
 * See CONTRIBUTING.md's hot-path rules and `docs/design/phase-4-core.md` §4.15.
 */
/**
 * The fields a {@link User.patch} can report as changed.
 *
 * @remarks
 * `USER_UPDATE` sends a whole user, so every field is present on every dispatch and the
 * comparison decides rather than the presence. `id` is absent because it identifies the user
 * rather than describing them, and a payload revising it would be a different user.
 */
export type UserChangeField =
  | 'username'
  | 'discriminator'
  | 'globalName'
  | 'avatar'
  | 'bot'
  | 'system'
  | 'banner'
  | 'accentColor'
  | 'publicFlags'
  | 'premiumType'

/**
 * What a user edit displaced.
 *
 * @typeParam Client - The client type the user is bound to.
 *
 * @remarks
 * The second argument to `userUpdate`. See {@link Changes}.
 */
export type UserChanges<Client = unknown> = Changes<User<Client>, UserChangeField>

export class User<Client = unknown> extends Base<Client> {
  /** The user's ID. */
  declare readonly id: Snowflake
  /** The username, unique across the platform for migrated accounts. */
  declare username: string
  /**
   * The legacy four-digit discriminator, or `'0'` on a migrated account.
   *
   * @remarks
   * `'0'` rather than absent, which is why {@link tag} tests for it rather than for
   * presence. Discord kept the field and changed its meaning.
   */
  declare discriminator: string
  /** The display name, or `null` if the user has not set one. */
  declare globalName: string | null
  /** The avatar hash, or `null` when the user has the default avatar. */
  declare avatar: string | null
  /** Whether the user is a bot. */
  declare bot: boolean | undefined
  /** Whether the user is Discord's system account. */
  declare system: boolean | undefined
  /** The banner hash. */
  declare banner: string | null | undefined
  /** The banner colour as an integer, when no banner image is set. */
  declare accentColor: number | null | undefined
  /** The public flags bit set. */
  declare publicFlags: number | undefined
  /** Which Nitro tier the user has. */
  declare premiumType: PremiumType | undefined

  /**
   * @param data - The payload to mirror.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIUser, client: Client) {
    super(client)

    this.id = data.id
    this.username = data.username
    this.discriminator = data.discriminator
    this.globalName = data.global_name
    this.avatar = data.avatar
    this.bot = data.bot
    this.system = data.system
    this.banner = data.banner
    this.accentColor = data.accent_color
    this.publicFlags = data.public_flags
    this.premiumType = data.premium_type
  }

  /**
   * How the user is written in text.
   *
   * @remarks
   * `name#0000` for a legacy account and a bare `username` for a migrated one. The
   * discriminator is `'0'` rather than absent on migrated accounts, so this tests the value
   * rather than presence.
   */
  get tag(): string {
    return this.discriminator === '0' ? this.username : `${this.username}#${this.discriminator}`
  }

  /** When the account was created, in epoch milliseconds. */
  get createdTimestamp(): number {
    return snowflakeTimestamp(this.id)
  }

  /** When the account was created. Allocates. */
  get createdAt(): Date {
    return snowflakeDate(this.id)
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   *
   * @remarks
   * Mutates rather than replacing, so every reference a consumer already holds sees the
   * update. Assignment order matches the constructor, which is what keeps the shape stable
   * through a patch — a differently ordered patch would silently create a second hidden
   * class for exactly the objects that get updated most.
   */
  patch(data: APIUser): UserChanges<Client> | null {
    // Record conditionally, assign unconditionally: the payload is absolute, so only the
    // record needs the comparison.
    let changes: ChangesDraft<User<Client>, UserChangeField> | null = null

    if (data.username !== this.username) (changes ??= {}).username = this.username
    this.username = data.username
    if (data.discriminator !== this.discriminator) {
      ;(changes ??= {}).discriminator = this.discriminator
    }
    this.discriminator = data.discriminator
    if (data.global_name !== this.globalName) (changes ??= {}).globalName = this.globalName
    this.globalName = data.global_name
    if (data.avatar !== this.avatar) (changes ??= {}).avatar = this.avatar
    this.avatar = data.avatar
    if (data.bot !== this.bot) (changes ??= {}).bot = this.bot
    this.bot = data.bot
    if (data.system !== this.system) (changes ??= {}).system = this.system
    this.system = data.system
    if (data.banner !== this.banner) (changes ??= {}).banner = this.banner
    this.banner = data.banner
    if (data.accent_color !== this.accentColor) (changes ??= {}).accentColor = this.accentColor
    this.accentColor = data.accent_color
    if (data.public_flags !== this.publicFlags) (changes ??= {}).publicFlags = this.publicFlags
    this.publicFlags = data.public_flags
    if (data.premium_type !== this.premiumType) (changes ??= {}).premiumType = this.premiumType
    this.premiumType = data.premium_type

    return changes
  }

  /**
   * The user's avatar, falling back to the one Discord assigns.
   *
   * @param options - The format and size to request.
   * @returns A URL that always resolves to something.
   *
   * @remarks
   * Never `undefined`, unlike most accessors here: every user has an avatar, because Discord
   * assigns one to anybody who has not set their own. An accessor returning `undefined` would
   * put a fallback in every consumer, and half of them would get the default-avatar rule wrong
   * — see {@link defaultAvatarUrl} for why there are two of them.
   *
   * The format defaults to GIF for an animated avatar and PNG otherwise, decided by the `a_`
   * prefix on the hash, which is the only thing that marks one.
   */
  avatarUrl(options?: ImageOptions): string {
    const hash = this.avatar
    if (hash === null) return defaultAvatarUrl(this.id, this.discriminator)
    return userAvatarUrl(this.id, hash, options)
  }

  /**
   * The user's profile banner, or `undefined` if they have none.
   *
   * @param options - The format and size to request.
   * @returns The URL, or `undefined`.
   *
   * @remarks
   * `undefined` rather than a fallback, because Discord assigns no default banner — a user
   * without one has a solid colour the CDN does not serve.
   */
  bannerUrl(options?: ImageOptions): string | undefined {
    const hash = this.banner
    if (hash === null || hash === undefined) return undefined
    return userBannerUrl(this.id, hash, options)
  }

  /** The mention form, which Discord renders as a link. */
  override toString(): string {
    return `<@${this.id}>`
  }
}
