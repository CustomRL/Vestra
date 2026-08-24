/**
 * Everything per-shard that core owns.
 *
 * @remarks
 * See `docs/design/phase-4-core.md` §4.3.
 */

export {
  ShardBridge,
  isConnected,
  type ShardBridgeHooks,
  type ShardBridgeOptions,
} from './ShardBridge.js'
