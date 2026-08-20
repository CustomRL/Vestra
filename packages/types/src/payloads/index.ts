/**
 * Discord API object shapes.
 *
 * @remarks
 * Field names mirror the wire format exactly, which means `snake_case`. Conversion to
 * `camelCase` happens in `@vestra/core` when raw payloads become structures — doing it
 * here would make these types a translation layer rather than a description.
 */

export * from './attachment.js'
export * from './audit-log.js'
export * from './auto-moderation.js'
export * from './channel.js'
export * from './component.js'
export * from './embed.js'
export * from './emoji.js'
export * from './guild.js'
export * from './integration.js'
export * from './member.js'
export * from './message-interaction.js'
export * from './message.js'
export * from './monetisation.js'
export * from './poll.js'
export * from './presence.js'
export * from './reaction.js'
export * from './role.js'
export * from './scheduled-event.js'
export * from './soundboard.js'
export * from './stage-instance.js'
export * from './sticker.js'
export * from './thread.js'
export * from './user.js'
export * from './webhook.js'
