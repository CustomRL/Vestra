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

export * from './application-command.js'
export * from './channel.js'
export * from './emoji.js'
export * from './gateway.js'
export * from './guild.js'
export * from './interaction.js'
export * from './invite.js'
export * from './scheduled-event.js'
export * from './stage-instance.js'
export * from './sticker.js'
export * from './thread.js'
export * from './user.js'
export * from './webhook.js'
