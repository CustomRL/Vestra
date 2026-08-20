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

export * from './channel.js'
export * from './component.js'
export * from './dispatch-events.js'
export * from './gateway.js'
export * from './guild.js'
export * from './interaction.js'
export * from './message.js'
export * from './permissions.js'
export * from './role.js'
export * from './user.js'
