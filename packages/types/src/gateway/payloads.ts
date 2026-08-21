import type { Snowflake } from '../globals.js'
import type { GatewayOpcodes } from '../enums/gateway.js'
import type { GatewayDispatchEvents } from '../enums/dispatch-events.js'
import type { GatewayDispatchData } from './dispatch.js'

/**
 * Gateway control payloads.
 *
 * @remarks
 * Every frame on the socket has the same four fields — `op`, `d`, `s`, `t` — but only a
 * dispatch carries `s` and `t`. Modelling them as a discriminated union on `op` means a
 * shard's frame handler narrows exhaustively instead of casting.
 */

/**
 * A dispatched event of one specific type.
 *
 * @remarks
 * Use {@link GatewayDispatchPayload} to describe "any dispatch". This is the parameterised
 * form, for the cases where the event is already known.
 */
export interface GatewayDispatchPayloadFor<Event extends GatewayDispatchEvents> {
  /** Always {@link GatewayOpcodes.Dispatch}. */
  op: typeof GatewayOpcodes.Dispatch
  /** The event name. */
  t: Event
  /**
   * The sequence number.
   *
   * @remarks
   * Must be tracked and echoed in heartbeats and in the resume payload. Losing it means
   * losing the ability to resume, so it is stored per shard rather than per connection.
   */
  s: number
  /** The event data. */
  d: GatewayDispatchData<Event>
}

/**
 * Any dispatched event.
 *
 * @remarks
 * A union of one member per event, rather than a single interface parameterised by the
 * event name. The distinction is the whole ergonomics of consuming the gateway: in a
 * union, `t` and `d` are correlated, so a plain check narrows both.
 *
 * ```ts
 * if (payload.t === 'MESSAGE_CREATE') {
 *   payload.d.content // GatewayMessageCreateDispatchData
 * }
 * ```
 *
 * As one parameterised interface it did not narrow, and `d` did not even resolve to the
 * union of every event's data — events absent from {@link GatewayDispatchEventMap} take
 * the `unknown` branch of {@link GatewayDispatchData}, and `unknown` absorbs every other
 * member of a union. So `d` was exactly `unknown` and every consumer reached for a cast.
 */
export type GatewayDispatchPayload = {
  [Event in GatewayDispatchEvents]: GatewayDispatchPayloadFor<Event>
}[GatewayDispatchEvents]

/**
 * Sent immediately after connecting, carrying the heartbeat interval.
 */
export interface GatewayHello {
  /** Always {@link GatewayOpcodes.Hello}. */
  op: typeof GatewayOpcodes.Hello
  /** Always `null`. */
  t: null
  /** Always `null`. */
  s: null
  /** The hello data. */
  d: GatewayHelloData
}

/**
 * The data of a hello payload.
 */
export interface GatewayHelloData {
  /**
   * How often to heartbeat, in milliseconds.
   *
   * @remarks
   * The first heartbeat should be sent after `heartbeat_interval * jitter`, where jitter
   * is a random value between 0 and 1. Without that, every shard of every bot heartbeats
   * in lockstep after a Discord restart.
   */
  heartbeat_interval: number
}

/**
 * A request from Discord to heartbeat immediately.
 */
export interface GatewayHeartbeatRequest {
  /** Always {@link GatewayOpcodes.Heartbeat}. */
  op: typeof GatewayOpcodes.Heartbeat
  /** Always `null`. */
  t: null
  /** Always `null`. */
  s: null
  /** Always `null`. */
  d: null
}

/**
 * Acknowledgement of a heartbeat.
 *
 * @remarks
 * A shard that sends a heartbeat and does not receive this before the next interval is
 * on a zombie connection: the socket is open but no longer carrying traffic. The only
 * correct response is to close it and reconnect, not to keep heartbeating.
 */
export interface GatewayHeartbeatAck {
  /** Always {@link GatewayOpcodes.HeartbeatAck}. */
  op: typeof GatewayOpcodes.HeartbeatAck
  /** Always `null`. */
  t: null
  /** Always `null`. */
  s: null
  /** Always `null`. */
  d: null
}

/**
 * A request to reconnect and resume.
 */
export interface GatewayReconnect {
  /** Always {@link GatewayOpcodes.Reconnect}. */
  op: typeof GatewayOpcodes.Reconnect
  /** Always `null`. */
  t: null
  /** Always `null`. */
  s: null
  /** Always `null`. */
  d: null
}

/**
 * Notification that the session is invalid.
 */
export interface GatewayInvalidSession {
  /** Always {@link GatewayOpcodes.InvalidSession}. */
  op: typeof GatewayOpcodes.InvalidSession
  /** Always `null`. */
  t: null
  /** Always `null`. */
  s: null
  /**
   * Whether the session may still be resumed.
   *
   * @remarks
   * `false` means the session is gone and the shard must identify afresh.
   *
   * Vestra waits a short randomised delay before re-identifying. That is library policy,
   * not a documented protocol requirement: Discord's documentation states no delay here.
   * The delay exists so that a fleet of shards invalidated together does not re-identify
   * in lockstep.
   */
  d: boolean
}

/**
 * Any payload the gateway can send to a client.
 *
 * @remarks
 * A discriminated union on `op`, so a frame handler can `switch` exhaustively.
 */
export type GatewayReceivePayload =
  | GatewayDispatchPayload
  | GatewayHeartbeatAck
  | GatewayHeartbeatRequest
  | GatewayHello
  | GatewayInvalidSession
  | GatewayReconnect

/**
 * Connection properties sent when identifying.
 */
export interface GatewayIdentifyProperties {
  /** The operating system. */
  os: string
  /** The library name. */
  browser: string
  /** The library name. */
  device: string
}

/**
 * The data of an identify payload.
 */
export interface GatewayIdentifyData {
  /** The bot token, including the `Bot ` prefix. */
  token: string
  /** Connection properties. */
  properties: GatewayIdentifyProperties
  /** Whether the connection supports packet compression. Unrelated to transport compression. */
  compress?: boolean
  /**
   * The member threshold above which a guild is considered large, from 50 to 250.
   *
   * @remarks
   * Guilds above this send no offline members in `GUILD_CREATE`, which is the main lever
   * on memory during startup.
   */
  large_threshold?: number
  /** The shard index and total shard count, as `[id, count]`. */
  shard?: [shardId: number, shardCount: number]
  /** The initial presence for this connection. */
  presence?: GatewayPresenceUpdateData
  /** The intents bit set for this connection. */
  intents: number
  /**
   * Optional protocol behaviours to opt into. A bit set of `GatewayCapabilityFlags`.
   *
   * @remarks
   * Defaults to `0`. Opting in can change the shape of received payloads, so it is a
   * parsing decision rather than a volume one.
   */
  capabilities?: number
}

/**
 * A request to start a new session.
 */
export interface GatewayIdentify {
  /** Always {@link GatewayOpcodes.Identify}. */
  op: typeof GatewayOpcodes.Identify
  /** The identify data. */
  d: GatewayIdentifyData
}

/**
 * The data of a resume payload.
 */
export interface GatewayResumeData {
  /** The bot token. */
  token: string
  /** The session ID from the `READY` payload. */
  session_id: string
  /** The last sequence number received. */
  seq: number
}

/**
 * A request to replay events missed while disconnected.
 */
export interface GatewayResume {
  /** Always {@link GatewayOpcodes.Resume}. */
  op: typeof GatewayOpcodes.Resume
  /** The resume data. */
  d: GatewayResumeData
}

/**
 * A heartbeat sent by the client.
 */
export interface GatewayHeartbeat {
  /** Always {@link GatewayOpcodes.Heartbeat}. */
  op: typeof GatewayOpcodes.Heartbeat
  /** The last sequence number received, or `null` if none has been. */
  d: number | null
}

/**
 * The data of a presence update.
 */
export interface GatewayPresenceUpdateData {
  /** When the client went idle, in milliseconds, or `null` if it is not idle. */
  since: number | null
  /** The activities to display. */
  activities: GatewayActivityUpdateData[]
  /** The status to display. */
  status: 'dnd' | 'idle' | 'invisible' | 'offline' | 'online'
  /** Whether the client is AFK. */
  afk: boolean
}

/**
 * An activity as set by a bot.
 *
 * @remarks
 * Bots may only set `name`, `type`, `url` and `state`. Every other field of a received
 * activity is ignored on send.
 */
export interface GatewayActivityUpdateData {
  /** The activity's name. */
  name: string
  /** The activity's type. */
  type: number
  /** A stream URL. Only validated when `type` is streaming. */
  url?: string | null
  /** The user's current party status, shown as the line under the name. */
  state?: string | null
}

/**
 * A request to update the client's presence.
 */
export interface GatewayPresenceUpdate {
  /** Always {@link GatewayOpcodes.PresenceUpdate}. */
  op: typeof GatewayOpcodes.PresenceUpdate
  /** The presence update data. */
  d: GatewayPresenceUpdateData
}

/**
 * A request to join, move between or leave a voice channel.
 */
export interface GatewayVoiceStateUpdate {
  /** Always {@link GatewayOpcodes.VoiceStateUpdate}. */
  op: typeof GatewayOpcodes.VoiceStateUpdate
  /** The voice state update data. */
  d: GatewayVoiceStateUpdateData
}

/**
 * The data of a voice state update.
 */
export interface GatewayVoiceStateUpdateData {
  /** The guild to update the voice state in. */
  guild_id: Snowflake
  /** The channel to join, or `null` to disconnect. */
  channel_id: Snowflake | null
  /** Whether the client is self-muted. */
  self_mute: boolean
  /** Whether the client is self-deafened. */
  self_deaf: boolean
}

/**
 * A request for a guild's members.
 *
 * @remarks
 * Exactly one of `query` or `user_ids` may be sent, and `limit` is required alongside
 * `query`. Requesting all members needs the `GuildMembers` privileged intent.
 */
export interface GatewayRequestGuildMembers {
  /** Always {@link GatewayOpcodes.RequestGuildMembers}. */
  op: typeof GatewayOpcodes.RequestGuildMembers
  /** The request data. */
  d: GatewayRequestGuildMembersData
}

/**
 * The data of a request for guild members.
 */
export interface GatewayRequestGuildMembersData {
  /** The guild to fetch members from. One guild per request. */
  guild_id: Snowflake
  /** A username prefix to match. An empty string matches every member. */
  query?: string
  /** How many members to return, from 0 to 100. `0` with an empty query returns all. */
  limit?: number
  /** Whether to include presences. Requires the `GuildPresences` intent. */
  presences?: boolean
  /** Specific users to fetch, up to 100. Mutually exclusive with `query`. */
  user_ids?: Snowflake[]
  /**
   * A value echoed back on every resulting chunk, up to 32 bytes.
   *
   * @remarks
   * The only way to correlate chunks with the request that produced them, which matters
   * because chunks from concurrent requests interleave on one socket.
   */
  nonce?: string
}

/**
 * A request for a guild's soundboard sounds.
 */
export interface GatewayRequestSoundboardSounds {
  /** Always {@link GatewayOpcodes.RequestSoundboardSounds}. */
  op: typeof GatewayOpcodes.RequestSoundboardSounds
  /** The request data. */
  d: GatewayRequestSoundboardSoundsData
}

/**
 * The data of a request for soundboard sounds.
 */
export interface GatewayRequestSoundboardSoundsData {
  /** The guilds to fetch sounds for. */
  guild_ids: Snowflake[]
}

/**
 * Any payload a client can send to the gateway.
 */
export type GatewaySendPayload =
  | GatewayHeartbeat
  | GatewayIdentify
  | GatewayPresenceUpdate
  | GatewayRequestGuildMembers
  | GatewayRequestSoundboardSounds
  | GatewayResume
  | GatewayVoiceStateUpdate
