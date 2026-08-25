import type { Permissions } from '../globals.js'
import type { ApplicationCommandType } from '../enums/interaction.js'
import type {
  APIApplicationCommand,
  APIApplicationCommandOption,
  APIGuildApplicationCommandPermissions,
  APILocalizationMap,
} from '../payloads/application-command.js'

/**
 * Application command request bodies, queries and results.
 *
 * @remarks
 * **Registering a command is a `PUT`-shaped problem wearing `POST` clothes.** Creating one
 * with a name that already exists does not fail — Discord treats it as an update and returns
 * the existing command's ID. So `create` is idempotent in a way most `POST` routes are not,
 * and the bulk overwrite is the honest way to declare a command set: it replaces the lot, so
 * a command dropped from the source disappears rather than lingering.
 *
 * Global commands take up to an hour to propagate. Guild commands are immediate, which is why
 * every bot's development loop registers against one guild and only the release registers
 * globally.
 */

/**
 * `POST /applications/{application.id}/commands`
 *
 * @remarks
 * `default_member_permissions` is a decimal permission string, `'0'` meaning nobody but
 * administrators, and `null` meaning everybody. The three cases are genuinely different and
 * `undefined` is a fourth — leave it out to keep whatever the command already had.
 */
export interface RESTPostAPIApplicationCommandJSONBody {
  /** The command's name, 1 to 32 characters. */
  name: string
  /** Localised forms of the name. */
  name_localizations?: APILocalizationMap | null
  /** The description. Required for `ChatInput`, and empty for the other kinds. */
  description?: string
  /** Localised forms of the description. */
  description_localizations?: APILocalizationMap | null
  /** Parameters, for a `ChatInput` command. */
  options?: APIApplicationCommandOption[]
  /** Permissions required by default, as a decimal string. `'0'` hides it from everyone. */
  default_member_permissions?: Permissions | null
  /** Whether the command is available in direct messages. Global commands only. */
  dm_permission?: boolean | null
  /** What kind of command this is. Defaults to `ChatInput`. */
  type?: ApplicationCommandType
  /** Whether the command is age-restricted. */
  nsfw?: boolean
}

/** `PATCH /applications/{application.id}/commands/{command.id}` */
export type RESTPatchAPIApplicationCommandJSONBody = Partial<
  Omit<RESTPostAPIApplicationCommandJSONBody, 'type'>
>

/**
 * `PUT /applications/{application.id}/commands`
 *
 * @remarks
 * A full replacement. Anything absent from the array is **deleted**, which is the point: it
 * makes the source of truth the code rather than whatever accumulated in Discord's state.
 */
export type RESTPutAPIApplicationCommandsJSONBody = RESTPostAPIApplicationCommandJSONBody[]

/** `GET /applications/{application.id}/commands` */
export interface RESTGetAPIApplicationCommandsQuery {
  /** Include the full localisation dictionaries rather than a single localised name. */
  with_localizations?: boolean
}

/** The result of fetching one command. */
export type RESTGetAPIApplicationCommandResult = APIApplicationCommand

/** The result of fetching a command list. */
export type RESTGetAPIApplicationCommandsResult = APIApplicationCommand[]

/** The result of creating or editing a command. */
export type RESTPostAPIApplicationCommandResult = APIApplicationCommand

/** The result of a bulk overwrite. */
export type RESTPutAPIApplicationCommandsResult = APIApplicationCommand[]

/** The result of fetching command permissions for a guild. */
export type RESTGetAPIGuildApplicationCommandsPermissionsResult =
  APIGuildApplicationCommandPermissions[]
