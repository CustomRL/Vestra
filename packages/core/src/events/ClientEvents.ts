import type { GatewayDispatchPayload, GatewayReadyDispatchData, Snowflake } from '@vestra/types'
import type { ClientUser } from '../structures/ClientUser.js'
import type { GuildMember } from '../structures/GuildMember.js'
import type { Message } from '../structures/Message.js'
import type { Role } from '../structures/Role.js'
import type { User } from '../structures/User.js'

/**
 * What the client emits, and what each event carries.
 *
 * @remarks
 * **Hand-written rather than derived from `GatewayDispatchEvents`.** A mechanical
 * transform — uncapitalise, camelCase — cannot express the cases that matter: one gateway
 * event can produce two client events, and an event whose payload is upgraded from a raw
 * type to a structure would change its own signature. `packages/core/test/naming.test.ts`
 * guards the mapping instead, so the drift the transform was protecting against is still
 * caught without the type-level cleverness.
 *
 * **Only handled events appear here.** An event with no handler emits nothing rather than
 * emitting its raw payload under a derived name. Emitting the raw form would mean that
 * adding a handler later changes the argument from `APIEntitlement` to `Entitlement` — a
 * breaking change for an event nobody asked for. Emitting nothing makes adding a handler
 * purely additive. Everything unhandled is still reachable through {@link ClientEvents.raw}.
 */
export interface ClientEvents<Client = unknown> {
  /**
   * The client is connected and its identity is known.
   *
   * @remarks
   * Fired once per client, not once per shard, and **not** the same thing as every guild
   * having arrived — the guild stream is still draining when this fires. An event for that
   * belongs with the readiness tracker.
   */
  ready: [user: ClientUser<Client>]

  /** A message was sent. */
  messageCreate: [message: Message<Client>]
  /**
   * A message was edited.
   *
   * @remarks
   * Carries the message as it now is. There is no "old message" argument: producing one
   * needs a clone, and a partial update means most of the old message was never known.
   */
  messageUpdate: [message: Message<Client>]
  /** A message was deleted. Carries IDs, because the message itself may never have been cached. */
  messageDelete: [messageId: Snowflake, channelId: Snowflake, guildId: Snowflake | undefined]

  /** A member joined a guild. */
  guildMemberAdd: [member: GuildMember<Client>]
  /** A member was updated. */
  guildMemberUpdate: [member: GuildMember<Client>]
  /** A member left or was removed. */
  guildMemberRemove: [guildId: Snowflake, user: User<Client>]

  /** A role was created. */
  roleCreate: [role: Role<Client>, guildId: Snowflake]
  /** A role was updated. */
  roleUpdate: [role: Role<Client>, guildId: Snowflake]
  /** A role was deleted. */
  roleDelete: [roleId: Snowflake, guildId: Snowflake]

  /** The current user was updated. */
  userUpdate: [user: ClientUser<Client>]

  /**
   * Every dispatch, before anything is done with it.
   *
   * @remarks
   * The escape hatch, and the only place an unhandled event surfaces. Carries the payload
   * exactly as it arrived, plus whether it is a replay after a resume — which the typed
   * events deliberately do not, because threading it through every signature would put a
   * flag nobody reads on all of them.
   */
  raw: [payload: GatewayDispatchPayload, shardId: number, replayed: boolean]

  /**
   * A handler threw.
   *
   * @remarks
   * A handler failing must not take the connection with it, so the router contains the
   * throw and reports it here. Node's `EventEmitter` throws on an unhandled `'error'`, and
   * Vestra does not deviate: a client whose errors are silently swallowed is worse than one
   * that stops.
   */
  error: [error: Error, context: { event: string; shardId: number }]
}

/** Any event the client can emit. */
export type ClientEventName = keyof ClientEvents

/**
 * The READY payload, kept out of the public event so it can change.
 *
 * @internal
 */
export type ReadyData = GatewayReadyDispatchData
