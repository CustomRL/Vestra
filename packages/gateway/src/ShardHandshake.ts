import { GatewayOpcodes } from '@vestra/types'
import type { ResolvedShardOptions } from './GatewayOptions.js'
import type { ShardConnection } from './connection/ShardConnection.js'
import type { IdentifyThrottler } from './session/IdentifyThrottler.js'
import type { SessionState } from './session/SessionStore.js'

/**
 * How a connection introduces itself: a fresh login, or a claim on an existing session.
 */

/**
 * Sends the Identify payload, after waiting for the fleet's identify allowance.
 *
 * @param connection - The connection to send on.
 * @param options - Resolved shard options.
 * @param throttler - Gates identifies across the fleet, if one is in use.
 *
 * @remarks
 * The wait is the important part. Identify concurrency is enforced per token, so shards
 * across several processes must share a throttler; exceeding the limit invalidates
 * sessions and burns the daily session-start allowance.
 */
export async function sendIdentify(
  connection: ShardConnection,
  options: ResolvedShardOptions,
  throttler?: IdentifyThrottler,
): Promise<void> {
  await throttler?.waitForIdentify(options.shardId)
  if (connection.disposed) return

  await connection.send({
    op: GatewayOpcodes.Identify,
    d: {
      token: options.token,
      intents: options.intents,
      large_threshold: options.largeThreshold,
      shard: [options.shardId, options.shardCount],
      properties: { os: process.platform, browser: 'vestra', device: 'vestra' },
      ...(options.capabilities === 0 ? {} : { capabilities: options.capabilities }),
    },
  })
}

/**
 * Sends the Resume payload.
 *
 * @param connection - The connection to send on.
 * @param options - Resolved shard options.
 * @param session - The session being resumed.
 *
 * @remarks
 * The field is `seq`, not `s`. Sending the wrong key produces a 4007 and costs the
 * session, which is a needlessly obscure way to lose one.
 */
export async function sendResume(
  connection: ShardConnection,
  options: ResolvedShardOptions,
  session: SessionState,
): Promise<void> {
  if (connection.disposed) return
  await connection.send({
    op: GatewayOpcodes.Resume,
    d: { token: options.token, session_id: session.sessionId, seq: session.sequence },
  })
}
