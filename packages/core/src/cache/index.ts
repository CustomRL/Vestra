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
export { CacheScope, CacheScopes } from './CacheScopes.js'
export { MemoryCacheAdapter } from './MemoryCacheAdapter.js'
export { NullCacheAdapter } from './NullCacheAdapter.js'
export type {
  AsyncCacheSource,
  CacheAdapter,
  CacheAdapterFactory,
  CacheCodec,
  CacheScopeContext,
} from './CacheAdapter.js'
