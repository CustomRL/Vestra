import type { ChannelType } from '../enums/channel.js'
import type {
  ApplicationCommandOptionType,
  ApplicationCommandPermissionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  InteractionContextType,
} from '../enums/interaction.js'
import type { Permissions, Snowflake } from '../globals.js'

/**
 * A command an application registers with Discord, and the per-guild overwrites that
 * decide who may use it.
 */

/**
 * A localisation dictionary, keyed by locale tag.
 *
 * @remarks
 * Keys are Discord's locale tags — `en-US`, `es-419`, `zh-CN`. They are left as `string`
 * rather than a union because the set is a documentation table Discord grows without
 * notice, and a stale union would reject a locale the API accepts.
 *
 * A locale absent from the dictionary falls back to the unlocalised `name` or
 * `description`, so a partial dictionary is normal rather than a mistake.
 */
export type APILocalizationMap = Record<string, string>

/**
 * A registered application command.
 *
 * @remarks
 * Which fields are meaningful depends on `type`: `options` only applies to `ChatInput`
 * commands, and `handler` only to `PrimaryEntryPoint` commands belonging to an application
 * with an Activity. Discord omits them elsewhere rather than sending empty values.
 */
export interface APIApplicationCommand {
  /** The command's ID. */
  id: Snowflake
  /**
   * What kind of command this is.
   *
   * @remarks
   * Documented as optional, defaulting to {@link ApplicationCommandType.ChatInput}, because
   * it may be omitted when *creating* a command. Discord's own response schema marks it
   * required, so every command read back from the API carries it.
   */
  type?: ApplicationCommandType
  /** The ID of the application the command belongs to. */
  application_id: Snowflake
  /** The guild the command is registered to, absent on a globally-scoped command. */
  guild_id?: Snowflake
  /**
   * The command's name, 1-32 characters.
   *
   * @remarks
   * `ChatInput` names are restricted to letters, digits, hyphens, underscores and
   * apostrophes, and must be lowercase wherever a lowercase variant of the character
   * exists. `User` and `Message` names are free to be mixed case and to contain spaces.
   */
  name: string
  /**
   * Localised forms of `name`.
   *
   * @remarks
   * Optional *and* nullable, and the two mean different things: absent means the endpoint
   * did not return dictionaries at all, `null` means the command has no localisations. The
   * batch `GET` endpoints omit this by default and send `name_localized` instead unless
   * `with_localizations=true` is passed.
   */
  name_localizations?: APILocalizationMap | null
  /**
   * The command's name in the requester's locale.
   *
   * @remarks
   * Only sent by the endpoints that suppress `name_localizations`, and only when the
   * requester's locale is actually present in the dictionary. The locale is taken from the
   * `X-Discord-Locale` header, then `Accept-Language`, then the user's settings.
   */
  name_localized?: string
  /**
   * The command's description, 1-100 characters.
   *
   * @remarks
   * Always present, but an empty string on `User` and `Message` commands, which have no
   * description to show.
   */
  description: string
  /**
   * Localised forms of `description`.
   *
   * @remarks
   * Optional and nullable on the same terms as `name_localizations`.
   */
  description_localizations?: APILocalizationMap | null
  /**
   * The command's description in the requester's locale.
   *
   * @remarks
   * Sent on the same terms as `name_localized`.
   */
  description_localized?: string
  /** The command's parameters, up to 25. Only ever set on `ChatInput` commands. */
  options?: APIApplicationCommandOption[]
  /**
   * The permissions a member must hold to use the command by default, as a bit set.
   *
   * @remarks
   * Always sent and nullable rather than optional: `null` is "no permission requirement",
   * which is distinct from `"0"`, which locks the command to administrators until a guild
   * adds an explicit overwrite.
   */
  default_member_permissions: Permissions | null
  /**
   * Whether the command may be used in DMs with the application. Only ever applied to
   * globally-scoped commands.
   *
   * @deprecated
   * Superseded by `contexts`; include {@link InteractionContextType.BotDM} there instead.
   */
  dm_permission?: boolean
  /**
   * Whether the command is enabled for everyone when the application joins a guild.
   *
   * @deprecated
   * Discord flags this for removal and no longer carries it in its published response
   * schema, though the field table still documents it. Setting `default_member_permissions`
   * to `"0"` is the replacement for disabling a command by default. Nullable as well as
   * optional.
   */
  default_permission?: boolean | null
  /** Whether the command is age-restricted, hiding it outside age-restricted surfaces. */
  nsfw?: boolean
  /**
   * The installation contexts the command is available in.
   *
   * @remarks
   * Only applied to globally-scoped commands; a guild command is reachable wherever the
   * guild is. Absent means the command inherits the application's configured contexts.
   */
  integration_types?: ApplicationIntegrationType[]
  /**
   * The client surfaces the command can be used from.
   *
   * @remarks
   * Only applied to globally-scoped commands. {@link InteractionContextType.PrivateChannel}
   * is only meaningful when `integration_types` includes
   * {@link ApplicationIntegrationType.UserInstall}, since a guild-installed command cannot
   * reach a channel the application was never added to.
   *
   * Nullable as well as optional.
   */
  contexts?: InteractionContextType[] | null
  /**
   * An autoincrementing identifier bumped whenever the command record changes materially.
   *
   * @remarks
   * A snowflake, so it doubles as the time of the last substantial edit.
   */
  version: Snowflake
  /**
   * Who handles the interaction for a `PrimaryEntryPoint` command.
   *
   * @remarks
   * `1` is `APP_HANDLER` — the application answers using the interaction token. `2` is
   * `DISCORD_LAUNCH_ACTIVITY` — Discord launches the Activity and posts a follow-up itself,
   * without coordinating with the application.
   *
   * Only settable on `PrimaryEntryPoint` commands of applications carrying the `EMBEDDED`
   * flag, meaning applications that have an Activity.
   */
  handler?: number
}

/**
 * A parameter of a `ChatInput` command, or a subcommand of one.
 *
 * @remarks
 * One shape covers every option type, so most fields below apply only to some values of
 * `type`; each says which. Required options must be listed before optional ones, and
 * `name` must be unique within its array.
 */
export interface APIApplicationCommandOption {
  /** What kind of option this is. */
  type: ApplicationCommandOptionType
  /** The option's name, 1-32 characters, under the same rules as a `ChatInput` command name. */
  name: string
  /** Localised forms of `name`, optional and nullable on the same terms as on the command. */
  name_localizations?: APILocalizationMap | null
  /** The option's name in the requester's locale, on the same terms as on the command. */
  name_localized?: string
  /** The option's description, 1-100 characters. */
  description: string
  /** Localised forms of `description`, optional and nullable. */
  description_localizations?: APILocalizationMap | null
  /** The option's description in the requester's locale. */
  description_localized?: string
  /**
   * Whether the user must supply the option. Defaults to `false`.
   *
   * @remarks
   * Not applicable to `Subcommand` and `SubcommandGroup` options.
   */
  required?: boolean
  /**
   * The values the user may pick from, up to 25.
   *
   * @remarks
   * Only for `String`, `Integer` and `Number` options, and mutually exclusive with
   * `autocomplete`. Where choices are given they are the only accepted values.
   */
  choices?: APIApplicationCommandOptionChoice[]
  /**
   * The nested options, up to 25.
   *
   * @remarks
   * On a `Subcommand` these are its parameters; on a `SubcommandGroup` they are its
   * subcommands. No other option type nests.
   */
  options?: APIApplicationCommandOption[]
  /** The channel types the picker is restricted to. Only for `Channel` options. */
  channel_types?: ChannelType[]
  /**
   * The smallest value accepted.
   *
   * @remarks
   * Only for `Integer` and `Number` options; an integer for the former, a double for the
   * latter.
   */
  min_value?: number
  /** The largest value accepted, on the same terms as `min_value`. */
  max_value?: number
  /** The shortest string accepted, from `0` to `6000`. Only for `String` options. */
  min_length?: number
  /** The longest string accepted, from `1` to `6000`. Only for `String` options. */
  max_length?: number
  /**
   * Whether the application receives autocomplete interactions for this option.
   *
   * @remarks
   * Only for `String`, `Integer` and `Number` options, and rejected when `choices` are
   * present. An autocompleting option is not limited to the values the application
   * suggests — the user may submit anything.
   */
  autocomplete?: boolean
  /**
   * The file types the upload picker filters to, up to 10. Only for `Attachment` options.
   *
   * @remarks
   * Either a category — `image`, `video`, `audio` — or a dot-prefixed extension such as
   * `.pdf`. Matching is on the extension alone, so this filters the picker rather than
   * validating what the file actually contains.
   */
  file_types?: string[]
}

/**
 * A predefined value the user may pick for a command option.
 */
export interface APIApplicationCommandOptionChoice {
  /** The choice's display name, 1-100 characters. */
  name: string
  /** Localised forms of `name`, optional and nullable on the same terms as on the command. */
  name_localizations?: APILocalizationMap | null
  /** The choice's name in the requester's locale, on the same terms as on the command. */
  name_localized?: string
  /**
   * The value submitted when the choice is picked.
   *
   * @remarks
   * Its type follows the owning option's `type`: a string for `String` options, an integer
   * for `Integer` and a double for `Number`. Strings are limited to 100 characters.
   */
  value: string | number
}

/**
 * A single allow or deny rule for a command in a guild.
 */
export interface APIApplicationCommandPermission {
  /**
   * The role, user or channel the rule applies to.
   *
   * @remarks
   * Two constants stand in for whole populations: the guild's own ID means `@everyone`, and
   * the guild's ID minus one means every channel in the guild. Since snowflakes travel as
   * strings, computing the latter needs `BigInt`.
   */
  id: Snowflake
  /** What kind of target `id` names. */
  type: ApplicationCommandPermissionType
  /** `true` to allow the command, `false` to deny it. */
  permission: boolean
}

/**
 * The permission overwrites for one command, or for an application's commands as a whole,
 * within a guild.
 *
 * @remarks
 * Also the body of the `APPLICATION_COMMAND_PERMISSIONS_UPDATE` gateway event, which sends
 * this resource unchanged.
 *
 * Overwrites set on a channel are inherited by the threads inside it, matching how thread
 * permissions work generally.
 */
export interface APIGuildApplicationCommandPermissions {
  /**
   * The command these overwrites belong to.
   *
   * @remarks
   * When this is the application's ID rather than a command's, the overwrites are the
   * application-wide defaults and apply to every command without overwrites of its own.
   */
  id: Snowflake
  /** The ID of the application the command belongs to. */
  application_id: Snowflake
  /** The guild the overwrites apply in. */
  guild_id: Snowflake
  /** The rules, up to 100 per command. */
  permissions: APIApplicationCommandPermission[]
}
