/**
 * Runtime constants.
 *
 * @remarks
 * This file and `src/enums/` are the only parts of `@vestra/types` that emit runtime
 * code. Everything else erases completely.
 */

/**
 * The Discord API version these typings describe.
 *
 * @remarks
 * Bumping this is a breaking change for every downstream package, so it lives here
 * rather than being repeated in `@vestra/rest` and `@vestra/gateway`.
 */
export const APIVersion = '10'

/**
 * The first millisecond of 2015 UTC, the epoch snowflake timestamps are offset from.
 */
export const DiscordEpoch = 1_420_070_400_000
