import type { APIEmoji, Snowflake } from '@vestra/types'
import { Base } from './Base.js'
import { snowflakeDate, snowflakeTimestamp } from './snowflake.js'

/**
 * A custom emoji belonging to a guild.
 *
 * @remarks
 * **This models a guild emoji, not the partial emoji in a reaction.** `APIEmoji` covers both,
 * and the reaction form is `{ id: null, name: '👍' }` — a standard Unicode emoji with no ID and
 * nothing to cache. A structure that accepted both would need a nullable `id`, which makes the
 * cache key nullable, which makes the whole scope unkeyable. {@link createEmoji} refuses the
 * partial form for that reason, rather than producing an emoji with no identity.
 *
 * **`guildId` is a constructor argument.** Emojis arrive nested inside `GUILD_CREATE` and
 * inside `GUILD_EMOJIS_UPDATE`, neither of which puts a `guild_id` on the emoji itself. Same
 * reasoning as {@link Role}, and the scope groups on it.
 */
export class Emoji<Client = unknown> extends Base<Client> {
  /** The emoji's ID. */
  declare readonly id: Snowflake
  /** The guild it belongs to. */
  declare readonly guildId: Snowflake
  /** The emoji's name. */
  declare name: string | null
  /** The roles allowed to use it. Empty means everybody. */
  declare roles: Snowflake[]
  /** Who uploaded it, when the payload said. */
  declare userId: Snowflake | undefined
  /** Whether it must be wrapped in colons to be typed. */
  declare requireColons: boolean | undefined
  /** Whether an integration manages it. */
  declare managed: boolean | undefined
  /** Whether it is animated. */
  declare animated: boolean | undefined
  /**
   * Whether it can currently be used.
   *
   * @remarks
   * Goes `false` when a guild loses boosts and drops below the tier that granted the slot.
   * The emoji stays in the list; it simply stops working, so a bot that posts it fails
   * silently rather than erroring.
   */
  declare available: boolean | undefined

  /**
   * @param data - The payload to mirror. Must carry an ID.
   * @param guildId - The guild the emoji belongs to.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIEmoji & { id: Snowflake }, guildId: Snowflake, client: Client) {
    super(client)

    this.id = data.id
    this.guildId = guildId
    this.name = data.name
    this.roles = data.roles === undefined ? [] : [...data.roles]
    this.userId = data.user?.id
    this.requireColons = data.require_colons
    this.managed = data.managed
    this.animated = data.animated
    this.available = data.available
  }

  /** When the emoji was created, in epoch milliseconds. */
  get createdTimestamp(): number {
    return snowflakeTimestamp(this.id)
  }

  /** When the emoji was created. Allocates. */
  get createdAt(): Date {
    return snowflakeDate(this.id)
  }

  /**
   * The CDN URL of the emoji's image.
   *
   * @remarks
   * The extension follows `animated`, because Discord serves an animated emoji as a GIF and a
   * static one as a PNG under the same ID. Asking for the wrong one returns the wrong thing
   * rather than a 404, which is the sort of bug that survives review.
   */
  get imageUrl(): string {
    const extension = this.animated === true ? 'gif' : 'png'
    return `https://cdn.discordapp.com/emojis/${this.id}.${extension}`
  }

  /**
   * The form a reaction route wants.
   *
   * @remarks
   * Not the same string as {@link Emoji.toString}, and confusing the two is the classic
   * reaction bug: `PUT /channels/…/reactions/{emoji}` takes `name:id` and rejects the
   * message-markup form with a 400 that does not explain itself.
   */
  get identifier(): string {
    return `${this.name ?? '_'}:${this.id}`
  }

  /**
   * Renders the emoji as Discord's message markup.
   *
   * @returns `<:name:id>`, or `<a:name:id>` when animated.
   */
  override toString(): string {
    return `<${this.animated === true ? 'a' : ''}:${this.name ?? '_'}:${this.id}>`
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   */
  patch(data: APIEmoji): void {
    this.name = data.name
    this.roles = data.roles === undefined ? [] : [...data.roles]
    this.userId = data.user?.id
    this.requireColons = data.require_colons
    this.managed = data.managed
    this.animated = data.animated
    this.available = data.available
  }
}

/**
 * Builds an emoji, refusing one with no identity.
 *
 * @param data - The payload.
 * @param guildId - The guild it belongs to.
 * @param client - The client that will own the structure.
 * @returns The structure, or `undefined` for a standard Unicode emoji.
 *
 * @remarks
 * `APIEmoji` covers guild emojis and the partial form used in reactions, and only the first
 * has an ID. Returning `undefined` for the second keeps the cache key non-nullable, which is
 * what makes the scope keyable at all.
 */
export function createEmoji<Client>(
  data: APIEmoji,
  guildId: Snowflake,
  client: Client,
): Emoji<Client> | undefined {
  const id = data.id
  if (id === null) return undefined
  return new Emoji({ ...data, id }, guildId, client)
}
