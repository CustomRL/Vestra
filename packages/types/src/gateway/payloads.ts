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
 * A dispatched event.
 */
export interface GatewayDispatchPayload<
  Event extends GatewayDispatchEvents = GatewayDispatchEvents,
> {
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
   * `false` means the session is gone and the shard must re-identify — after a delay of
   * 1 to 5 seconds, or Discord will invalidate the new session too.
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
 * Any payload a client can send to the gateway.
 */
export type GatewaySendPayload =
  | GatewayHeartbeat
  | GatewayIdentify
  | GatewayPresenceUpdate
  | GatewayResume
  | GatewayVoiceStateUpdate
