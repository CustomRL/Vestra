/**
 * Primitive aliases shared by every payload in this package.
 *
 * These exist so that intent is visible at the point of use: `Snowflake` and
 * `ISO8601Timestamp` are both `string` on the wire, and conflating them is the kind of
 * mistake that survives review.
 */

/**
 * A Discord snowflake: a 64-bit ID transported as a decimal string.
 *
 * @remarks
 * Deliberately `string` rather than `bigint`. Snowflakes are used as map keys and
 * compared for equality, never for arithmetic; converting costs on every payload and
 * `bigint` does not survive `JSON.stringify`.
 */
export type Snowflake = string

/**
 * An ISO 8601 timestamp string, for example `2026-08-20T12:00:00.000000+00:00`.
 *
 * @remarks
 * Left as a string rather than parsed into a `Date`. Most timestamps on a payload are
 * never read, so parsing every one of them on arrival is wasted work in the hot path.
 */
export type ISO8601Timestamp = string

/**
 * A permission bit set, serialised by Discord as a decimal string.
 *
 * @remarks
 * The value exceeds `Number.MAX_SAFE_INTEGER`, so it must be parsed with `BigInt`
 * rather than `Number`. See `PermissionFlagsBits`.
 */
export type Permissions = string
