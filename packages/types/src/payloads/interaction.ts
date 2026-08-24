import type {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  InteractionContextType,
  InteractionType,
} from '../enums/interaction.js'
import type { ComponentType } from '../enums/component.js'
import type { Permissions, Snowflake } from '../globals.js'
import type { APIAttachment } from './attachment.js'
import type { APIChannelPartial } from './channel.js'
import type { APIEntitlement } from './monetisation.js'
import type { APIGuildMember, APIGuildMemberPartial } from './member.js'
import type { APIGuildPartial } from './guild.js'
import type { APIMessage } from './message.js'
import type { APIRole } from './role.js'
import type { APIUser } from './user.js'

/**
 * An interaction: what an application receives when someone invokes a command, uses a
 * component or submits a modal.
 *
 * @remarks
 * The same object arrives either through the `INTERACTION_CREATE` gateway event or as an
 * HTTP request to a configured interactions endpoint URL. The two delivery routes are
 * mutually exclusive per application and the shape does not differ between them.
 */

/**
 * An invocation an application has been asked to respond to.
 *
 * @remarks
 * `member` and `user` are the pair worth reading twice. Discord sends `member` when the
 * interaction was invoked in a guild and `user` when it was invoked in a DM — never both.
 * The guild case still carries the invoking user, but nested at `member.user`, so the only
 * expression that finds it in every case is `interaction.member?.user ?? interaction.user`.
 * Reaching straight for `interaction.user` silently yields `undefined` for every guild
 * interaction, which is most of them.
 *
 * A response is due within three seconds; `token` is what authorises it, and stays valid
 * for fifteen minutes of follow-ups after that.
 */
export interface APIInteraction {
  /** The interaction's ID. */
  id: Snowflake
  /** The ID of the application this interaction is for. */
  application_id: Snowflake
  /** What kind of interaction this is, and so which member of `data` arrived. */
  type: InteractionType
  /**
   * The type-specific payload.
   *
   * @remarks
   * Present on every interaction type except `Ping`. Discord marks it optional only to
   * leave room for a future type that carries nothing, so an absent `data` on a known
   * type is a protocol change rather than a case to handle.
   */
  data?: APIInteractionData
  /**
   * The guild the interaction was invoked in.
   *
   * @remarks
   * Discord documents this as a partial guild without saying which fields survive, so
   * everything but the ID is modelled as optional. `guild_id` carries the same ID and is
   * the field to branch on when all that is needed is whether this came from a guild.
   */
  guild?: Partial<APIGuildPartial> & Pick<APIGuildPartial, 'id'>
  /** The ID of the guild the interaction was invoked in. */
  guild_id?: Snowflake
  /**
   * The channel the interaction was invoked in.
   *
   * @remarks
   * Carries more than the two guaranteed fields in practice — Discord enumerates the
   * extras only for `resolved` channels, never for this one — so read it defensively.
   */
  channel?: APIChannelPartial
  /** The ID of the channel the interaction was invoked in. */
  channel_id?: Snowflake
  /**
   * The invoking user's guild membership, sent when the interaction came from a guild.
   *
   * @remarks
   * Unlike the member embedded in a message, this one has `user` populated, and it also
   * carries `permissions` computed for the invoking channel. Mutually exclusive with
   * `user` below.
   */
  member?: APIGuildMember
  /** The invoking user, sent instead of `member` when the interaction came from a DM. */
  user?: APIUser
  /** The continuation token used to respond to and follow up on this interaction. */
  token: string
  /** Read-only, always `1`. */
  version: number
  /**
   * The message a component, or a modal opened by a component, was attached to.
   *
   * @remarks
   * This is how a component handler recovers the state it rendered. Absent for command
   * interactions, and absent for a modal opened from a command rather than a component.
   */
  message?: APIMessage
  /**
   * The permissions the application itself holds where the interaction happened.
   *
   * @remarks
   * These are the application's permissions, not the invoking user's — check them before
   * assuming a reply carrying a file or an embed will be accepted. In a DM or group DM
   * with another user Discord synthesises `ATTACH_FILES`, `EMBED_LINKS` and
   * `MENTION_EVERYONE`; in a DM with the application's own bot user it adds
   * `USE_EXTERNAL_EMOJIS`.
   */
  app_permissions: Permissions
  /**
   * The invoking user's selected language, as a Discord locale tag such as `en-US`.
   *
   * @remarks
   * Sent on every interaction type except `Ping`. Left as `string` rather than a union of
   * known tags, which Discord extends without notice.
   */
  locale?: string
  /** The guild's preferred locale, sent when the interaction came from a guild. */
  guild_locale?: string
  /**
   * The invoking user's entitlements to the application's premium SKUs.
   *
   * @remarks
   * Always sent, as an empty array when there are none, so premium gating can be decided
   * without a second request.
   */
  entitlements: APIEntitlement[]
  /**
   * Which installation contexts authorised this interaction, mapped to the owning ID.
   *
   * @remarks
   * Keys are {@link ApplicationIntegrationType} values stringified, since JSON object keys
   * are always strings. A key appears only when the application is installed in that
   * context and the interaction is supported there, which is why every entry is optional.
   *
   * Under `"0"` the value is the guild's ID, or `"0"` itself when the interaction came from
   * a DM with the application's bot user. Under `"1"` it is the ID of the user who
   * installed the application — not necessarily the user who triggered this interaction,
   * which is the distinction the field exists to draw.
   */
  authorizing_integration_owners: Partial<Record<`${ApplicationIntegrationType}`, Snowflake>>
  /** Where the interaction was triggered from. */
  context?: InteractionContextType
  /** The maximum size, in bytes, of a file the application may attach to its response. */
  attachment_size_limit: number
}

/**
 * The `data` payload of an interaction.
 *
 * @remarks
 * Narrow this by the interaction's `type`, not by probing for keys: a command and an
 * autocomplete both carry {@link APIApplicationCommandInteractionData}, and only `type`
 * tells them apart.
 */
export type APIInteractionData =
  | APIApplicationCommandInteractionData
  | APIMessageComponentInteractionData
  | APIModalSubmitInteractionData

/**
 * The data of an `ApplicationCommand` or `ApplicationCommandAutocomplete` interaction.
 */
export interface APIApplicationCommandInteractionData {
  /** The ID of the invoked command. */
  id: Snowflake
  /** The name of the invoked command. */
  name: string
  /** The type of the invoked command. */
  type: ApplicationCommandType
  /** The objects referred to by the command's options, keyed by ID. */
  resolved?: APIInteractionResolvedData
  /**
   * The options the user supplied.
   *
   * @remarks
   * On an `ApplicationCommandAutocomplete` interaction this is partial by design: options
   * the user has not reached yet are absent even when the command marks them required, and
   * the one being typed carries `focused`.
   */
  options?: APIApplicationCommandInteractionDataOption[]
  /** The ID of the guild the command is registered to. */
  guild_id?: Snowflake
  /**
   * The ID of the user or message a context menu command was invoked on.
   *
   * @remarks
   * The target itself is in `resolved` — under `users` and `members` for a user command,
   * under `messages` for a message command. Absent for slash commands.
   */
  target_id?: Snowflake
}

/**
 * The data of a `MessageComponent` interaction.
 */
export interface APIMessageComponentInteractionData {
  /** The `custom_id` the application gave the component when it rendered it. */
  custom_id: string
  /** The type of component that was used. */
  component_type: ComponentType
  /**
   * What the user selected. Always present for a select menu, absent for anything else.
   *
   * @remarks
   * For a string select these are the developer-defined option values; for a user, role,
   * mentionable or channel select they are snowflakes, and the objects behind them are in
   * `resolved`.
   */
  values?: string[]
  /** The objects behind the selected values, keyed by ID. */
  resolved?: APIInteractionResolvedData
}

/**
 * The data of a `ModalSubmit` interaction.
 */
export interface APIModalSubmitInteractionData {
  /** The `custom_id` the application gave the modal when it opened it. */
  custom_id: string
  /** What the user submitted, in the order the modal declared it. */
  components: APIModalSubmitComponent[]
  /** The objects behind the submitted values, keyed by ID. */
  resolved?: APIInteractionResolvedData
}

/**
 * One option supplied to a command, or one level of subcommand nesting above it.
 *
 * @remarks
 * `value` and `options` are mutually exclusive. A `Subcommand` or `SubcommandGroup` option
 * carries `options` and no `value`; every other type carries `value` and no `options`.
 * Reaching the arguments of a grouped subcommand therefore means descending two levels of
 * this structure rather than reading the top-level array.
 */
export interface APIApplicationCommandInteractionDataOption {
  /** The parameter's name, or the subcommand or group's name. */
  name: string
  /** The option's type, which decides whether `value` or `options` is populated. */
  type: ApplicationCommandOptionType
  /**
   * The value the user supplied.
   *
   * @remarks
   * A `string` for string options and for every snowflake-valued option — users, channels,
   * roles, mentionables and attachments all arrive as ID strings — a `number` for integer
   * and number options, a `boolean` for boolean options.
   */
  value?: string | number | boolean
  /** The nested options, present when this option is a subcommand or a group. */
  options?: APIApplicationCommandInteractionDataOption[]
  /**
   * Whether this is the option the user is currently typing into.
   *
   * @remarks
   * Only ever sent on an `ApplicationCommandAutocomplete` interaction, and only on the one
   * focused option. Absent, rather than `false`, on the others.
   */
  focused?: boolean
}

/**
 * The objects an interaction refers to, keyed by ID.
 *
 * @remarks
 * Deliberately not {@link APIMessageResolvedData}, which is the smaller shape a message
 * carries for auto-populated select menus. That one has no `messages` or `attachments`, and
 * spells its maps as nullable as well as optional, where Discord documents an interaction's
 * maps as only optional. The two are close enough to confuse and different enough to
 * matter, so they stay separate.
 *
 * Wherever a member appears here, its user appears in `users` under the same ID.
 */
export interface APIInteractionResolvedData {
  /** The users the interaction refers to. */
  users?: Record<Snowflake, APIUser>
  /**
   * The guild memberships the interaction refers to.
   *
   * @remarks
   * These lack `user`, `deaf` and `mute`. The user is in `users` under the same ID.
   */
  members?: Record<Snowflake, Omit<APIGuildMemberPartial, 'deaf' | 'mute'>>
  /** The roles the interaction refers to. */
  roles?: Record<Snowflake, APIRole>
  /** The channels the interaction refers to, in their reduced form. */
  channels?: Record<Snowflake, APIChannelPartial>
  /**
   * The messages the interaction refers to.
   *
   * @remarks
   * Discord documents these only as partial messages without saying what is dropped, so
   * nothing beyond the ID — which is also the map key — can be relied on.
   */
  messages?: Record<Snowflake, Partial<APIMessage> & Pick<APIMessage, 'id'>>
  /** The attachments the interaction refers to, including files uploaded through a modal. */
  attachments?: Record<Snowflake, APIAttachment>
}

/**
 * A top-level entry in a submitted modal.
 *
 * @remarks
 * These are submission shapes, not the definitions the application sent: a text input comes
 * back as its `value` with none of the style or length fields, and a label comes back
 * without its text. Match a submitted component to the one that was rendered by `custom_id`
 * or by `id`, never by position.
 */
export type APIModalSubmitComponent = APIModalSubmitLabel | APIModalSubmitTextDisplay

/**
 * A submitted label, which is the wrapper every interactive modal component sits in.
 */
export interface APIModalSubmitLabel {
  /** Always {@link ComponentType.Label}. */
  type: typeof ComponentType.Label
  /** The component's identifier, generated by Discord when the modal was opened. */
  id: number
  /** The component the label wrapped. */
  component: APIModalSubmitLabelComponent
}

/**
 * A submitted text display.
 *
 * @remarks
 * Present so that the submission mirrors the modal's structure. It collects no input, so it
 * comes back with nothing but its identity.
 */
export interface APIModalSubmitTextDisplay {
  /** Always {@link ComponentType.TextDisplay}. */
  type: typeof ComponentType.TextDisplay
  /** The component's identifier, generated by Discord when the modal was opened. */
  id: number
}

/**
 * Anything a submitted label can be wrapped around.
 */
export type APIModalSubmitLabelComponent =
  | APIModalSubmitChannelSelect
  | APIModalSubmitCheckbox
  | APIModalSubmitCheckboxGroup
  | APIModalSubmitFileUpload
  | APIModalSubmitMentionableSelect
  | APIModalSubmitRadioGroup
  | APIModalSubmitRoleSelect
  | APIModalSubmitStringSelect
  | APIModalSubmitTextInput
  | APIModalSubmitUserSelect

/**
 * A submitted text input.
 */
export interface APIModalSubmitTextInput {
  /** Always {@link ComponentType.TextInput}. */
  type: typeof ComponentType.TextInput
  /** The component's identifier, generated by Discord when the modal was opened. */
  id: number
  /** The `custom_id` the application gave the input. */
  custom_id: string
  /** The text the user typed. */
  value: string
}

/**
 * A submitted string select.
 */
export interface APIModalSubmitStringSelect {
  /** Always {@link ComponentType.StringSelect}. */
  type: typeof ComponentType.StringSelect
  /** The component's identifier, generated by Discord when the modal was opened. */
  id: number
  /** The `custom_id` the application gave the select. */
  custom_id: string
  /** The developer-defined values of the chosen options. */
  values: string[]
}

/**
 * The shape shared by the four selects that resolve to Discord objects.
 *
 * @remarks
 * Unlike a string select these carry `resolved`, so the chosen objects need no lookup
 * against the interaction's own resolved data.
 */
export interface APIModalSubmitEntitySelectBase<Type extends ComponentType> {
  /** Which select this is. */
  type: Type
  /** The component's identifier, generated by Discord when the modal was opened. */
  id: number
  /** The `custom_id` the application gave the select. */
  custom_id: string
  /** The objects behind `values`, keyed by ID. */
  resolved: APIInteractionResolvedData
  /** The IDs of the chosen objects. */
  values: Snowflake[]
}

/**
 * A submitted user select.
 */
export type APIModalSubmitUserSelect = APIModalSubmitEntitySelectBase<
  typeof ComponentType.UserSelect
>

/**
 * A submitted role select.
 */
export type APIModalSubmitRoleSelect = APIModalSubmitEntitySelectBase<
  typeof ComponentType.RoleSelect
>

/**
 * A submitted mentionable select, whose values may be user or role IDs.
 */
export type APIModalSubmitMentionableSelect = APIModalSubmitEntitySelectBase<
  typeof ComponentType.MentionableSelect
>

/**
 * A submitted channel select.
 */
export type APIModalSubmitChannelSelect = APIModalSubmitEntitySelectBase<
  typeof ComponentType.ChannelSelect
>

/**
 * A submitted file upload.
 */
export interface APIModalSubmitFileUpload {
  /** Always {@link ComponentType.FileUpload}. */
  type: typeof ComponentType.FileUpload
  /** The component's identifier, generated by Discord when the modal was opened. */
  id: number
  /** The `custom_id` the application gave the upload. */
  custom_id: string
  /**
   * The IDs of the uploaded files.
   *
   * @remarks
   * The files themselves are in the interaction's `resolved.attachments`, not here.
   */
  values: Snowflake[]
}

/**
 * A submitted radio group.
 */
export interface APIModalSubmitRadioGroup {
  /** Always {@link ComponentType.RadioGroup}. */
  type: typeof ComponentType.RadioGroup
  /** The component's identifier, generated by Discord when the modal was opened. */
  id: number
  /** The `custom_id` the application gave the group. */
  custom_id: string
  /** The value of the chosen option, or `null` if the user chose none. */
  value: string | null
}

/**
 * A submitted checkbox group.
 */
export interface APIModalSubmitCheckboxGroup {
  /** Always {@link ComponentType.CheckboxGroup}. */
  type: typeof ComponentType.CheckboxGroup
  /** The component's identifier, generated by Discord when the modal was opened. */
  id: number
  /** The `custom_id` the application gave the group. */
  custom_id: string
  /** The values of the ticked options, empty when the user ticked none. */
  values: string[]
}

/**
 * A submitted checkbox.
 */
export interface APIModalSubmitCheckbox {
  /** Always {@link ComponentType.Checkbox}. */
  type: typeof ComponentType.Checkbox
  /** The component's identifier, generated by Discord when the modal was opened. */
  id: number
  /** The `custom_id` the application gave the checkbox. */
  custom_id: string
  /** Whether the box is ticked. */
  value: boolean
}
