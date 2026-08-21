/**
 * The cache layer: policy, the adapter contract, and the two adapters core ships.
 *
 * @remarks
 * See ADR 4 for why caching is opt-in per scope, and `docs/design/phase-4-core.md` §4.9
 * to §4.11 for the design inside that decision.
 */

export {
  CachePolicyError,
  resolveCachePolicy,
  type CacheOption,
  type CachePolicy,
  type ResolvedCachePolicy,
} from './CachePolicy.js'
export { CacheIndex } from './CacheIndex.js'
export {
  CacheRegistry,
  DefaultCacheOptions,
  type CacheOptions,
  type CacheValue,
  type CacheValueMap,
  type AnyCacheStore,
  type CachedScope,
} from './CacheRegistry.js'
export { guildUserKey, parseGuildUserKey } from './CacheKeys.js'
export { CacheScope, CacheScopes } from './CacheScopes.js'
export { CacheStore, type CacheStoreOptions } from './CacheStore.js'
export { CacheSweeper } from './CacheSweeper.js'
export { MemoryCacheAdapter } from './MemoryCacheAdapter.js'
export { NullCacheAdapter } from './NullCacheAdapter.js'
export type {
  AsyncCacheSource,
  CacheAdapter,
  CacheAdapterFactory,
  CacheCodec,
  CacheScopeContext,
} from './CacheAdapter.js'
export { evictGuild } from './evictGuild.js'
