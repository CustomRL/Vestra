import {
  InteractionResponseType,
  InteractionType,
  type APIApplicationCommandInteractionData,
  type APIEntitlement,
  type APIInteraction,
  type APIInteractionCallbackData,
  type APIInteractionData,
  type APIInteractionResponse,
  type APIMessageComponentInteractionData,
  type APIModalSubmitInteractionData,
  type ApplicationIntegrationType,
  type InteractionContextType,
  type Permissions,
  type RESTPatchAPIInteractionOriginalResponseJSONBody,
  type RESTPostAPIInteractionFollowupJSONBody,
  type Snowflake,
} from '@vestra/types'
import { Base } from './Base.js'
import type { RestCapable } from './capabilities.js'
import { GuildMember } from './GuildMember.js'
import { Message } from './Message.js'
import { User } from './User.js'
import { snowflakeDate, snowflakeTimestamp } from './snowflake.js'

/**
 * A command invocation: a slash command, or a user or message context-menu command.
 *
 * @remarks
 * What {@link Interaction.isCommand} narrows to. An interface rather than a subclass, the
 * same trick {@link CompleteMessage} uses and for the same reason: four subclasses would
 * give the hot path four hidden shapes to be polymorphic over, where one class with a
 * `type` discriminant and four narrowing predicates costs one.
 */
export interface CommandInteraction<Client = unknown> extends Interaction<Client> {
  readonly type: typeof InteractionType.ApplicationCommand
  readonly data: APIApplicationCommandInteractionData
}

/**
 * A user typing into an autocomplete-enabled command option.
 *
 * @remarks
 * Carries the same `data` as a {@link CommandInteraction} — only `type` tells the two apart
 * — and the options are deliberately partial: the ones the user has not reached yet are
 * absent even when the command marks them required, and the one being typed carries
 * `focused`.
 *
 * The only valid answer is an `ApplicationCommandAutocompleteResult`, which
 * {@link Interaction.respond} sends. {@link Interaction.reply} on one of these is a 400,
 * and so is deferring: Discord gives autocomplete no loading state.
 */
export interface AutocompleteInteraction<Client = unknown> extends Interaction<Client> {
  readonly type: typeof InteractionType.ApplicationCommandAutocomplete
  readonly data: APIApplicationCommandInteractionData
}

/**
 * A button press or a select-menu use.
 *
 * @remarks
 * `message` is narrowed to present because Discord always sends the message the component
 * was attached to — that is how a component handler recovers the state it rendered.
 */
export interface ComponentInteraction<Client = unknown> extends Interaction<Client> {
  readonly type: typeof InteractionType.MessageComponent
  readonly data: APIMessageComponentInteractionData
  readonly message: Message<Client>
}

/**
 * A submitted modal.
 *
 * @remarks
 * `message` is present only when the modal was opened by a component, not by a command.
 */
export interface ModalSubmitInteraction<Client = unknown> extends Interaction<Client> {
  readonly type: typeof InteractionType.ModalSubmit
  readonly data: APIModalSubmitInteractionData
}

/**
 * An invocation an application has been asked to respond to.
 *
 * @remarks
 * **Three seconds, once.** Discord gives an application three seconds to acknowledge an
 * interaction. Miss it and the user is shown "this interaction failed", the token is spent,
 * and nothing recovers it — no retry, no later reply, no way to tell the user what happened.
 * That deadline, rather than the payload, is what shapes this class:
 *
 * - {@link Interaction.reply} answers immediately, and may be called **once**. A second call
 *   is a 400, because the initial response is a single slot.
 * - {@link Interaction.deferReply} is what anything slower calls **first**. It acknowledges
 *   inside the deadline and shows the user a loading state, which buys fifteen minutes for
 *   {@link Interaction.editReply} to deliver the real answer. Any handler that awaits a
 *   database, an HTTP call, or anything else it does not control should defer before it
 *   starts, not after it finishes — three seconds is a budget for the whole handler, not for
 *   the last statement in it.
 * - {@link Interaction.followUp} sends further messages while the token lives, which is
 *   fifteen minutes from the interaction rather than from the defer.
 *
 * **The invoking user is always {@link Interaction.user}.** On the wire it is `member.user`
 * in a guild and `user` in a DM, never both, so reaching straight for the payload's `user`
 * yields `undefined` for every guild interaction — which is most of them. This mirrors
 * whichever one arrived into one field, and leaves {@link Interaction.member} for the guild
 * membership itself.
 *
 * **`data` is held by reference and stays `snake_case`.** It is the one nested payload here
 * that §4.15 does not convert: the shape depends on `type`, and expressing it as structures
 * means an option resolver, a component-value model and a modal-submission tree — three
 * designs that belong in their own change. The predicates narrow it to the right payload
 * type, so it is typed rather than raw, and the field spelling says plainly that it came off
 * the wire untouched.
 *
 * **No `patch`, and no cache scope.** An interaction is an event, not an entity: Discord
 * never sends a second payload for the same one, and holding them would be holding a growing
 * pile of spent tokens. `id` and `token` are all the response routes need, so nothing has to
 * be looked up later.
 *
 * Three payload fields are deliberately not mirrored. `guild` is a partial guild whose fields
 * Discord does not enumerate, and {@link Interaction.guildId} carries the only part of it that
 * can be relied on; `channel` is the same story against {@link Interaction.channelId}; and
 * `version` is documented as always `1`. `entitlements` is kept, by reference, because premium
 * gating has to be decided without a second request.
 */
export class Interaction<Client = unknown> extends Base<Client> {
  /** The interaction's ID, which {@link Interaction.reply} responds against. */
  declare readonly id: Snowflake
  /**
   * The application this interaction is for.
   *
   * @remarks
   * Every route after the initial response is a webhook route keyed by this and the token,
   * which is why it is mirrored rather than read from the client: a followup must work on a
   * structure built before `READY` ever landed.
   */
  declare readonly applicationId: Snowflake
  /** Which kind of interaction this is. The discriminant the predicates narrow on. */
  declare readonly type: InteractionType
  /**
   * The type-specific payload, held by reference and so still `snake_case`.
   *
   * @remarks
   * Narrow it with a predicate rather than probing for keys: a command and an autocomplete
   * carry the same shape, and only `type` tells them apart. Absent only on a `Ping`, which
   * never arrives over the gateway.
   */
  declare readonly data: APIInteractionData | undefined
  /** The guild it was invoked in, absent in a direct message. */
  declare readonly guildId: Snowflake | undefined
  /**
   * The channel it was invoked in.
   *
   * @remarks
   * Optional on the payload, and in practice always sent for the four gateway interaction
   * types. Modelled as Discord documents it rather than as it behaves.
   */
  declare readonly channelId: Snowflake | undefined
  /**
   * The invoking user's guild membership, absent outside a guild.
   *
   * @remarks
   * Carries `permissions` computed for the invoking channel, which the member on a message
   * does not — this is the cheapest correct answer to "may this user do that here".
   */
  declare readonly member: GuildMember<Client> | undefined
  /**
   * The invoking user, wherever the interaction came from.
   *
   * @remarks
   * The same object as `member.user` in a guild rather than a second copy of it, so identity
   * comparisons hold. `undefined` only on a payload carrying neither, which Discord does not
   * send for any gateway interaction type.
   */
  declare readonly user: User<Client> | undefined
  /**
   * The continuation token that authorises every response.
   *
   * @remarks
   * A credential. It is valid for fifteen minutes and it is the only thing Discord checks on
   * the response routes, so it must not be logged or handed to anything that logs.
   */
  declare readonly token: string
  /** The message a component, or a modal opened by a component, was attached to. */
  declare readonly message: Message<Client> | undefined
  /**
   * The permissions the **application** holds where the interaction happened.
   *
   * @remarks
   * Not the invoking user's — {@link Interaction.member} carries those. Worth checking
   * before assuming a reply with a file or an embed will be accepted.
   */
  declare readonly appPermissions: Permissions
  /** The invoking user's locale, as a Discord tag such as `en-US`. */
  declare readonly locale: string | undefined
  /** The guild's preferred locale, sent only for a guild interaction. */
  declare readonly guildLocale: string | undefined
  /**
   * The invoking user's entitlements to the application's premium SKUs, held by reference.
   *
   * @remarks
   * Always sent, empty when there are none, so premium gating needs no second request.
   */
  declare readonly entitlements: readonly APIEntitlement[]
  /**
   * Which installation contexts authorised this interaction, mapped to the owning ID.
   *
   * @remarks
   * Held by reference; its keys are stringified {@link ApplicationIntegrationType} values
   * rather than payload field names, so there is nothing to convert. Under `"1"` the value
   * is the ID of the user who installed the application, which is not necessarily the user
   * who triggered this interaction.
   */
  declare readonly authorizingIntegrationOwners: Readonly<
    Partial<Record<`${ApplicationIntegrationType}`, Snowflake>>
  >
  /** Where the interaction was triggered from. */
  declare readonly context: InteractionContextType | undefined
  /** The largest file, in bytes, a response to this interaction may carry. */
  declare readonly attachmentSizeLimit: number

  /**
   * @param data - The payload to mirror.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIInteraction, client: Client) {
    super(client)

    // Every field, unconditionally, in a fixed order — the shape rule from CONTRIBUTING.
    this.id = data.id
    this.applicationId = data.application_id
    this.type = data.type
    this.data = data.data
    this.guildId = data.guild_id
    this.channelId = data.channel_id
    this.member =
      data.member === undefined || data.guild_id === undefined || data.member.user === undefined
        ? undefined
        : new GuildMember(data.member, data.guild_id, data.member.user.id, client)
    // Reuses the member's user rather than building a second one: same object, one allocation.
    this.user =
      this.member?.user ?? (data.user === undefined ? undefined : new User(data.user, client))
    this.token = data.token
    this.message = data.message === undefined ? undefined : new Message(data.message, client)
    this.appPermissions = data.app_permissions
    this.locale = data.locale
    this.guildLocale = data.guild_locale
    this.entitlements = data.entitlements
    this.authorizingIntegrationOwners = data.authorizing_integration_owners
    this.context = data.context
    this.attachmentSizeLimit = data.attachment_size_limit
  }

  /** When the interaction was created, in epoch milliseconds. */
  get createdTimestamp(): number {
    return snowflakeTimestamp(this.id)
  }

  /** When the interaction was created. Allocates. */
  get createdAt(): Date {
    return snowflakeDate(this.id)
  }

  /**
   * Whether a command was invoked.
   *
   * @returns Whether this is an application command interaction.
   *
   * @remarks
   * Written against `type` rather than `instanceof`, like the channel predicates: there is
   * one class here, so `instanceof` could not answer this at all, and `type` is what the
   * payload actually says.
   */
  isCommand(): this is CommandInteraction<Client> {
    return this.type === InteractionType.ApplicationCommand
  }

  /**
   * Whether a user is typing into an autocomplete option.
   *
   * @returns Whether this is an autocomplete interaction.
   */
  isAutocomplete(): this is AutocompleteInteraction<Client> {
    return this.type === InteractionType.ApplicationCommandAutocomplete
  }

  /**
   * Whether a message component was used.
   *
   * @returns Whether this is a message component interaction.
   */
  isComponent(): this is ComponentInteraction<Client> {
    return this.type === InteractionType.MessageComponent
  }

  /**
   * Whether a modal was submitted.
   *
   * @returns Whether this is a modal submit interaction.
   */
  isModalSubmit(): this is ModalSubmitInteraction<Client> {
    return this.type === InteractionType.ModalSubmit
  }

  /**
   * Sends any interaction response.
   *
   * @param this - A structure whose client can reach REST.
   * @param response - The response, discriminated on its `type`.
   * @param options - Request options, such as an abort signal.
   *
   * @remarks
   * The primitive the other response methods are spelled in terms of, and the way to send
   * the ones they do not name — a modal, an autocomplete result, or a component's
   * `UpdateMessage`. The union makes the wrong pairing a compile error rather than a 400.
   *
   * Subject to the three-second deadline and the single-slot rule like every initial
   * response.
   */
  async respond<C extends RestCapable>(
    this: Interaction<C>,
    response: APIInteractionResponse,
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    await this.client.rest.interactions.reply(this.id, this.token, response, options)
  }

  /**
   * Replies to the interaction.
   *
   * @param this - A structure whose client can reach REST.
   * @param body - What to send.
   * @param options - Request options, such as an abort signal.
   *
   * @remarks
   * **Once, within three seconds.** Anything that cannot promise both calls
   * {@link Interaction.deferReply} instead and finishes with
   * {@link Interaction.editReply}.
   *
   * Returns nothing, unlike {@link Message.send}. Discord's callback route answers with an
   * empty body, so the sent message is not something this can hand back without a second
   * request — {@link Interaction.fetchReply} is that request, made only when it is wanted.
   *
   * `flags: MessageFlags.Ephemeral` is the one field with no meaning on an ordinary message:
   * it shows the reply to the invoking user alone, and cannot be undone later.
   */
  async reply<C extends RestCapable>(
    this: Interaction<C>,
    body: APIInteractionCallbackData,
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    await this.respond(
      { type: InteractionResponseType.ChannelMessageWithSource, data: body },
      options,
    )
  }

  /**
   * Acknowledges the interaction now and answers it later.
   *
   * @param this - A structure whose client can reach REST.
   * @param body - Response flags — `MessageFlags.Ephemeral` to keep the eventual reply
   * private, which cannot be decided afterwards.
   * @param options - Request options, such as an abort signal.
   *
   * @remarks
   * **This is the method that exists because of the deadline.** Discord shows the user
   * "this interaction failed" three seconds after an interaction nothing has answered, and
   * the token is then spent — so a handler that fetches, queries or waits on anything must
   * acknowledge before it starts rather than after it finishes. The user sees a loading
   * state, and the real answer goes out through {@link Interaction.editReply} within fifteen
   * minutes.
   *
   * Ephemerality is fixed here, not at the edit: the loading state the user sees is already
   * public or already private.
   *
   * A component that would rather not show a loading state at all — because it is going to
   * edit the message the component is on — sends `DeferredMessageUpdate` through
   * {@link Interaction.respond} instead.
   */
  async deferReply<C extends RestCapable>(
    this: Interaction<C>,
    body: Pick<APIInteractionCallbackData, 'flags'> = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    await this.respond(
      { type: InteractionResponseType.DeferredChannelMessageWithSource, data: body },
      options,
    )
  }

  /**
   * Fetches the message sent by {@link Interaction.reply}.
   *
   * @param this - A structure whose client can reach REST.
   * @param options - Request options, such as an abort signal.
   * @returns The reply, as a structure.
   *
   * @remarks
   * A request rather than a cached read: the callback route returns an empty body, so this
   * message is the one message a bot sends that it does not get back.
   */
  async fetchReply<C extends RestCapable>(
    this: Interaction<C>,
    options: { signal?: AbortSignal } = {},
  ): Promise<Message<C>> {
    const message = await this.client.rest.interactions.getReply(
      this.applicationId,
      this.token,
      options,
    )
    return new Message(message, this.client)
  }

  /**
   * Edits the reply, which is how a deferred interaction is completed.
   *
   * @param this - A structure whose client can reach REST.
   * @param body - The fields to change.
   * @param options - Request options, such as an abort signal.
   * @returns The edited message.
   *
   * @remarks
   * Valid for fifteen minutes from the interaction, not from the defer — a handler that
   * spends twelve minutes working has three left to say so.
   */
  async editReply<C extends RestCapable>(
    this: Interaction<C>,
    body: RESTPatchAPIInteractionOriginalResponseJSONBody,
    options: { signal?: AbortSignal } = {},
  ): Promise<Message<C>> {
    const message = await this.client.rest.interactions.editReply(
      this.applicationId,
      this.token,
      body,
      options,
    )
    return new Message(message, this.client)
  }

  /**
   * Deletes the reply.
   *
   * @param this - A structure whose client can reach REST.
   * @param options - Request options, such as an abort signal.
   *
   * @remarks
   * The interaction stays answered — this removes the message, it does not free the response
   * slot, and {@link Interaction.reply} still cannot be called a second time.
   */
  async deleteReply<C extends RestCapable>(
    this: Interaction<C>,
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    await this.client.rest.interactions.deleteReply(this.applicationId, this.token, options)
  }

  /**
   * Sends an additional message for this interaction.
   *
   * @param this - A structure whose client can reach REST.
   * @param body - What to send.
   * @param options - Request options, such as an abort signal.
   * @returns The message that was sent.
   *
   * @remarks
   * Needs the interaction to have been answered first — a followup before a reply or a defer
   * is a 404, because the webhook it executes against does not exist until then. Any number
   * may be sent while the token is valid.
   */
  async followUp<C extends RestCapable>(
    this: Interaction<C>,
    body: RESTPostAPIInteractionFollowupJSONBody,
    options: { signal?: AbortSignal } = {},
  ): Promise<Message<C>> {
    const message = await this.client.rest.interactions.followUp(
      this.applicationId,
      this.token,
      body,
      options,
    )
    return new Message(message, this.client)
  }
}
