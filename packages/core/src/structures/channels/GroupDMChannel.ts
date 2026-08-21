import type { APIGroupDMChannel, Snowflake } from '@vestra/types'
import { User } from '../User.js'
import { Channel, type TextBased } from './Channel.js'

/**
 * A direct message between several users.
 *
 * @remarks
 * A bot cannot create or join one, and reaches this only through an OAuth flow with the
 * `gdm.join` scope. It is modelled anyway because Discord will send the payload if the bot is
 * in one, and a channel the library refused to build would arrive as an unhandled type and
 * leave a hole in the channel cache.
 */
export class GroupDMChannel<Client = unknown> extends Channel<Client> implements TextBased {
  /** The group's name, which members may leave unset. */
  declare name: string | null | undefined
  /** The group's icon hash. */
  declare icon: string | null | undefined
  /** Who owns the group. */
  declare ownerId: Snowflake | undefined
  /** The application that created the group, if one did. */
  declare applicationId: Snowflake | undefined
  /** Whether an application created the group. */
  declare managed: boolean | undefined
  /** The ID of the last message sent here. */
  declare lastMessageId: Snowflake | null | undefined
  /** Who is in the conversation. */
  declare recipients: User<Client>[]

  /**
   * @param data - The payload to mirror.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIGroupDMChannel, client: Client) {
    super(data, client)

    this.name = data.name
    this.icon = data.icon
    this.ownerId = data.owner_id
    this.applicationId = data.application_id
    this.managed = data.managed
    this.lastMessageId = data.last_message_id
    this.recipients = toRecipients(data, client)
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   */
  override patch(data: APIGroupDMChannel): void {
    super.patch(data)

    this.name = data.name
    this.icon = data.icon
    this.ownerId = data.owner_id
    this.applicationId = data.application_id
    this.managed = data.managed
    this.lastMessageId = data.last_message_id
    this.recipients = toRecipients(data, this.client)
  }
}

/** Builds the recipient structures, or an empty list when the payload omitted them. */
function toRecipients<Client>(data: APIGroupDMChannel, client: Client): User<Client>[] {
  if (data.recipients === undefined) return []

  const users: User<Client>[] = []
  for (const user of data.recipients) users.push(new User(user, client))
  return users
}
