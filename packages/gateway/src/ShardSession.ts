import type { SessionState, SessionStore } from './session/SessionStore.js'

/**
 * Tracks what a shard needs in order to resume, and keeps the store in step.
 *
 * @remarks
 * Split out of `Shard` because resumability has its own invariant, and it is one worth
 * isolating: a session is resumable only when all three of `sessionId`, `sequence` and
 * `resumeUrl` are present. Scattering that check across the state machine is how a shard
 * ends up sending a Resume it cannot complete, which Discord answers with a 4007 and a
 * lost session.
 */
export class ShardSession {
  readonly #store: SessionStore
  readonly #shardId: number

  #sessionId: string | null = null
  #sequence: number | null = null
  #resumeUrl: string | null = null
  #resumeAttempts = 0

  /**
   * @param store - Where session state is persisted.
   * @param shardId - The shard this session belongs to.
   */
  constructor(store: SessionStore, shardId: number) {
    this.#store = store
    this.#shardId = shardId
  }

  /** The session ID, if one has been established. */
  get sessionId(): string | null {
    return this.#sessionId
  }

  /** The last sequence number received on a dispatch. */
  get sequence(): number | null {
    return this.#sequence
  }

  /** The URL to reconnect to when resuming. */
  get resumeUrl(): string | null {
    return this.#resumeUrl
  }

  /** How many consecutive resume attempts have been made. */
  get resumeAttempts(): number {
    return this.#resumeAttempts
  }

  /**
   * Whether a resume is possible.
   *
   * @remarks
   * All three fields are required. A resume missing any of them cannot succeed.
   */
  get resumable(): boolean {
    return this.#sessionId !== null && this.#sequence !== null && this.#resumeUrl !== null
  }

  /**
   * Advances the sequence number.
   *
   * @param sequence - The `s` field of a dispatch.
   *
   * @remarks
   * Only dispatches carry a meaningful `s`. Control frames send `null`, and letting one
   * through turns a resumable session into a 4007 on the next resume.
   */
  advance(sequence: number): void {
    this.#sequence = sequence
  }

  /**
   * Loads any persisted session for this shard.
   *
   * @remarks
   * Does nothing if a session is already held in memory, so a reconnect never overwrites
   * live state with a stale record.
   */
  async load(): Promise<void> {
    if (this.#sessionId !== null) return
    const stored = await this.#store.get(this.#shardId)
    if (stored === undefined) return
    this.#sessionId = stored.sessionId
    this.#sequence = stored.sequence
    this.#resumeUrl = stored.resumeUrl
  }

  /**
   * Records a newly established session.
   *
   * @param sessionId - The session ID from READY.
   * @param resumeUrl - The resume URL from READY.
   * @param sequence - The sequence number of the READY dispatch.
   */
  establish(sessionId: string, resumeUrl: string, sequence: number): void {
    this.#sessionId = sessionId
    this.#resumeUrl = resumeUrl
    this.#sequence = sequence
    this.#resumeAttempts = 0
    void this.#store.set(this.#shardId, { sessionId, sequence, resumeUrl })
  }

  /**
   * Persists the current state so a later process can resume.
   */
  async persist(): Promise<void> {
    if (this.#sessionId === null || this.#resumeUrl === null) return
    await this.#store.set(this.#shardId, {
      sessionId: this.#sessionId,
      sequence: this.#sequence ?? 0,
      resumeUrl: this.#resumeUrl,
    })
  }

  /**
   * Reads the current state, or `undefined` if it is not resumable.
   */
  snapshot(): SessionState | undefined {
    const sessionId = this.#sessionId
    const sequence = this.#sequence
    const resumeUrl = this.#resumeUrl
    if (sessionId === null || sequence === null || resumeUrl === null) return undefined
    return { sessionId, sequence, resumeUrl }
  }

  /** Records that a resume is being attempted. */
  noteResumeAttempt(): void {
    this.#resumeAttempts += 1
  }

  /** Records that a resume or identify succeeded. */
  noteSuccess(): void {
    this.#resumeAttempts = 0
  }

  /**
   * Discards the session so the next connection identifies afresh.
   */
  async forget(): Promise<void> {
    this.#sessionId = null
    this.#sequence = null
    this.#resumeUrl = null
    this.#resumeAttempts = 0
    await this.#store.delete(this.#shardId)
  }
}
