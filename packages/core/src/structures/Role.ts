import type { APIRole, APIRoleColors, Snowflake } from '@vestra/types'
import { Base } from './Base.js'
import { roleIconUrl, type ImageOptions } from './cdn.js'
import { snowflakeDate, snowflakeTimestamp } from './snowflake.js'

/**
 * A role's colour, which since gradients is more than one integer.
 *
 * @remarks
 * Converted rather than held by reference, because it is one of the few nested payload
 * objects with snake_case keys that a consumer reads directly. Holding it by reference
 * would put `role.colors.primary_color` in user code, which is the one thing the
 * conversion rule exists to prevent.
 */
export interface RoleColors {
  /** The main colour, as an integer. `0` means no colour. */
  primaryColor: number
  /** The second colour of a gradient, or `null` on a solid role. */
  secondaryColor: number | null
  /** The third colour of a holographic role, or `null`. */
  tertiaryColor: number | null
}

function toRoleColors(colors: APIRoleColors): RoleColors {
  return {
    primaryColor: colors.primary_color,
    secondaryColor: colors.secondary_color,
    tertiaryColor: colors.tertiary_color,
  }
}

/**
 * A set of permissions attached to a group of guild members.
 *
 * @remarks
 * `tags` is deliberately not mirrored. It is a nested object of five rarely-read optional
 * fields whose meaning is carried by presence rather than value — `premium_subscriber` is
 * `null` when true and absent when false — and converting that faithfully needs a
 * sub-structure with its own tests. Until one exists, claiming to mirror it would be worse
 * than not offering it. `docs/design/phase-4-core.md` §4.17 calls this the curated-field-set
 * position; this is one of the cuts.
 */
export class Role<Client = unknown> extends Base<Client> {
  /** The role's ID. */
  declare readonly id: Snowflake
  /**
   * The guild the role belongs to.
   *
   * @remarks
   * Not on the payload — a role arrives either inside its guild or on a dispatch that
   * carries `guild_id` beside it — so the caller supplies it. It is a field because the
   * roles scope is grouped by guild, and `CacheStore.add` derives the group from the value
   * alone; without it `guild.roles` could not be answered from the cache at all.
   */
  declare readonly guildId: Snowflake
  /** The role's name. */
  declare name: string
  /**
   * The role's colour as a single integer.
   *
   * @remarks
   * Discord's deprecated predecessor to {@link colors}, carrying the same value as
   * `colors.primaryColor`. It cannot express a gradient, so on a gradient role it describes
   * only part of the appearance. Mirrored because Discord still sends it on every role, but
   * {@link colors} is the one to read.
   */
  declare color: number
  /** The role's full colour definition, covering gradients and holographic styles. */
  declare colors: RoleColors
  /** Whether members with this role are listed separately in the member sidebar. */
  declare hoist: boolean
  /** The role's icon hash. */
  declare icon: string | null | undefined
  /** The role's unicode emoji, shown in place of an icon. */
  declare unicodeEmoji: string | null | undefined
  /**
   * The role's position.
   *
   * @remarks
   * Higher is more senior. Positions are not unique — several roles can share one, and
   * Discord breaks the tie by ID.
   */
  declare position: number
  /** The role's permissions, as a decimal string bit set. */
  declare permissions: string
  /** Whether the role is managed by an integration and cannot be edited. */
  declare managed: boolean
  /** Whether anybody may mention the role. */
  declare mentionable: boolean
  /** The role's flags, as a bit set. */
  declare flags: number

  /**
   * @param data - The payload to mirror.
   * @param guildId - The guild the role belongs to.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIRole, guildId: Snowflake, client: Client) {
    super(client)

    this.id = data.id
    this.guildId = guildId
    this.name = data.name
    this.color = data.color
    this.colors = toRoleColors(data.colors)
    this.hoist = data.hoist
    this.icon = data.icon
    this.unicodeEmoji = data.unicode_emoji
    this.position = data.position
    this.permissions = data.permissions
    this.managed = data.managed
    this.mentionable = data.mentionable
    this.flags = data.flags
  }

  /** When the role was created, in epoch milliseconds. */
  get createdTimestamp(): number {
    return snowflakeTimestamp(this.id)
  }

  /** When the role was created. Allocates. */
  get createdAt(): Date {
    return snowflakeDate(this.id)
  }

  /**
   * Whether the role is the guild's `@everyone` role.
   *
   * @remarks
   * Discord gives it the guild's own ID rather than marking it, so this is the only way to
   * tell. Worth a named accessor because the alternative is every consumer rediscovering
   * the trick — and now that the role knows its guild, it needs no argument.
   */
  isEveryone(): boolean {
    return this.id === this.guildId
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   */
  patch(data: APIRole): void {
    this.name = data.name
    this.color = data.color
    this.colors = toRoleColors(data.colors)
    this.hoist = data.hoist
    this.icon = data.icon
    this.unicodeEmoji = data.unicode_emoji
    this.position = data.position
    this.permissions = data.permissions
    this.managed = data.managed
    this.mentionable = data.mentionable
    this.flags = data.flags
  }

  /** The role's icon, or `undefined` if it has none. */
  iconUrl(options?: ImageOptions): string | undefined {
    const hash = this.icon
    if (hash === null || hash === undefined) return undefined
    return roleIconUrl(this.id, hash, options)
  }

  /** The mention form, which Discord renders as a coloured pill. */
  override toString(): string {
    return `<@&${this.id}>`
  }
}
