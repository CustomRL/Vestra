import { StickerFormatType, type APISticker, type Snowflake, type StickerType } from '@vestra/types'
import { Base } from './Base.js'
import { snowflakeDate, snowflakeTimestamp } from './snowflake.js'

/**
 * A sticker.
 *
 * @remarks
 * **`tags` is a comma-separated string on the wire, and a list here.** Discord sends
 * `"happy, cheerful"` for a guild sticker and a single autocomplete term for a standard one.
 * Mirroring the string would put `sticker.tags.split(',').map((tag) => tag.trim())` in every
 * consumer, and half of them would forget the trim.
 *
 * **`guildId` comes from the payload, unlike every other guild-scoped structure.** A sticker
 * can be a standard Discord one belonging to a pack rather than to any guild, so the field is
 * genuinely optional and there is no guild to thread through for those. The cache scope groups
 * on it and leaves the pack stickers ungrouped.
 */
export class Sticker<Client = unknown> extends Base<Client> {
  /** The sticker's ID. */
  declare readonly id: Snowflake
  /** The pack it belongs to, for a standard sticker. */
  declare packId: Snowflake | undefined
  /** The sticker's name. */
  declare name: string
  /** The sticker's description. */
  declare description: string | null
  /** The autocomplete tags, split out of Discord's comma-separated string. */
  declare tags: string[]
  /** Whether it is a standard sticker or a guild one. */
  declare type: StickerType
  /** The image format. */
  declare formatType: StickerFormatType
  /** Whether it can currently be used. Goes `false` when a guild loses boosts. */
  declare available: boolean | undefined
  /** The guild it belongs to, for a guild sticker. */
  declare guildId: Snowflake | undefined
  /** Who uploaded it, when the payload said. */
  declare userId: Snowflake | undefined
  /** Where it sorts within its pack. */
  declare sortValue: number | undefined

  /**
   * @param data - The payload to mirror.
   * @param client - The client that produced this structure.
   */
  constructor(data: APISticker, client: Client) {
    super(client)

    this.id = data.id
    this.packId = data.pack_id
    this.name = data.name
    this.description = data.description
    this.tags = splitTags(data.tags)
    this.type = data.type
    this.formatType = data.format_type
    this.available = data.available
    this.guildId = data.guild_id
    this.userId = data.user?.id
    this.sortValue = data.sort_value
  }

  /** When the sticker was created, in epoch milliseconds. */
  get createdTimestamp(): number {
    return snowflakeTimestamp(this.id)
  }

  /** When the sticker was created. Allocates. */
  get createdAt(): Date {
    return snowflakeDate(this.id)
  }

  /**
   * The URL of the sticker's asset.
   *
   * @remarks
   * Not one URL shape with a swapped extension, which is why this is a method rather than
   * something a caller should build by hand. A Lottie sticker is JSON rather than an image,
   * and a GIF sticker is served from the media host rather than the CDN — get either wrong and
   * the request succeeds and returns something unusable.
   */
  get assetUrl(): string {
    if (this.formatType === StickerFormatType.Lottie) {
      return `https://cdn.discordapp.com/stickers/${this.id}.json`
    }
    if (this.formatType === StickerFormatType.GIF) {
      return `https://media.discordapp.net/stickers/${this.id}.gif`
    }
    return `https://cdn.discordapp.com/stickers/${this.id}.png`
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   */
  patch(data: APISticker): void {
    this.packId = data.pack_id
    this.name = data.name
    this.description = data.description
    this.tags = splitTags(data.tags)
    this.type = data.type
    this.formatType = data.format_type
    this.available = data.available
    this.guildId = data.guild_id
    this.userId = data.user?.id
    this.sortValue = data.sort_value
  }
}

/** Splits Discord's comma-separated tag string, trimming what it produces. */
function splitTags(raw: string): string[] {
  if (raw === '') return []

  const tags: string[] = []
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    if (trimmed !== '') tags.push(trimmed)
  }
  return tags
}
