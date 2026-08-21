import { ChannelType, type APIChannelBase, type Snowflake } from '@vestra/types'
import { Base } from '../Base.js'
import { snowflakeDate, snowflakeTimestamp } from '../snowflake.js'
import type { DMChannel } from './DMChannel.js'
import type { GroupDMChannel } from './GroupDMChannel.js'
import type { GuildChannel } from './GuildChannel.js'
import type { ThreadChannel } from './ThreadChannel.js'
import type { VoiceChannel } from './VoiceChannel.js'

/**
 * What every channel that can carry messages has, whatever else it is.
 *
 * @remarks
 * An interface rather than a class, because the set of message-carrying channels cuts across
 * the class hierarchy: a DM carries messages and has no guild, a guild text channel carries
 * messages and has a position and overwrites. There is no single base both can extend without
 * one of them inheriting fields it would have to lie about, and TypeScript has no multiple
 * inheritance to reach for.
 *
 * So {@link Channel.isTextBased} narrows to `this & TextBased`: the caller keeps whatever
 * concrete type they started with and gains the message fields, and nothing has to pretend to
 * be something it is not.
 */
export interface TextBased {
  /** The ID of the last message sent here, if Discord has said. */
  readonly lastMessageId: Snowflake | null | undefined
}

/**
 * Any Discord channel.
 *
 * @remarks
 * The root of the only structure hierarchy in the library with real depth, mirroring the one
 * `@vestra/types` already has: a channel that lives in a guild has a dozen fields a DM does
 * not, and a flat class would give every DM a `position` and a `parentId` it must lie about.
 *
 * **The predicates narrow to abstractions, not to unions of concrete types.**
 * `channel.isGuildBased()` answers `this is GuildChannel`, which is what a caller wanting
 * `name` or `position` needs. Narrowing to `TextChannel | AnnouncementChannel | …` would name
 * a union that grows every time Discord adds a channel type and would break at every
 * addition. Narrowing to one concrete type is what `channel.type === ChannelType.GuildVoice`
 * is for, and that still works because the `type` field is the discriminant.
 *
 * They are written against `type` rather than `instanceof`. `instanceof` would be shorter and
 * is wrong across realms — a structure built in one `vm` context and read in another fails it
 * — and the point of the check is to be true of the payload, not of the constructor.
 */
export abstract class Channel<Client = unknown> extends Base<Client> {
  /** The channel's ID. */
  declare readonly id: Snowflake
  /** Which kind of channel this is. The discriminant to narrow on. */
  declare readonly type: ChannelType
  /** The channel's flags, as a bit set of `ChannelFlags`. */
  declare flags: number | undefined

  /**
   * @param data - The payload to mirror.
   * @param client - The client that produced this structure.
   */
  protected constructor(data: APIChannelBase<ChannelType>, client: Client) {
    super(client)

    this.id = data.id
    this.type = data.type
    this.flags = data.flags
  }

  /** When the channel was created, in epoch milliseconds. */
  get createdTimestamp(): number {
    return snowflakeTimestamp(this.id)
  }

  /** When the channel was created. Allocates. */
  get createdAt(): Date {
    return snowflakeDate(this.id)
  }

  /** Whether messages can be sent here. */
  isTextBased(): this is this & TextBased {
    return TEXT_BASED.has(this.type)
  }

  /** Whether this channel lives inside a guild. */
  isGuildBased(): this is GuildChannel<Client> {
    return this.type !== ChannelType.DM && this.type !== ChannelType.GroupDM
  }

  /** Whether this channel is a thread of any kind. */
  isThread(): this is ThreadChannel<Client> {
    return THREADS.has(this.type)
  }

  /**
   * Whether this channel can be connected to for voice.
   *
   * @remarks
   * Narrows to {@link VoiceChannel}, which a stage channel is: Discord gives the two the same
   * payload shape, so `StageChannel` extends `VoiceChannel` rather than repeating it.
   */
  isVoiceBased(): this is VoiceChannel<Client> {
    return this.type === ChannelType.GuildVoice || this.type === ChannelType.GuildStageVoice
  }

  /** Whether this channel is a direct message, one-to-one or group. */
  isDMBased(): this is DMChannel<Client> | GroupDMChannel<Client> {
    return this.type === ChannelType.DM || this.type === ChannelType.GroupDM
  }

  /**
   * Renders a channel mention.
   *
   * @returns `<#id>`, which Discord renders as a link.
   *
   * @remarks
   * Produced for a DM too, where it simply will not resolve for anyone else. Discord accepts
   * the form regardless, so refusing to produce it would be the library inventing a rule.
   */
  override toString(): string {
    return `<#${this.id}>`
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   */
  patch(data: APIChannelBase<ChannelType>): void {
    this.flags = data.flags
  }
}

/**
 * The channel types that carry messages.
 *
 * @remarks
 * Voice and stage channels are in the set: both have had text chat since 2021, and a
 * predicate that excluded them would send a caller to REST for a `send()` that works.
 * Categories, forums, media channels and directories are not — a forum holds threads, and
 * posting to one creates a thread rather than a message.
 */
const TEXT_BASED: ReadonlySet<ChannelType> = new Set([
  ChannelType.GuildText,
  ChannelType.DM,
  ChannelType.GuildVoice,
  ChannelType.GroupDM,
  ChannelType.GuildAnnouncement,
  ChannelType.AnnouncementThread,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.GuildStageVoice,
])

/** The three thread types. */
const THREADS: ReadonlySet<ChannelType> = new Set([
  ChannelType.AnnouncementThread,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
])
