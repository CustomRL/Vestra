/**
 * Works out which shard a guild's traffic belongs to.
 *
 * @param guildId - The guild's snowflake.
 * @param shardCount - The total shard count.
 * @returns The shard index.
 *
 * @remarks
 * Discord's routing formula: `(guild_id >> 22) % num_shards`. The shift discards the
 * worker, process and increment bits, leaving the timestamp — so guilds distribute by
 * creation time rather than uniformly, and a shard can legitimately hold noticeably more
 * guilds than its neighbours.
 *
 * This is the one place in the gateway that converts a snowflake to a `bigint`, which the
 * hot-path rules otherwise forbid. It is called only when routing an outbound command,
 * never per inbound dispatch; putting it on the receive path would need a benchmark first.
 */
export function shardIdForGuild(guildId: string, shardCount: number): number {
  return Number(BigInt(guildId) >> 22n) % shardCount
}

/**
 * Whether a shard receives events that have no guild.
 *
 * @param shardId - The shard to test.
 * @returns `true` for shard 0.
 *
 * @remarks
 * Direct messages, entitlements and subscription events all arrive on shard 0, because
 * they have no guild to route by. Shards are therefore **not** interchangeable, and DM
 * handling must never be round-robined across them.
 */
export function receivesGuildlessEvents(shardId: number): boolean {
  return shardId === 0
}
