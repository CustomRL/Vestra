import type { Emoji } from '../../structures/Emoji.js'
import { createEmoji } from '../../structures/Emoji.js'
import { Sticker } from '../../structures/Sticker.js'
import { defineHandler } from '../EventHandler.js'

/**
 * Emoji and sticker dispatches.
 *
 * @remarks
 * Both events send the guild's whole set rather than a delta, which is the only interesting
 * thing about them and the thing that makes the obvious implementation wrong. Adding what
 * arrived leaves anything deleted in the cache forever, because a delete is expressed as an
 * absence from the next full list and there is no event that names it.
 *
 * So both handlers reconcile: add what arrived, then drop anything in the guild's group that
 * was not in it. The group index is what makes that affordable — without it, reconciling one
 * guild would mean walking every emoji of every guild.
 */

/**
 * A guild's emojis changed.
 *
 * @remarks
 * Emits the current set and the removed ones, and deliberately **not** a "previous" list. The
 * obvious implementation of that is to hand back what `group()` returned before the
 * reconciliation, and it is wrong: those are the same objects the loop below patches in place,
 * so by the time a listener reads them they hold the new values under an old name. Producing an
 * honest previous list would mean cloning every surviving emoji on every rename. The removed
 * ones need no clone, because nothing patched them.
 */
export const guildEmojisUpdate = defineHandler('GUILD_EMOJIS_UPDATE', (client, data) => {
  const previous = client.cache.emojis.group(data.guild_id)

  const arrived = new Set<string>()
  const current: Emoji[] = []
  for (const payload of data.emojis) {
    const emoji = createEmoji(payload, data.guild_id, client)
    // A payload with no ID is a standard Unicode emoji, which has nothing to cache.
    if (emoji === undefined) continue

    arrived.add(emoji.id)
    const cached = client.cache.emojis.get(emoji.id)
    if (cached === undefined) {
      current.push(client.cache.emojis.add(emoji))
      continue
    }

    // Patched rather than replaced, so a held reference stays live across a rename.
    cached.patch(payload)
    current.push(cached)
  }

  const removed: Emoji[] = []
  for (const emoji of previous) {
    if (arrived.has(emoji.id)) continue
    client.cache.emojis.delete(emoji.id)
    removed.push(emoji)
  }

  client.emit('guildEmojisUpdate', data.guild_id, current, removed)
})

/**
 * A guild's stickers changed.
 *
 * @remarks
 * The same reconciliation as {@link guildEmojisUpdate}, for the same reasons: the payload is
 * the whole set, a deletion is only ever an absence from it, and the removed list is the only
 * one that can be handed back without cloning.
 */
export const guildStickersUpdate = defineHandler('GUILD_STICKERS_UPDATE', (client, data) => {
  const previous = client.cache.stickers.group(data.guild_id)

  const arrived = new Set<string>()
  const current: Sticker[] = []
  for (const payload of data.stickers) {
    arrived.add(payload.id)
    const cached = client.cache.stickers.get(payload.id)
    if (cached === undefined) {
      current.push(client.cache.stickers.add(new Sticker(payload, client)))
      continue
    }

    cached.patch(payload)
    current.push(cached)
  }

  const removed: Sticker[] = []
  for (const sticker of previous) {
    if (arrived.has(sticker.id)) continue
    client.cache.stickers.delete(sticker.id)
    removed.push(sticker)
  }

  client.emit('guildStickersUpdate', data.guild_id, current, removed)
})
