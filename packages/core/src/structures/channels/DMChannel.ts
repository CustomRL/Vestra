import type { APIDMChannel, RESTPostAPIChannelMessageJSONBody, Snowflake } from '@vestra/types'
import { User } from '../User.js'
import type { RestCapable } from '../capabilities.js'
import { Message } from '../Message.js'
import { Channel, type TextBased } from './Channel.js'
import type { ChannelChanges, ChannelChangesDraft } from './ChannelChanges.js'

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
   * Sends a message here.
   *
   * @param body - What to send.
   * @param options - Request options, such as an abort signal.
   * @returns The message that was sent.
   *
   * @remarks
   * Named `send` rather than `createMessage`, which is what the REST route is called. The two
   * names keep the two vocabularies visibly apart: the route hands back an `APIMessage` and
   * this hands back a {@link Message}. Giving them one name would make "I fetched it through
   * REST, why is my cache stale" a question people have to ask.
   */
  async send<C extends RestCapable>(
    this: DMChannel<C>,
    body: RESTPostAPIChannelMessageJSONBody,
    options: { signal?: AbortSignal } = {},
  ): Promise<Message<C>> {
    const sent = await this.client.rest.channels.createMessage(this.id, body, options)
    return new Message(sent, this.client)
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
  override patch(data: APIDMChannel): ChannelChanges<Client> | null {
    let changes: ChannelChangesDraft<Client> | null = super.patch(data)

    if (data.last_message_id !== this.lastMessageId) {
      ;(changes ??= {}).lastMessageId = this.lastMessageId
    }
    this.lastMessageId = data.last_message_id
    // Not reported. The list is rebuilt into fresh `User` structures on every dispatch, and
    // who is in a DM does not change - see {@link ChannelChanges}.
    this.recipients = toRecipients(data, this.client)

    return changes
  }
}

/** Builds the recipient structures, or an empty list when the payload omitted them. */
function toRecipients<Client>(data: APIDMChannel, client: Client): User<Client>[] {
  if (data.recipients === undefined) return []

  const users: User<Client>[] = []
  for (const user of data.recipients) users.push(new User(user, client))
  return users
}
