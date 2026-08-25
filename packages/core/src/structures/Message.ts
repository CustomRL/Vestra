import type {
  APIAttachment,
  APIEmbed,
  GatewayMessageCreateDispatchData,
  GatewayMessageUpdateDispatchData,
  ISO8601Timestamp,
  MessageType,
  RESTPostAPIChannelMessageJSONBody,
  Snowflake,
} from '@vestra/types'
import { Base } from './Base.js'
import { sameIds, sameStrings, type Changes, type ChangesDraft } from './Changes.js'
import type { CacheCapable, RestCapable } from './capabilities.js'
import type { Channel } from './channels/Channel.js'
import type { Guild } from './Guild.js'
import { messageLink } from './links.js'
import { GuildMember } from './GuildMember.js'
import { User } from './User.js'
import { snowflakeDate, snowflakeTimestamp } from './snowflake.js'

/**
 * A message a bot can rely on every field of.
 *
 * @remarks
 * What {@link Message.isComplete} narrows to. Separate classes for complete and partial
 * messages would give better types on paper and cost a second hidden class, so any code
 * path handling both would go polymorphic on every field read. One class with a boolean
 * discriminant and an interface-narrowing predicate gets the same safety with one shape.
 */
export interface CompleteMessage<Client = unknown> extends Message<Client> {
  readonly author: User<Client>
  readonly content: string
  readonly sentTimestamp: ISO8601Timestamp
  readonly editedTimestamp: ISO8601Timestamp | null
  readonly type: MessageType
}

/**
 * The fields a {@link Message.patch} can report as changed.
 *
 * @remarks
 * A list rather than `keyof Message`, so the record cannot offer a key it will never fill.
 * `id`, `channelId` and `member` are absent because `MESSAGE_UPDATE` never revises them;
 * `author` because it is patched in place, leaving no previous object to hand back; the
 * getters because they are derived and have no stored previous value to report.
 *
 * `packages/core/test/changes.test.ts` reads this union and the body of `patch` and fails if
 * they stop agreeing, so a field added to one and not the other cannot ship.
 */
export type MessageChangeField =
  | 'guildId'
  | 'content'
  | 'sentTimestamp'
  | 'editedTimestamp'
  | 'tts'
  | 'mentionEveryone'
  | 'mentions'
  | 'mentionRoles'
  | 'attachments'
  | 'embeds'
  | 'pinned'
  | 'webhookId'
  | 'type'
  | 'flags'

/**
 * What a message edit displaced.
 *
 * @typeParam Client - The client type the message is bound to.
 *
 * @remarks
 * The second argument to `messageUpdate`, and `null` when the message was not cached or when
 * the update changed nothing this library tracks. See {@link Changes} for why an update
 * reports this rather than a copy of the old message.
 */
export type MessageChanges<Client = unknown> = Changes<Message<Client>, MessageChangeField>

/**
 * A message.
 *
 * @remarks
 * **The partial case is the normal case.** Under ADR 4's defaults the cache holds guilds,
 * channels and the current user — not messages. So a `MESSAGE_UPDATE` for a message the
 * library has never seen is not an edge case, and a design where the partial path is
 * exceptional is a design for a configuration most people will not run.
 *
 * `MESSAGE_UPDATE` guarantees only `id` and `channel_id`; Discord sends whichever fields
 * changed, so an update that adds an embed carries no `content` at all. Every mirrored
 * field is therefore `T | undefined`, and {@link isComplete} is what stops that from making
 * the common path miserable.
 *
 * **Structures never throw on a partial payload.** Absent is `undefined`, never an error.
 *
 * **Two names for when it was sent, because there are two sources.**
 * {@link Message.createdTimestamp} is epoch milliseconds decoded from the ID, the same
 * field of the same type every other structure exposes, so it sorts and subtracts against
 * them and costs no payload field to compute — it is there on a partial that carries
 * nothing but an ID. {@link Message.sentTimestamp} is Discord's own ISO string, which is
 * authoritative and carries microsecond precision the snowflake does not, so it is kept
 * raw rather than folded into the other. They describe the same moment; prefer the
 * snowflake for arithmetic and the wire value when exactness is the point.
 */
export class Message<Client = unknown> extends Base<Client> {
  /** The message's ID. */
  declare readonly id: Snowflake
  /** The channel it was sent in. */
  declare readonly channelId: Snowflake
  /** The guild it was sent in, absent in a direct message. */
  declare guildId: Snowflake | undefined
  /** Who sent it. */
  declare author: User<Client> | undefined
  /**
   * The author's guild membership.
   *
   * @remarks
   * Carries no nested user — Discord strips it, because the author sits beside it — which
   * is why {@link GuildMember} takes its IDs rather than reading them from `user`.
   */
  declare member: GuildMember<Client> | undefined
  /**
   * The message text.
   *
   * @remarks
   * An empty string rather than absent when the bot lacks the `MessageContent` intent,
   * which is the single most common cause of "my bot sees no text". `undefined` here means
   * a partial payload did not carry the field at all — a different thing, and worth telling
   * apart when debugging.
   */
  declare content: string | undefined
  /**
   * When it was sent, as the raw ISO string Discord sent.
   *
   * @remarks
   * The authoritative time, kept raw because Discord's value carries microseconds that
   * {@link Message.createdTimestamp} cannot. Absent on a partial payload that did not
   * carry `timestamp`; the snowflake answers even then.
   */
  declare sentTimestamp: ISO8601Timestamp | undefined
  /** When it was last edited, `null` if never, as the raw ISO string. */
  declare editedTimestamp: ISO8601Timestamp | null | undefined
  /** Whether it was sent as text-to-speech. */
  declare tts: boolean | undefined
  /** Whether it mentioned everybody. */
  declare mentionEveryone: boolean | undefined
  /** The users it mentioned. */
  declare mentions: readonly User<Client>[] | undefined
  /** The IDs of the roles it mentioned. */
  declare mentionRoles: readonly Snowflake[] | undefined
  /**
   * Its attachments.
   *
   * @remarks
   * Payload objects held by reference rather than converted, so their fields are
   * `snake_case`. §4.15 holds arrays and nested objects by reference — they came out of
   * `JSON.parse` moments ago and nothing else aliases them — and §4.17 cuts `Attachment` as
   * a structure. The inconsistency with the rest of the surface is real and recorded.
   */
  declare attachments: readonly APIAttachment[] | undefined
  /** Its embeds, held by reference for the same reason as {@link attachments}. */
  declare embeds: readonly APIEmbed[] | undefined
  /** Whether it is pinned. */
  declare pinned: boolean | undefined
  /** The webhook that sent it, when one did. */
  declare webhookId: Snowflake | undefined
  /** What kind of message it is. */
  declare type: MessageType | undefined
  /** Its flags, as a bit set. */
  declare flags: number | undefined
  /**
   * Whether this was built from a payload that did not carry every field.
   *
   * @remarks
   * The discriminant {@link isComplete} reads. `true` does not mean the message is
   * incomplete *now* — a partial that is later patched with a full payload stays `true`,
   * because the fields it never received are still unknown rather than known-absent.
   */
  declare readonly partial: boolean

  /**
   * @param data - The payload to mirror, full or partial.
   * @param client - The client that produced this structure.
   */
  constructor(
    data: GatewayMessageCreateDispatchData | GatewayMessageUpdateDispatchData,
    client: Client,
  ) {
    super(client)

    // Every field, unconditionally, in a fixed order. The fields are `declare`d so nothing
    // is emitted before this runs, which makes this the only thing creating properties — a
    // skipped assignment would give partial payloads their own hidden class.
    this.id = data.id
    this.channelId = data.channel_id
    this.guildId = data.guild_id
    this.author = data.author === undefined ? undefined : new User(data.author, client)
    this.member =
      data.member === undefined || data.guild_id === undefined || data.author === undefined
        ? undefined
        : new GuildMember(data.member, data.guild_id, data.author.id, client)
    this.content = data.content
    this.sentTimestamp = data.timestamp
    this.editedTimestamp = data.edited_timestamp
    this.tts = data.tts
    this.mentionEveryone = data.mention_everyone
    this.mentions = data.mentions?.map((user) => new User(user, client))
    this.mentionRoles = data.mention_roles
    this.attachments = data.attachments
    this.embeds = data.embeds
    this.pinned = data.pinned
    this.webhookId = data.webhook_id
    this.type = data.type
    this.flags = data.flags
    this.partial = data.author === undefined || data.content === undefined
  }

  /** When the message was sent, in epoch milliseconds, from its ID. */
  get createdTimestamp(): number {
    return snowflakeTimestamp(this.id)
  }

  /** When the message was sent. Allocates. */
  get createdAt(): Date {
    return snowflakeDate(this.id)
  }

  /**
   * When the message was sent, from {@link Message.sentTimestamp}. Allocates.
   *
   * @remarks
   * `undefined` when the payload did not carry `timestamp`, which
   * {@link Message.createdAt} never is.
   */
  get sentAt(): Date | undefined {
    const raw = this.sentTimestamp
    return raw === undefined ? undefined : new Date(raw)
  }

  /** When the message was last edited, or `null`. Allocates. */
  get editedAt(): Date | null {
    const raw = this.editedTimestamp
    return raw === undefined || raw === null ? null : new Date(raw)
  }

  /**
   * Whether every mirrored field arrived.
   *
   * @returns Whether this carries a full payload.
   *
   * @remarks
   * A type predicate rather than a boolean, so the common path stops being a wall of
   * `undefined` checks:
   *
   * ```ts
   * if (message.isComplete()) message.content.toUpperCase()
   * ```
   */
  isComplete(): this is CompleteMessage<Client> {
    return !this.partial
  }

  /**
   * The cached channel this message was sent in.
   *
   * @param this - A structure whose client can reach the cache.
   * @returns The channel, or `undefined` when it is not cached.
   *
   * @remarks
   * **Returns `undefined`, and README examples must respect that.** A message in a thread with
   * `threads: false`, or any message on a client with `channels: false`, has no cached channel
   * — and both are configurations this library encourages. An accessor that asserted would
   * make cache configuration a source of runtime exceptions in code that never mentions
   * caching.
   *
   * Which is why {@link Message.send} and {@link Message.reply} do not go through this. They
   * send by `channelId`, so replying works on a client that caches nothing at all.
   *
   * Both scopes are checked because a thread is a channel and the message does not say which
   * store holds it.
   */
  channel<C extends CacheCapable>(this: Message<C>): Channel | undefined {
    return (
      this.client.cache.channels.get(this.channelId) ??
      this.client.cache.threads.get(this.channelId)
    )
  }

  /**
   * The cached guild this message was sent in.
   *
   * @param this - A structure whose client can reach the cache.
   * @returns The guild, or `undefined` in a direct message or when it is not cached.
   */
  guild<C extends CacheCapable>(this: Message<C>): Guild | undefined {
    const guildId = this.guildId
    return guildId === undefined ? undefined : this.client.cache.guilds.get(guildId)
  }

  /**
   * Sends a new message to the same channel.
   *
   * @param body - What to send.
   * @param options - Request options, such as an abort signal.
   * @returns The message that was sent.
   *
   * @remarks
   * Does **not** need the channel to be cached: it sends by `channelId`, which every message
   * carries. That matters because the obvious spelling — reach for `message.channel`, then send
   * — fails on a client with `channels: false`, and cache configuration should not decide
   * whether a bot can reply.
   *
   * Returns a {@link Message}, not the `APIMessage` the route returns. That is the deliberate
   * difference between the two vocabularies: `client.rest.channels.createMessage(...)` hands
   * back the payload, and this hands back a structure.
   */
  async send<C extends RestCapable>(
    this: Message<C>,
    body: RESTPostAPIChannelMessageJSONBody,
    options: { signal?: AbortSignal } = {},
  ): Promise<Message<C>> {
    const sent = await this.client.rest.channels.createMessage(this.channelId, body, options)
    return new Message(sent, this.client)
  }

  /**
   * Replies to this message.
   *
   * @param body - What to send.
   * @param options - Request options, such as an abort signal.
   * @returns The reply that was sent.
   *
   * @remarks
   * A reply is an ordinary message carrying a `message_reference` that points here, which is
   * why this is a few lines rather than a route of its own.
   *
   * `fail_if_not_exists` is deliberately left unset. Discord defaults it to `true`, so replying
   * to a message somebody deleted mid-command errors rather than silently posting a detached
   * message; flipping that here would turn a visible failure into a confusing one. A caller who
   * wants the lenient behaviour asks for it.
   *
   * A `message_reference` the caller supplies wins. Overriding it would make replying across
   * channels — which crossposting needs — impossible to express.
   */
  async reply<C extends RestCapable>(
    this: Message<C>,
    body: RESTPostAPIChannelMessageJSONBody,
    options: { signal?: AbortSignal } = {},
  ): Promise<Message<C>> {
    return await this.send(
      {
        ...body,
        message_reference: body.message_reference ?? {
          message_id: this.id,
          channel_id: this.channelId,
          ...(this.guildId === undefined ? {} : { guild_id: this.guildId }),
        },
      },
      options,
    )
  }

  /**
   * Applies a partial payload in place, reporting what it displaced.
   *
   * @param data - The fields that changed.
   * @returns The previous values of the fields that actually changed, or `null` if none did.
   *
   * @remarks
   * **Assigns only what arrived**, which is the opposite of the constructor and the reason
   * they are not the same code. `MESSAGE_UPDATE` carries whichever fields changed, so
   * copying absent ones would blank `content` on every edit that only added an embed —
   * turning an update into data loss.
   *
   * The shape is safe either way: the constructor already created every property, so a
   * conditional assignment here cannot add one.
   *
   * **The record is allocated on the first real change and not before.** An update that
   * carries nothing new — an embed resolving server-side, a dispatch replayed after a resume
   * — returns `null` having allocated nothing at all.
   *
   * **{@link Message.author} is never reported.** It is patched in place, so the previous
   * author is the same object with new values in it and there is no earlier state left to hand
   * back.
   *
   * **`attachments` and `embeds` are reported whenever the payload carries them**, which for a
   * message is every edit, because their contents can change while their identities do not and
   * a deep comparison on this path costs more than the answer is worth. Mentions and mention
   * roles used to behave that way too and no longer do — both have an exact answer that costs
   * an element walk. {@link Changes} says where the line is.
   */
  patch(data: GatewayMessageUpdateDispatchData): MessageChanges<Client> | null {
    // Lazily allocated, and written with `;(changes ??= {}).field = …` so the allocation and
    // the record are one statement. Anything shorter would be a keyed store on a hot path.
    let changes: ChangesDraft<Message<Client>, MessageChangeField> | null = null

    if (data.guild_id !== undefined && data.guild_id !== this.guildId) {
      ;(changes ??= {}).guildId = this.guildId
      this.guildId = data.guild_id
    }
    if (data.author !== undefined) {
      if (this.author === undefined) {
        this.author = new User(data.author, this.client)
      } else {
        this.author.patch(data.author)
      }
    }
    if (data.content !== undefined && data.content !== this.content) {
      ;(changes ??= {}).content = this.content
      this.content = data.content
    }
    if (data.timestamp !== undefined && data.timestamp !== this.sentTimestamp) {
      ;(changes ??= {}).sentTimestamp = this.sentTimestamp
      this.sentTimestamp = data.timestamp
    }
    if (data.edited_timestamp !== undefined && data.edited_timestamp !== this.editedTimestamp) {
      ;(changes ??= {}).editedTimestamp = this.editedTimestamp
      this.editedTimestamp = data.edited_timestamp
    }
    if (data.tts !== undefined && data.tts !== this.tts) {
      ;(changes ??= {}).tts = this.tts
      this.tts = data.tts
    }
    if (data.mention_everyone !== undefined && data.mention_everyone !== this.mentionEveryone) {
      ;(changes ??= {}).mentionEveryone = this.mentionEveryone
      this.mentionEveryone = data.mention_everyone
    }
    // `MESSAGE_UPDATE` carries the whole message, so all four of these arrive on every edit
    // and a reference test would report all four as changed every time — which a live run
    // against Discord duly did, on an edit that only touched the content.
    //
    // Two of them have an exact answer that costs an element walk. Mentions mean *who was
    // mentioned*, so identity is the whole content of the field; mention roles are snowflakes
    // and nothing else.
    if (data.mentions !== undefined) {
      if (!sameIds(this.mentions, data.mentions)) (changes ??= {}).mentions = this.mentions
      this.mentions = data.mentions.map((user) => new User(user, this.client))
    }
    if (data.mention_roles !== undefined) {
      if (!sameStrings(this.mentionRoles, data.mention_roles)) {
        ;(changes ??= {}).mentionRoles = this.mentionRoles
      }
      this.mentionRoles = data.mention_roles
    }
    // The other two keep the reference comparison, because their contents can change while
    // their identities do not — an attachment description edited, an embed re-rendered — and
    // an identity test there would be a silent miss rather than an exact answer. For embeds it
    // is usually right regardless: an embed resolving server-side is the commonest reason a
    // message updates at all.
    if (data.attachments !== undefined) {
      ;(changes ??= {}).attachments = this.attachments
      this.attachments = data.attachments
    }
    if (data.embeds !== undefined) {
      ;(changes ??= {}).embeds = this.embeds
      this.embeds = data.embeds
    }
    if (data.pinned !== undefined && data.pinned !== this.pinned) {
      ;(changes ??= {}).pinned = this.pinned
      this.pinned = data.pinned
    }
    if (data.webhook_id !== undefined && data.webhook_id !== this.webhookId) {
      ;(changes ??= {}).webhookId = this.webhookId
      this.webhookId = data.webhook_id
    }
    if (data.type !== undefined && data.type !== this.type) {
      ;(changes ??= {}).type = this.type
      this.type = data.type
    }
    if (data.flags !== undefined && data.flags !== this.flags) {
      ;(changes ??= {}).flags = this.flags
      this.flags = data.flags
    }

    return changes
  }

  /**
   * A link to the message.
   *
   * @remarks
   * `@me` stands in for the guild on a direct message, which is what Discord's own client
   * produces and what its link parser accepts.
   */
  get url(): string {
    // Delegates rather than inlining the template: `parseMessageLink` has to agree with this
    // exactly, and two spellings of one URL shape drift the first time either is touched.
    return messageLink({
      guildId: this.guildId,
      channelId: this.channelId,
      messageId: this.id,
    })
  }
}
