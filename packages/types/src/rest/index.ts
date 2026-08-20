/**
 * REST request bodies, query strings and results.
 *
 * @remarks
 * Named `REST{Method}API{Resource}{JSONBody | Query | Result}` throughout, matching the
 * convention the wider Discord TypeScript ecosystem already uses — familiarity is worth
 * more here than a marginally tidier scheme of our own.
 *
 * Coverage currently follows the payloads that are modelled. `@vestra/rest` exposes a
 * typed escape hatch for anything not yet described here, so a missing body is never a
 * blocker.
 */

export * from './channel.js'
export * from './gateway.js'
export * from './guild.js'
export * from './user.js'
