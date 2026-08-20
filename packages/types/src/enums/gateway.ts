/**
 * Gateway enumerations: opcodes, close codes and intents.
 */

/**
 * Gateway opcodes.
 *
 * @remarks
 * Opcodes 0 to 11 are the whole protocol. A shard sends `Identify`, `Resume`,
 * `Heartbeat`, `RequestGuildMembers`, `VoiceStateUpdate` and `PresenceUpdate`; every
 * other opcode is receive-only.
 */
export const GatewayOpcodes = {
  /** Receive: an event was dispatched. */
  Dispatch: 0,
  /** Send and receive: keep the connection alive. Discord may request one at any time. */
  Heartbeat: 1,
  /** Send: start a new session. */
  Identify: 2,
  /** Send: update the shard's presence. */
  PresenceUpdate: 3,
  /** Send: join, move between or leave a voice channel. */
  VoiceStateUpdate: 4,
  /** Send: resume a dropped session. */
  Resume: 6,
  /** Receive: reconnect and resume immediately. */
  Reconnect: 7,
  /** Send: request members for a guild. */
  RequestGuildMembers: 8,
  /** Receive: the session is invalid. Re-identify, or resume if the payload allows. */
  InvalidSession: 9,
  /** Receive: sent immediately on connect, carrying the heartbeat interval. */
  Hello: 10,
  /** Receive: acknowledges a heartbeat. */
  HeartbeatAck: 11,
  /** Send: request soundboard sounds for a guild. */
  RequestSoundboardSounds: 31,
} as const

/**
 * A gateway opcode.
 */
export type GatewayOpcodes = (typeof GatewayOpcodes)[keyof typeof GatewayOpcodes]

/**
 * Websocket close codes the gateway sends.
 *
 * @remarks
 * The critical distinction is whether a code is recoverable. Reconnecting after an
 * unrecoverable close — bad token, invalid intents, invalid shard — is a loop that will
 * never succeed and that Discord may rate limit. See `UnrecoverableGatewayCloseCodes`.
 */
export const GatewayCloseCodes = {
  /** Unknown error. Reconnect and resume. */
  UnknownError: 4000,
  /** An invalid opcode or payload was sent. */
  UnknownOpcode: 4001,
  /** An invalid payload was sent. */
  DecodeError: 4002,
  /** A payload was sent before identifying. */
  NotAuthenticated: 4003,
  /** The token sent with the identify payload was wrong. */
  AuthenticationFailed: 4004,
  /** More than one identify payload was sent. */
  AlreadyAuthenticated: 4005,
  /** The sequence number sent when resuming was invalid. Re-identify. */
  InvalidSeq: 4007,
  /** Payloads were sent too quickly. */
  RateLimited: 4008,
  /** The session timed out. Re-identify. */
  SessionTimedOut: 4009,
  /** An invalid shard was sent when identifying. */
  InvalidShard: 4010,
  /** The session would have handled too many guilds; sharding is required. */
  ShardingRequired: 4011,
  /** An invalid API version was sent. */
  InvalidAPIVersion: 4012,
  /** Invalid intents were sent. */
  InvalidIntents: 4013,
  /** Intents were requested that the application has not been approved for. */
  DisallowedIntents: 4014,
} as const

/**
 * A gateway close code.
 */
export type GatewayCloseCodes = (typeof GatewayCloseCodes)[keyof typeof GatewayCloseCodes]

/**
 * Close codes after which reconnecting can never succeed.
 *
 * @remarks
 * These represent a misconfiguration — a bad token, intents the application is not
 * approved for, an impossible shard. A client that reconnects on these spins forever
 * and produces a confusing outage rather than an actionable error, so Vestra treats
 * them as fatal and surfaces them.
 */
export const UnrecoverableGatewayCloseCodes: readonly GatewayCloseCodes[] = [
  GatewayCloseCodes.AuthenticationFailed,
  GatewayCloseCodes.InvalidShard,
  GatewayCloseCodes.ShardingRequired,
  GatewayCloseCodes.InvalidAPIVersion,
  GatewayCloseCodes.InvalidIntents,
  GatewayCloseCodes.DisallowedIntents,
]

/**
 * Gateway intents, which select the events a connection receives.
 *
 * @remarks
 * `GuildMembers`, `GuildPresences` and `MessageContent` are privileged: they must be
 * enabled in the application's settings, and past 100 guilds require approval.
 * Requesting one without approval closes the connection with `DisallowedIntents`.
 */
export const GatewayIntentBits = {
  /** Guild lifecycle, roles, channels, threads and stage instances. */
  Guilds: 1 << 0,
  /** Member joins, updates and removals. Privileged. */
  GuildMembers: 1 << 1,
  /** Bans and unbans, plus AutoMod configuration. */
  GuildModeration: 1 << 2,
  /** Emoji, sticker and soundboard updates. */
  GuildExpressions: 1 << 3,
  /** Integration updates and webhook updates. */
  GuildIntegrations: 1 << 4,
  /** Webhook create, update and delete. */
  GuildWebhooks: 1 << 5,
  /** Invite create and delete. */
  GuildInvites: 1 << 6,
  /** Voice state updates. */
  GuildVoiceStates: 1 << 7,
  /** Presence updates. Privileged, and by far the most memory-expensive. */
  GuildPresences: 1 << 8,
  /** Message create, update and delete in guilds. */
  GuildMessages: 1 << 9,
  /** Reaction changes in guilds. */
  GuildMessageReactions: 1 << 10,
  /** Typing indicators in guilds. */
  GuildMessageTyping: 1 << 11,
  /** Message events in direct messages. */
  DirectMessages: 1 << 12,
  /** Reaction changes in direct messages. */
  DirectMessageReactions: 1 << 13,
  /** Typing indicators in direct messages. */
  DirectMessageTyping: 1 << 14,
  /**
   * Message content, attachments, embeds and components.
   *
   * @remarks
   * Privileged, and not an event filter like the others — without it, `content` arrives
   * as an empty string on messages that do not mention the bot. An unexpectedly empty
   * `content` almost always means this intent is missing.
   */
  MessageContent: 1 << 15,
  /** Scheduled event create, update and delete. */
  GuildScheduledEvents: 1 << 16,
  /** AutoMod rule create, update and delete. */
  AutoModerationConfiguration: 1 << 20,
  /** AutoMod action execution. */
  AutoModerationExecution: 1 << 21,
  /** Poll vote add and remove in guilds. */
  GuildMessagePolls: 1 << 24,
  /** Poll vote add and remove in direct messages. */
  DirectMessagePolls: 1 << 25,
} as const

/**
 * A gateway intent.
 */
export type GatewayIntentBits = (typeof GatewayIntentBits)[keyof typeof GatewayIntentBits]

/**
 * The intents that require approval in the application's settings.
 */
export const PrivilegedGatewayIntents: readonly GatewayIntentBits[] = [
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildPresences,
  GatewayIntentBits.MessageContent,
]
