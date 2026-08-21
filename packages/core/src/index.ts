/**
 * The Vestra client: structures, pluggable cache and typed events.
 *
 * @remarks
 * Being built out in Phase 4. The cache layer is here; the client, structures and event
 * handlers follow. Until then this package also re-exports the layers beneath it, so that
 * `vestra` stays a single usable install.
 *
 * @packageDocumentation
 */

export * from './cache/index.js'
export { Client } from './Client.js'
export * from './ClientOptions.js'
export {
  presencePayload,
  resolvePresence,
  type ActivityOption,
  type PresenceOptions,
  type PresenceStatusOption,
} from './ClientPresence.js'
export * from './events/index.js'
export * from './permissions/index.js'
export * from './gateway/index.js'
export * from './structures/index.js'

export * from '@vestra/gateway'
export * from '@vestra/rest'
export * from '@vestra/types'
