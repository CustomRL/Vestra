import type { Snowflake } from '@vestra/types'
import type { CacheRegistry } from './CacheRegistry.js'
import { guildUserKey } from './CacheKeys.js'

/**
 * Drops everything cached for a guild the bot has left.
 *
 * @param cache - The registry to evict from.
 * @param guildId - The guild that is gone.
 *
 * @remarks
 * **Lives here rather than inline in the handler because it is the thing that rots.** It began
 * as two lines in `guildDelete` covering guilds and roles, which was complete when `roles` was
 * the only other guild-scoped scope. Seven scopes later it was not, and everything cached for a
 * departed guild leaked for the life of the process — unreachable, because no dispatch would
 * ever name those IDs again. Issue #15.
 *
 * `packages/core/test/handlers-guilds.test.ts` fails naming any guild-scoped store that still
 * holds something after this runs, so a scope added without a line here is a test failure
 * rather than a slow leak.
 *
 * **Two scopes cannot use `group()`.** `threads` groups by parent channel and `messages` groups
 * by channel, so neither has a group keyed by guild — their entries are found by the `guildId`
 * they carry instead. Using `group(guildId)` on either returns nothing and silently evicts
 * nothing, which is the failure mode this note exists to prevent.
 *
 * **`users` is deliberately untouched.** A user in a departed guild may still be in others, and
 * a user is not guild-scoped in the first place. Dropping them would be wrong rather than
 * merely wasteful.
 */
export function evictGuild(cache: CacheRegistry, guildId: Snowflake): void {
  cache.guilds.delete(guildId)

  for (const role of cache.roles.group(guildId)) cache.roles.delete(role.id)
  for (const channel of cache.channels.group(guildId)) cache.channels.delete(channel.id)
  for (const emoji of cache.emojis.group(guildId)) cache.emojis.delete(emoji.id)
  for (const sticker of cache.stickers.group(guildId)) cache.stickers.delete(sticker.id)
  for (const member of cache.members.group(guildId)) {
    cache.members.delete(guildUserKey(member.guildId, member.userId))
  }
  for (const presence of cache.presences.group(guildId)) {
    cache.presences.delete(guildUserKey(presence.guildId, presence.userId))
  }
  for (const state of cache.voiceStates.group(guildId)) {
    cache.voiceStates.delete(guildUserKey(state.guildId, state.userId))
  }

  // Grouped by parent channel, not by guild, so these are found by the field instead.
  for (const thread of [...cache.threads.values()]) {
    if (thread.guildId === guildId) cache.threads.delete(thread.id)
  }
  for (const message of [...cache.messages.values()]) {
    if (message.guildId === guildId) cache.messages.delete(message.id)
  }
}

/**
 * Drops everything cached for a channel that is gone.
 *
 * @param cache - The registry to evict from.
 * @param channelId - The channel that is gone.
 *
 * @remarks
 * The same problem as {@link evictGuild} one level down: a deleted channel's messages and the
 * threads hanging off it are unreachable the moment it goes, because every dispatch that could
 * name them is about a channel that no longer exists.
 *
 * Both are a plain `group()` call here, unlike in `evictGuild` — `messages` groups by channel
 * and `threads` group by their parent channel, so this is exactly the key both indexes use.
 *
 * A thread's own messages are handled by recursing, because a thread is a channel: its
 * messages are grouped under the thread's ID, not the parent's.
 */
export function evictChannel(cache: CacheRegistry, channelId: Snowflake): void {
  cache.channels.delete(channelId)

  for (const thread of cache.threads.group(channelId)) evictChannel(cache, thread.id)
  cache.threads.delete(channelId)

  for (const message of cache.messages.group(channelId)) cache.messages.delete(message.id)
}

/**
 * Drops everything cached for a membership that has ended.
 *
 * @param cache - The registry to evict from.
 * @param guildId - The guild they left.
 * @param userId - Who left.
 *
 * @remarks
 * A presence and a voice state are per-membership, not per user — both are keyed
 * `guildId:userId` — so both die with the membership. Leaving them behind means
 * `voiceState(guild, user)` keeps reporting somebody as connected to a channel in a guild they
 * are no longer in.
 *
 * The user itself is kept, for the same reason {@link evictGuild} keeps it: they may still be
 * in other guilds, and a user is not guild-scoped.
 */
export function evictMember(cache: CacheRegistry, guildId: Snowflake, userId: Snowflake): void {
  const key = guildUserKey(guildId, userId)

  cache.members.delete(key)
  cache.presences.delete(key)
  cache.voiceStates.delete(key)
}
