import type { APIDMChannel, Snowflake } from '@vestra/types'
import { User } from '../User.js'
import { Channel, type TextBased } from './Channel.js'

/**
 * A direct message between two users.
 *
 * @remarks
 * Extends {@link Channel} rather than any guild base, and satisfies {@link TextBased} instead:
 * a DM carries messages and has no guild, no name, no position and no overwrites.
 *
 * **The recipients are structures, not payloads.** Everywhere else a nested user is left to
 * the handler to cache, but a DM's whole identity is who is in it — `dm.recipients[0].tag` is
 * the first thing anybody reaches for, and handing back `APIUser` would put snake_case in
 * that expression.
 */
export class DMChannel<Client = unknown> extends Channel<Client> implements TextBased {
  /** The ID of the last message sent here. */
  declare lastMessageId: Snowflake | null | undefined
  /** Who is in the conversation. */
  declare recipients: User<Client>[]

  /**
   * @param data - The payload to mirror.
   * @param client - The client that produced this structure.
   */
  constructor(data: APIDMChannel, client: Client) {
    super(data, client)

    this.lastMessageId = data.last_message_id
    this.recipients = toRecipients(data, client)
  }

  /**
   * The other party, on a one-to-one DM.
   *
   * @remarks
   * `undefined` rather than throwing when the payload carried no recipients, which is what a
   * DM channel nested in a message reference looks like.
   */
  get recipient(): User<Client> | undefined {
    return this.recipients[0]
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   */
  override patch(data: APIDMChannel): void {
    super.patch(data)

    this.lastMessageId = data.last_message_id
    this.recipients = toRecipients(data, this.client)
  }
}

/** Builds the recipient structures, or an empty list when the payload omitted them. */
function toRecipients<Client>(data: APIDMChannel, client: Client): User<Client>[] {
  if (data.recipients === undefined) return []

  const users: User<Client>[] = []
  for (const user of data.recipients) users.push(new User(user, client))
  return users
}
