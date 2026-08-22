/**
 * Everything needed to resume a session.
 */
export interface SessionState {
  /** The session ID from the READY payload. */
  sessionId: string
  /** The last sequence number received on a dispatch. */
  sequence: number
  /**
   * The URL to reconnect to when resuming.
   *
   * @remarks
   * Issued once in READY and never re-sent, not even on RESUMED. It points at a specific
   * gateway node, which is why resuming is bounded — if that node is what failed,
   * retrying it forever is a loop against a host that will never answer.
   */
  resumeUrl: string
}

/**
 * Persists session state so a process restart can resume rather than identify.
 *
 * @remarks
 * An interface because the useful implementations are external: a bot that redeploys
 * frequently saves a session start on every restart by keeping this in Redis, and
 * session starts are a daily-capped resource.
 */
export interface SessionStore {
  /**
   * Reads a shard's session.
   *
   * @param shardId - The shard to read.
   * @returns The session, or `undefined` if none is stored.
   */
  get: (shardId: number) => Promise<SessionState | undefined> | SessionState | undefined
  /**
   * Records a shard's session.
   *
   * @param shardId - The shard to record.
   * @param state - The session state.
   */
  set: (shardId: number, state: SessionState) => Promise<void> | void
  /**
   * Forgets a shard's session.
   *
   * @param shardId - The shard to forget.
   */
  delete: (shardId: number) => Promise<void> | void
}

/**
 * A session store held in memory.
 *
 * @remarks
 * The default. Sessions do not survive a process restart, so every start costs a session
 * start from the daily allowance.
 */
export class InMemorySessionStore implements SessionStore {
  readonly #sessions = new Map<number, SessionState>()

  /**
   * Reads a shard's session.
   *
   * @param shardId - The shard to read.
   * @returns The session, or `undefined` if none is stored.
   */
  get(shardId: number): SessionState | undefined {
    return this.#sessions.get(shardId)
  }

  /**
   * Records a shard's session.
   *
   * @param shardId - The shard to record.
   * @param state - The session state.
   */
  set(shardId: number, state: SessionState): void {
    this.#sessions.set(shardId, state)
  }

  /**
   * Forgets a shard's session.
   *
   * @param shardId - The shard to forget.
   */
  delete(shardId: number): void {
    this.#sessions.delete(shardId)
  }
}
