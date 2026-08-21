import { Interaction } from '../../structures/Interaction.js'
import { defineHandler } from '../EventHandler.js'
import { upsertUser } from '../upsert.js'

/**
 * Interaction dispatches.
 *
 * @remarks
 * **The listener has three seconds.** Everything this handler does before emitting is spent
 * out of the consumer's response budget, which is why it does exactly two things: cache the
 * invoking user, and emit. No REST call, no fetch of the channel the interaction names, no
 * resolution of the objects in `data.resolved` — each would be a request made on every
 * interaction, to serve a listener that may not need it, inside a deadline it is not allowed
 * to miss.
 *
 * **Nothing is cached under an interaction's own ID.** An interaction is an event rather than
 * an entity: Discord never sends a second payload for one, so there is nothing to patch, and
 * the tokens are spent within fifteen minutes. A scope for them would be a growing pile of
 * dead credentials.
 */

/**
 * An application was invoked — by a command, a component, an autocomplete or a modal.
 *
 * @remarks
 * The invoking user rides along in full on every interaction, at `member.user` in a guild and
 * at `user` in a DM, so it is upserted like every other user nested in a dispatch. Upsert
 * rather than construct-and-add, so a consumer holding a `User` from a minute ago keeps
 * reading a live object.
 */
export const interactionCreate = defineHandler('INTERACTION_CREATE', (client, data) => {
  const invoker = data.member?.user ?? data.user
  if (invoker !== undefined) upsertUser(client, invoker)

  client.emit('interactionCreate', new Interaction(data, client))
})

/**
 * `interactionCreate`, until `ClientEvents` declares it.
 *
 * @remarks
 * **Scaffolding — delete this block when the event is declared in `events/ClientEvents.ts`.**
 * The handler above cannot emit an event the map does not carry, and this file is written
 * ahead of that line landing. Declaring the same member twice with the same type is legal
 * interface merging, so the day it lands nothing breaks; declaring it twice with *different*
 * types is a compile error, which is the reminder to remove this.
 */
declare module '../ClientEvents.js' {
  interface ClientEvents<Client = unknown> {
    /**
     * An application was invoked.
     *
     * @remarks
     * A response is due within three seconds — see {@link Interaction}. A listener doing
     * anything slower calls `deferReply()` before it starts.
     */
    interactionCreate: [interaction: Interaction<Client>]
  }
}
