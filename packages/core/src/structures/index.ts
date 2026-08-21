/**
 * Structures: the camelCase, client-aware forms of Discord's payloads.
 *
 * @remarks
 * See `docs/design/phase-4-core.md` §4.15 to §4.17 for the conversion rule, the fixed
 * field order these rely on, and what ships as a structure versus what stays a payload.
 */

export { Base } from './Base.js'
export { ClientUser } from './ClientUser.js'
export { Guild, type APIGuildLike } from './Guild.js'
export * from './channels/index.js'
export { GuildMember } from './GuildMember.js'
export { Message, type CompleteMessage } from './Message.js'
export { Role, type RoleColors } from './Role.js'
export { User } from './User.js'
export { snowflakeDate, snowflakeTimestamp } from './snowflake.js'
