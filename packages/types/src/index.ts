/**
 * Zero-dependency typings for the Discord API.
 *
 * Nothing in this package may import from another Vestra package — it sits at the
 * root of the graph so that a consumer can depend on the typings alone.
 *
 * @packageDocumentation
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
 * A Discord snowflake: a 64-bit ID transported as a decimal string.
 *
 * @remarks
 * Kept as `string` rather than `bigint` deliberately. Snowflakes are overwhelmingly
 * used as map keys and compared for equality, never arithmetic, and strings avoid
 * both the conversion cost on every payload and the JSON serialisation trap.
 */
export type Snowflake = string
