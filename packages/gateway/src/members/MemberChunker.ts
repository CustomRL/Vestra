import { randomBytes } from 'node:crypto'
import {
  GatewayIntentBits,
  GatewayOpcodes,
  type APIGuildMember,
  type GatewayGuildMembersChunkDispatchData,
  type GatewayRateLimitedDispatchData,
  type GatewayRequestGuildMembersData,
  type Snowflake,
} from '@vestra/types'
import type { Timers } from '../util/Timers.js'

/**
 * The hard ceiling Discord places on a request nonce.
 *
 * @remarks
 * An over-long nonce is not rejected — it is *ignored*, and the resulting chunks arrive
 * with no nonce at all. The request can then never be correlated and the caller's promise
 * hangs forever, which is a singularly unhelpful failure. Hence the assertion at request
 * time.
 */
export const MAX_NONCE_BYTES = 32

/**
 * How long a guild must wait between requests for all of its members.
 */
const ALL_MEMBERS_INTERVAL_MS = 30_000

/**
 * What to fetch.
 */
export interface RequestGuildMembersOptions {
  /** The guild to fetch from. One guild per request. */
  guildId: Snowflake
  /** A username prefix to match. Mutually exclusive with `userIds`. */
  query?: string
  /** How many members to return, from 0 to 100. Required alongside `query`. */
  limit?: number
  /** Specific users to fetch, up to 100. Mutually exclusive with `query`. */
  userIds?: Snowflake[]
  /** Whether to include presences. Requires the `GuildPresences` intent. */
  presences?: boolean
  /** How long to wait before giving up, in milliseconds. */
  timeoutMs?: number
}

/**
 * Sends the request payload on the shard's connection.
 */
export type SendChunkRequest = (data: GatewayRequestGuildMembersData) => Promise<void>

interface Pending {
  members: APIGuildMember[]
  notFound: Snowflake[]
  resolve: (members: APIGuildMember[]) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Requests guild members over the gateway and reassembles the chunked reply.
 *
 * @remarks
 * Consider `GET /guilds/{id}/members` first. The REST route is bounded by an ordinary
 * rate-limit bucket that `@vestra/rest` already handles, and it is usually the faster path
 * for a multi-guild backfill. It does still need the `GuildMembers` privileged intent
 * enabled in the developer portal — HTTP restrictions are independent of gateway ones.
 *
 * The gateway route earns its place when members are needed for a guild already streaming
 * on an open connection, or when presences are wanted alongside them.
 */
export class MemberChunker {
  readonly #send: SendChunkRequest
  readonly #timers: Timers
  readonly #intents: number | undefined
  readonly #pending = new Map<string, Pending>()
  /** When each guild may next be asked for all of its members. */
  readonly #allMembersGate = new Map<Snowflake, number>()

  /**
   * @param send - Sends the request payload.
   * @param timers - Timer sources.
   * @param intents - The shard's intents, so requests that could never be answered are
   *                  rejected before they are sent. Omitting it skips those checks.
   */
  constructor(send: SendChunkRequest, timers: Timers, intents?: number) {
    this.#send = send
    this.#timers = timers
    this.#intents = intents
  }

  /**
   * Rejects a request the connection's intents cannot satisfy.
   *
   * @param wantsEveryone - Whether every member was asked for.
   * @param presences - Whether presences were asked for.
   *
   * @remarks
   * Discord does not answer these and does not say why: the request is dropped and the
   * caller waits out the timeout, whose message can only guess at the cause. Checking the
   * bit the shard identified with turns that into an immediate, accurate error.
   *
   * Enabling a privileged intent in the developer portal is only half of it — the identify
   * payload still has to carry the bit — and that distinction is exactly what the silent
   * drop hides.
   */
  #assertIntents(wantsEveryone: boolean, presences: boolean): void {
    const intents = this.#intents
    if (intents === undefined) return

    if (wantsEveryone && (intents & GatewayIntentBits.GuildMembers) === 0) {
      throw new Error(
        'Requesting every member needs the GuildMembers intent, which this connection did ' +
          'not identify with. Enabling it in the developer portal is not enough on its own: ' +
          'the bit has to be in the intents passed to the shard. Without it Discord drops ' +
          'the request silently.',
      )
    }

    if (presences && (intents & GatewayIntentBits.GuildPresences) === 0) {
      throw new Error(
        'Requesting presences needs the GuildPresences intent, which this connection did ' +
          'not identify with. Enabling it in the developer portal is not enough on its own: ' +
          'the bit has to be in the intents passed to the shard.',
      )
    }
  }

  /** How many requests are awaiting chunks. */
  get pendingCount(): number {
    return this.#pending.size
  }

  /**
   * Requests members and resolves once every chunk has arrived.
   *
   * @param options - What to fetch.
   * @returns The members.
   * @throws If the request is malformed, or gated by the per-guild interval.
   */
  async request(options: RequestGuildMembersOptions): Promise<APIGuildMember[]> {
    const wantsEveryone = options.userIds === undefined && (options.query ?? '') === ''

    if (options.query !== undefined && options.userIds !== undefined) {
      throw new TypeError('Pass either `query` or `userIds`, never both.')
    }
    if ((options.userIds?.length ?? 0) > 100) {
      throw new RangeError('`userIds` accepts at most 100 ids per request.')
    }

    // Before the per-guild gate, so an impossible request does not consume the allowance.
    this.#assertIntents(wantsEveryone, options.presences ?? false)

    if (wantsEveryone) {
      // Discord limits the all-members form to one request per guild per bot every 30
      // seconds. Gating locally turns a silent RATE_LIMITED dispatch into an immediate,
      // attributable error.
      const gatedUntil = this.#allMembersGate.get(options.guildId) ?? 0
      const now = this.#timers.now()
      if (gatedUntil > now) {
        throw new Error(
          `Members for guild ${options.guildId} were requested ${String(
            Math.ceil((ALL_MEMBERS_INTERVAL_MS - (gatedUntil - now)) / 1000),
          )}s ago. Requesting every member is limited to once per guild per 30 seconds.`,
        )
      }
      this.#allMembersGate.set(options.guildId, now + ALL_MEMBERS_INTERVAL_MS)
    }

    const nonce = randomBytes(8).toString('hex')
    if (Buffer.byteLength(nonce, 'utf8') > MAX_NONCE_BYTES) {
      throw new RangeError(`A request nonce must be at most ${String(MAX_NONCE_BYTES)} bytes.`)
    }

    const data: GatewayRequestGuildMembersData = {
      guild_id: options.guildId,
      nonce,
      ...(options.userIds === undefined
        ? { query: options.query ?? '', limit: options.limit ?? 0 }
        : { user_ids: options.userIds }),
      ...(options.presences === undefined ? {} : { presences: options.presences }),
    }

    const members = new Promise<APIGuildMember[]>((resolve, reject) => {
      const timer = this.#timers.setTimeout(() => {
        this.#pending.delete(nonce)
        reject(
          new Error(
            `Timed out waiting for member chunks for guild ${options.guildId}. The request ` +
              'may have been silently dropped, or the GuildMembers intent may be missing.',
          ),
        )
      }, options.timeoutMs ?? 60_000)

      this.#pending.set(nonce, { members: [], notFound: [], resolve, reject, timer })
    })

    try {
      await this.#send(data)
    } catch (error) {
      // **The request never left the process, so nothing about it may outlive this throw.**
      // `request()` rejects with the send error and never reaches the `await` below, so the
      // pending entry stayed registered with its sixty-second timer armed — and when that
      // fired it rejected a promise nobody was awaiting, which Node reports as an unhandled
      // rejection and, by default, exits on. A minute after a failed member request, the
      // process died.
      //
      // Reachable through the public API without doing anything unusual: `Shard.send` throws
      // whenever the shard is reconnecting, and `Client.fetchMembers` checks only that a
      // bridge exists, never the shard's state.
      const entry = this.#pending.get(nonce)
      if (entry !== undefined) {
        this.#timers.clearTimeout(entry.timer)
        this.#pending.delete(nonce)
      }
      // Nothing will settle it now; make certain it cannot surface later either.
      members.catch(() => undefined)

      // The allowance is a courtesy limit on requests Discord actually received. Keeping it
      // spent here meant one failed send locked the guild out for thirty seconds.
      if (wantsEveryone) this.#allMembersGate.delete(options.guildId)

      throw error
    }

    return await members
  }

  /**
   * Records an arriving chunk.
   *
   * @param data - The chunk payload.
   *
   * @remarks
   * Completion is decided by `chunk_index === chunk_count - 1`, never by counting chunks
   * received. Chunks from concurrent requests interleave on one socket, so a running count
   * resolves the wrong request.
   */
  handleChunk(data: GatewayGuildMembersChunkDispatchData): void {
    if (data.nonce === undefined) return
    const pending = this.#pending.get(data.nonce)
    if (pending === undefined) return

    pending.members.push(...data.members)
    if (data.not_found !== undefined) pending.notFound.push(...data.not_found)

    if (data.chunk_index === data.chunk_count - 1) {
      this.#timers.clearTimeout(pending.timer)
      this.#pending.delete(data.nonce)
      pending.resolve(pending.members)
    }
  }

  /**
   * Fails the request a rate-limit notice refers to.
   *
   * @param data - The `RATE_LIMITED` dispatch.
   */
  handleRateLimited(data: GatewayRateLimitedDispatchData): void {
    if (data.opcode !== GatewayOpcodes.RequestGuildMembers) return

    // retry_after is in SECONDS. Treating it as milliseconds turns a 30 second backoff
    // into 30 milliseconds and reproduces the limit immediately.
    const retryAfterMs = data.retry_after * 1000
    if (data.meta.guild_id !== undefined) {
      this.#allMembersGate.set(data.meta.guild_id, this.#timers.now() + retryAfterMs)
    }

    const nonce = data.meta.nonce
    if (nonce === undefined) return
    const pending = this.#pending.get(nonce)
    if (pending === undefined) return

    this.#timers.clearTimeout(pending.timer)
    this.#pending.delete(nonce)
    pending.reject(
      new Error(
        `The gateway rate limited a member request; retry in ${String(
          Math.ceil(retryAfterMs / 1000),
        )}s.`,
      ),
    )
  }

  /**
   * Fails every outstanding request.
   *
   * @param reason - Why they cannot complete.
   *
   * @remarks
   * Called on a fresh identify. Chunks belong to a session, so anything outstanding when
   * one ends will never arrive; leaving the promises pending would leak each callback and
   * its closure for the process lifetime.
   */
  reset(reason: Error): void {
    for (const pending of this.#pending.values()) {
      this.#timers.clearTimeout(pending.timer)
      pending.reject(reason)
    }
    this.#pending.clear()
  }
}
