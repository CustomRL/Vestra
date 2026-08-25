import type { APIGuildChannelBase, APIOverwrite, ChannelType, Snowflake } from '@vestra/types'
import { Channel } from './Channel.js'
import type { ChannelChanges, ChannelChangesDraft } from './ChannelChanges.js'

/**
 * A permission overwrite, mirrored rather than held by reference.
 *
 * @remarks
 * The field names are already camelCase in the payload, so this exists for the other half of
 * the conversion rule: holding Discord's array would alias the payload, and a consumer who
 * mutated `channel.permissionOverwrites` would be editing the object the dispatch arrived in.
 */
export interface PermissionOverwrite {
  /** The ID of the role or member this applies to. */
  id: Snowflake
  /** Whether `id` refers to a role (`0`) or a member (`1`). */
  type: 0 | 1
  /** Permissions explicitly allowed, as a decimal string. */
  allow: string
  /** Permissions explicitly denied, as a decimal string. */
  deny: string
}

/**
 * Any channel that lives inside a guild.
 *
 * @remarks
 * **`guildId` is a constructor argument, not a payload field.** Discord omits `guild_id` from
 * the channel objects nested inside `GUILD_CREATE`, where the guild is obvious from context —
 * so a structure that read it off the payload would have `undefined` for every channel learnt
 * at startup, which is nearly all of them. Same reasoning as {@link Role}, and the channels
 * cache groups on this field, so getting it wrong empties `channels.group(guildId)`.
 */
export abstract class GuildChannel<Client = unknown> extends Channel<Client> {
  /** The guild this channel belongs to. */
  declare readonly guildId: Snowflake
  /** The channel's name. */
  declare name: string
  /**
   * The channel's sorting position.
   *
   * @remarks
   * Neither unique nor contiguous. Sort by position and then by ID to reproduce the order the
   * Discord client shows; sorting by position alone leaves ties in an arbitrary order.
   */
  declare position: number
  /** Explicit permission overwrites for roles and members. */
  declare permissionOverwrites: PermissionOverwrite[]
  /** The category this channel sits under. */
  declare parentId: Snowflake | null | undefined
  /** Whether the channel is marked age-restricted. */
  declare nsfw: boolean | undefined

  /**
   * @param data - The payload to mirror.
   * @param guildId - The guild the channel belongs to.
   * @param client - The client that produced this structure.
   */
  protected constructor(
    data: APIGuildChannelBase<ChannelType>,
    guildId: Snowflake,
    client: Client,
  ) {
    super(data, client)

    this.guildId = guildId
    this.name = data.name
    this.position = data.position
    this.permissionOverwrites = toOverwrites(data.permission_overwrites)
    this.parentId = data.parent_id
    this.nsfw = data.nsfw
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   */
  override patch(data: APIGuildChannelBase<ChannelType>): ChannelChanges<Client> | null {
    let changes: ChannelChangesDraft<Client> | null = super.patch(data)

    if (data.name !== this.name) (changes ??= {}).name = this.name
    this.name = data.name
    if (data.position !== this.position) (changes ??= {}).position = this.position
    this.position = data.position
    // Compared by value: `toOverwrites` builds a fresh array of fresh objects on every
    // dispatch, so a reference test would report a permission change every time. "The channel
    // permissions moved" is worth the element walk — it is the one thing a moderation bot
    // watches this event for — and a channel's overwrite list is short.
    if (!sameOverwrites(this.permissionOverwrites, data.permission_overwrites)) {
      ;(changes ??= {}).permissionOverwrites = this.permissionOverwrites
    }
    this.permissionOverwrites = toOverwrites(data.permission_overwrites)
    if (data.parent_id !== this.parentId) (changes ??= {}).parentId = this.parentId
    this.parentId = data.parent_id
    if (data.nsfw !== this.nsfw) (changes ??= {}).nsfw = this.nsfw
    this.nsfw = data.nsfw

    return changes
  }
}

/** Copies the overwrites out of the payload so nothing aliases it. */
/**
 * Whether a payload's overwrites match the ones already held, field for field.
 *
 * @param before - The overwrites currently held.
 * @param after - The overwrites that arrived, in their payload form.
 * @returns `true` if nothing moved.
 *
 * @remarks
 * Compared before conversion, so nothing is allocated to answer the question. `toOverwrites`
 * builds a fresh array of fresh objects on every dispatch, so a reference test would report a
 * permission change on every channel update and leave the record non-null forever.
 *
 * Order-sensitive, like {@link sameStrings}, and for the same reason: Discord sends the list in
 * a stable order, and the failure mode is a spurious report rather than a wrong previous value.
 */
function sameOverwrites(
  before: readonly PermissionOverwrite[],
  after: readonly APIOverwrite[] | undefined,
): boolean {
  if (after === undefined) return before.length === 0
  if (before.length !== after.length) return false
  for (let index = 0; index < before.length; index += 1) {
    const held = before[index]
    const arrived = after[index]
    if (held === undefined || arrived === undefined) return false
    if (held.id !== arrived.id) return false
    if (held.type !== arrived.type) return false
    if (held.allow !== arrived.allow) return false
    if (held.deny !== arrived.deny) return false
  }
  return true
}

function toOverwrites(raw: APIOverwrite[] | undefined): PermissionOverwrite[] {
  if (raw === undefined) return []

  const overwrites: PermissionOverwrite[] = []
  for (const entry of raw) {
    overwrites.push({ id: entry.id, type: entry.type, allow: entry.allow, deny: entry.deny })
  }
  return overwrites
}
