import { DiscordEpoch } from '@vestra/types'
import type { Snowflake } from '@vestra/types'

/**
 * Reading the metadata Discord packs into an ID.
 *
 * @remarks
 * Free functions rather than getters on a base class, because not every structure has a
 * snowflake and the ones that do should not inherit a field they must lie about. See
 * {@link Base}.
 */

/** How far the timestamp is shifted within a snowflake. */
const TIMESTAMP_SHIFT = 22n

/**
 * When a snowflake was created.
 *
 * @param id - The snowflake.
 * @returns Epoch milliseconds.
 *
 * @remarks
 * Snowflakes are 64-bit and arrive as strings precisely because they do not survive
 * `Number` — IDs passed 2^53 in 2015, so parsing one as a number silently corrupts the low
 * bits. The arithmetic goes through `BigInt` and only the result, which is a millisecond
 * timestamp and comfortably inside the safe range, becomes a number.
 *
 * No validation: a malformed ID throws from `BigInt` with a clearer message than anything
 * this could add, and validating every ID on a hot path to catch a bug that would show up
 * immediately is not a trade worth making.
 */
export function snowflakeTimestamp(id: Snowflake): number {
  return Number((BigInt(id) >> TIMESTAMP_SHIFT) + BigInt(DiscordEpoch))
}

/**
 * When a snowflake was created, as a `Date`.
 *
 * @param id - The snowflake.
 * @returns The creation time.
 *
 * @remarks
 * Allocates. Structures expose this shape as a getter beside the raw value so that code
 * which never asks never pays — the same reasoning `globals.ts` gives for keeping
 * timestamps as strings.
 */
export function snowflakeDate(id: Snowflake): Date {
  return new Date(snowflakeTimestamp(id))
}
