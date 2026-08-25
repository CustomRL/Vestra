import type { RawFile } from '../RESTOptions.js'

/**
 * What every route method accepts alongside its own arguments.
 *
 * @remarks
 * Its own module rather than a member of the first route file that needed it. Every route
 * class takes these, so importing them from `./channels.js` made eight unrelated files
 * depend on the channel routes for a type that has nothing to do with channels — and the
 * next route family would have made nine.
 */

/** Options accepted by every route method. */
export interface RouteOptions {
  /** A reason recorded in the guild's audit log. */
  reason?: string
  /** Aborts the request, including while it waits in a rate-limit queue. */
  signal?: AbortSignal
}

/** Options for a route that can carry uploads. */
export interface MessageOptions extends RouteOptions {
  /** Files to upload alongside the message. */
  files?: RawFile[]
}
