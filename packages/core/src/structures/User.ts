import type { APIUser, PremiumType, Snowflake } from '@vestra/types'
import { Base } from './Base.js'
import { snowflakeDate, snowflakeTimestamp } from './snowflake.js'

/**
 * A Discord user.
 *
 * @remarks
 * Fields are assigned in a fixed order in the constructor, every one of them, every time.
 * That is what keeps every `User` sharing one hidden class: V8 assigns a shape per
 * assignment sequence, so a constructor that skips absent fields produces a different shape
 * per payload variant and turns `user.username` in consumer code polymorphic. Assigning
 * `undefined` costs one slot and keeps the shape.
 *
 * See CONTRIBUTING.md's hot-path rules and `docs/design/phase-4-core.md` §4.15.
 */
export class User<Client = unknown> extends Base<Client> {
  /** The user's ID. */
  readonly id: Snowflake
  /** The username, unique across the platform for migrated accounts. */
  username: string
  /**
   * The legacy four-digit discriminator, or `'0'` on a migrated account.
   *
   * @remarks
   * `'0'` rather than absent, which is why {@link tag} tests for it rather than for
   * presence. Discord kept the field and changed its meaning.
   */
  discriminator: string
  /** The display name, or `null` if the user has not set one. */
  globalName: string | null
  /** The avatar hash, or `null` when the user has the default avatar. */
  avatar: string | null
  /** Whether the user is a bot. */
  bot: boolean | undefined
  /** Whether the user is Discord's system account. */
  system: boolean | undefined
  /** The banner hash. */
  banner: string | null | undefined
  /** The banner colour as an integer, when no banner image is set. */
  accentColor: number | null | undefined
  /** The public flags bit set. */
  publicFlags: number | undefined
  /** Which Nitro tier the user has. */
  premiumType: PremiumType | undefined

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
  patch(data: APIUser): void {
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

  /** The mention form, which Discord renders as a link. */
  override toString(): string {
    return `<@${this.id}>`
  }
}
