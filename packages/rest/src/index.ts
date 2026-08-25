/**
 * Discord REST client: bucket-accurate rate limiting over native `fetch`.
 *
 * @packageDocumentation
 */

export { REST, type InternalRequest, type RequestMethod, type RESTEvents } from './REST.js'
export {
  DefaultRESTOptions,
  routeBases,
  type RawFile,
  type RequestData,
  type ResolvedRESTOptions,
  type RESTOptions,
} from './RESTOptions.js'

export { DiscordAPIError, type DiscordErrorData } from './errors/DiscordAPIError.js'
export { HTTPError } from './errors/HTTPError.js'
export { RateLimitError } from './errors/RateLimitError.js'

export { AsyncQueue } from './ratelimit/AsyncQueue.js'
export { BucketRegistry, type RouteIdentity } from './ratelimit/BucketRegistry.js'
export { GlobalLimiter } from './ratelimit/GlobalLimiter.js'
export {
  CLOUDFLARE_BAN_THRESHOLD,
  InvalidRequestTracker,
} from './ratelimit/InvalidRequestTracker.js'
export {
  SequentialHandler,
  type HandlerContext,
  type RateLimitInfo,
} from './ratelimit/SequentialHandler.js'

export { buildFormData } from './files/FormDataBuilder.js'

export { ApplicationCommandRoutes } from './routes/application-commands.js'
export { ChannelRoutes } from './routes/channels.js'
export type { MessageOptions, RouteOptions } from './routes/options.js'
export { GatewayRoutes } from './routes/gateway.js'
export { GuildRoutes } from './routes/guilds.js'
export { InteractionRoutes } from './routes/interactions.js'
export { EmojiRoutes } from './routes/emojis.js'
export { InviteRoutes } from './routes/invites.js'
export { StickerRoutes } from './routes/stickers.js'
export { UserRoutes } from './routes/users.js'
export { WebhookRoutes } from './routes/webhooks.js'
