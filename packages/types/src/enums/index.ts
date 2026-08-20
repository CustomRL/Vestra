/**
 * Enumerations.
 *
 * @remarks
 * `enum` is a compile error in this repository (`erasableSyntaxOnly`), so every
 * enumeration here is an `as const` object plus a derived union sharing its name. That
 * gives both `ChannelType.GuildText` at a value position and `ChannelType` at a type
 * position, without TypeScript's enum semantics.
 *
 * This directory and `../constants.ts` are the only parts of the package that emit
 * runtime code.
 */

export * from './audit-log.js'
export * from './auto-moderation.js'
export * from './channel.js'
export * from './component.js'
export * from './dispatch-events.js'
export * from './gateway.js'
export * from './guild.js'
export * from './integration.js'
export * from './interaction.js'
export * from './message.js'
export * from './monetisation.js'
export * from './permissions.js'
export * from './poll.js'
export * from './presence.js'
export * from './role.js'
export * from './scheduled-event.js'
export * from './sticker.js'
export * from './user.js'
