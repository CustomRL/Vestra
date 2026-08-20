import type { InteractionType } from '../enums/interaction.js'
import type { Snowflake } from '../globals.js'
import type { APIChannelPartial } from './channel.js'
import type { APIGuildMemberPartial } from './member.js'
import type { APIRole } from './role.js'
import type { APIUser } from './user.js'

/**
 * A message's interaction provenance: what invoked it, and what it resolved.
 */

/**
 * Metadata about the interaction that produced a message.
 */
export interface APIMessageInteractionMetadata {
  /** The interaction's ID. */
  id: Snowflake
  /** The interaction's type. */
  type: InteractionType
  /** The user who triggered the interaction. */
  user: APIUser
  /** The IDs of installation contexts the interaction was authorised for. */
  authorizing_integration_owners: Record<string, Snowflake>
  /** The ID of the original response message, for follow-ups. */
  original_response_message_id?: Snowflake
  /** The ID of the message containing the component that was interacted with. */
  interacted_message_id?: Snowflake
}

/**
 * The interaction a message was sent in response to.
 *
 *
 * @remarks
 * Superseded by `interaction_metadata` on the message, which also covers component
 * and modal interactions. Discord still sends this object, so it is modelled for
 * reading older messages; the deprecation is recorded on `APIMessage.interaction`.
 * Only sent for a response to an interaction that had no existing message, so it is
 * absent for component responses.
 */
export interface APIMessageInteraction {
  /** The interaction's ID. */
  id: Snowflake
  /** The interaction's type. */
  type: InteractionType
  /** The name of the command that was invoked, including subcommand and group names. */
  name: string
  /** The user who invoked the interaction. */
  user: APIUser
  /**
   * The invoking user's guild membership, when the interaction happened in a guild.
   *
   * @remarks
   * Never carries a `user` — that is already at `user` above.
   */
  member?: APIGuildMemberPartial
  /** The command's name in the invoking user's locale, when the command is localised. */
  name_localized?: string
}

/**
 * Objects a message refers to, keyed by ID.
 *
 * @remarks
 * Sent on messages carrying auto-populated select menus, so that the preselected options
 * can be rendered without a second request. This is a smaller shape than an interaction's
 * `resolved` data, which additionally carries `messages` and `attachments`.
 *
 * Every map is optional and, in Discord's specification, nullable as well, so an absent
 * key and an explicit `null` both have to be handled.
 */
export interface APIMessageResolvedData {
  /** The users the message refers to. */
  users?: Record<Snowflake, APIUser> | null
  /**
   * The guild memberships the message refers to.
   *
   * @remarks
   * These lack `deaf` and `mute` as well as `user`. A member is always accompanied by its
   * user under the same ID in `users`.
   */
  members?: Record<Snowflake, Omit<APIGuildMemberPartial, 'deaf' | 'mute'>> | null
  /** The roles the message refers to. */
  roles?: Record<Snowflake, APIRole> | null
  /** The channels the message refers to, in their reduced form. */
  channels?: Record<Snowflake, APIChannelPartial> | null
}

/**
 * The application behind a Rich Presence chat embed.
 *
 * @remarks
 * A partial application carrying only what the embed needs to render. The full
 * application resource is not modelled in this package yet, which is why this shape is
 * declared here rather than derived from it.
 */
export interface APIMessageApplication {
  /** The application's ID. */
  id: Snowflake
  /** The application's name. */
  name: string
  /** The application's icon hash. */
  icon: string | null
  /** The application's description. */
  description: string
  /**
   * What kind of application it is, or `null` for an ordinary one.
   *
   * @remarks
   * The only value Discord's specification declares is `4`, a guild role subscription
   * application. Always sent, unlike the fields below it.
   */
  type: number | null
  /** The hash of the default cover image shown on a rich presence embed. */
  cover_image?: string
  /** The ID of the game SKU created for the application, if it is sold on Discord. */
  primary_sku_id?: Snowflake
  /** The application's bot user. */
  bot?: APIUser
}
