import type { Snowflake } from '@vestra/types'

/**
 * Composite cache keys.
 *
 * @remarks
 * Some scopes are not keyed by a single snowflake. A member is (guild, user), and so is a
 * presence and a voice state — the same user in two guilds is two entries, because their
 * roles, nickname and presence differ per guild.
 *
 * `:` is safe as a separator because a Discord snowflake is a decimal digit string and
 * nothing else: `Snowflake` is a `string` populated only from Discord IDs, so no component
 * can contain one and no two distinct pairs can collide.
 *
 * The string allocation per composite-key read is real and unmeasured — see
 * `docs/design/phase-4-core.md` §8-D3. The alternative, nested maps, does not fit a flat
 * adapter interface and would make a remote adapter's key space awkward.
 */

/** The separator between components of a composite key. */
const SEPARATOR = ':'

/**
 * The key for a guild-scoped entry about a user.
 *
 * @param guildId - The guild.
 * @param userId - The user.
 * @returns The composite key.
 *
 * @remarks
 * Shared by members, presences and voice states, which are all keyed the same way. Guild
 * first, so that keys for one guild sort together — which costs nothing and helps anyone
 * reading a dump of the cache.
 */
export function guildUserKey(guildId: Snowflake, userId: Snowflake): string {
  return `${guildId}${SEPARATOR}${userId}`
}

/**
 * Splits a composite guild-user key.
 *
 * @param key - The key to split.
 * @returns The two components, or `undefined` if it is not a composite key.
 */
export function parseGuildUserKey(
  key: string,
): { guildId: Snowflake; userId: Snowflake } | undefined {
  const separator = key.indexOf(SEPARATOR)
  if (separator === -1) return undefined

  return {
    guildId: key.slice(0, separator),
    userId: key.slice(separator + 1),
  }
}
