/**
 * Interaction and application command enumerations.
 */

/**
 * The type of an incoming interaction.
 */
export const InteractionType = {
  /** Discord checking that a webhook endpoint is alive. Only ever seen over HTTP. */
  Ping: 1,
  /** A slash, user or message command was invoked. */
  ApplicationCommand: 2,
  /** A button was pressed or a select menu was used. */
  MessageComponent: 3,
  /** A user is typing into an autocomplete-enabled command option. */
  ApplicationCommandAutocomplete: 4,
  /** A modal was submitted. */
  ModalSubmit: 5,
} as const

/**
 * An interaction type.
 */
export type InteractionType = (typeof InteractionType)[keyof typeof InteractionType]

/**
 * How an application responds to an interaction.
 */
export const InteractionResponseType = {
  /** Acknowledge a `Ping`. */
  Pong: 1,
  /** Respond immediately with a message. */
  ChannelMessageWithSource: 4,
  /** Acknowledge now and send a message within 15 minutes. */
  DeferredChannelMessageWithSource: 5,
  /** For components: acknowledge now and edit the message later, showing no loading state. */
  DeferredMessageUpdate: 6,
  /** For components: edit the message the component is attached to. */
  UpdateMessage: 7,
  /** Respond with autocomplete suggestions. */
  ApplicationCommandAutocompleteResult: 8,
  /** Respond with a modal. */
  Modal: 9,
  /** Respond with an upgrade prompt. */
  PremiumRequired: 10,
  /** Launch the application's activity. */
  LaunchActivity: 12,
} as const

/**
 * An interaction response type.
 */
export type InteractionResponseType =
  (typeof InteractionResponseType)[keyof typeof InteractionResponseType]

/**
 * Where an interaction was invoked from.
 */
export const InteractionContextType = {
  /** In a guild. */
  Guild: 0,
  /** In a DM with the application's bot user. */
  BotDM: 1,
  /** In a DM or group DM with someone other than the bot. */
  PrivateChannel: 2,
} as const

/**
 * An interaction context.
 */
export type InteractionContextType =
  (typeof InteractionContextType)[keyof typeof InteractionContextType]

/**
 * How an application was installed, which determines where its commands appear.
 */
export const ApplicationIntegrationType = {
  /** Installed to a guild. */
  GuildInstall: 0,
  /** Installed to a user account, usable anywhere that user goes. */
  UserInstall: 1,
} as const

/**
 * An application integration type.
 */
export type ApplicationIntegrationType =
  (typeof ApplicationIntegrationType)[keyof typeof ApplicationIntegrationType]

/**
 * The type of an application command.
 */
export const ApplicationCommandType = {
  /** A slash command, invoked by typing. */
  ChatInput: 1,
  /** A command on a user's context menu. */
  User: 2,
  /** A command on a message's context menu. */
  Message: 3,
  /** A command invoked from the application's entry point in the App Directory. */
  PrimaryEntryPoint: 4,
} as const

/**
 * An application command type.
 */
export type ApplicationCommandType =
  (typeof ApplicationCommandType)[keyof typeof ApplicationCommandType]

/**
 * The type of an application command option.
 */
export const ApplicationCommandOptionType = {
  /** A nested group of subcommands. */
  Subcommand: 1,
  /** A group containing subcommands. */
  SubcommandGroup: 2,
  /** A string. */
  String: 3,
  /** Any integer between -2^53 and 2^53. */
  Integer: 4,
  /** A boolean. */
  Boolean: 5,
  /** A user. */
  User: 6,
  /** A channel; includes categories and threads. */
  Channel: 7,
  /** A role. */
  Role: 8,
  /** A user or a role. */
  Mentionable: 9,
  /** Any double between -2^53 and 2^53. */
  Number: 10,
  /** An uploaded file. */
  Attachment: 11,
} as const

/**
 * An application command option type.
 */
export type ApplicationCommandOptionType =
  (typeof ApplicationCommandOptionType)[keyof typeof ApplicationCommandOptionType]

/**
 * What an application command permission overwrite targets.
 */
export const ApplicationCommandPermissionType = {
  /** A role. */
  Role: 1,
  /** A user. */
  User: 2,
  /** A channel. */
  Channel: 3,
} as const

/**
 * An application command permission target type.
 */
export type ApplicationCommandPermissionType =
  (typeof ApplicationCommandPermissionType)[keyof typeof ApplicationCommandPermissionType]
