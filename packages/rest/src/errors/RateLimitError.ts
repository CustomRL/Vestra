/**
 * Thrown when a request would have to wait longer than the configured ceiling.
 *
 * @remarks
 * Only raised when `rateLimitTimeout` is set. The default is to wait indefinitely, which
 * is right for a bot that should simply be slow rather than lossy — but a request served
 * behind a web request often prefers to fail fast, and silently blocking for ten minutes
 * is worse than an error.
 */
export class RateLimitError extends Error {
  /** How long the request would have had to wait, in milliseconds. */
  readonly timeToReset: number
  /** The bucket that would have delayed the request. */
  readonly bucket: string
  /** The HTTP method used. */
  readonly method: string
  /** The request path. */
  readonly path: string
  /** Whether the limit was the global limit rather than a per-route bucket. */
  readonly global: boolean

  /**
   * @param options - Details of the limit that was hit.
   */
  constructor(options: {
    timeToReset: number
    bucket: string
    method: string
    path: string
    global: boolean
  }) {
    super(
      `Rate limited on ${options.method} ${options.path}: would wait ` +
        `${String(options.timeToReset)}ms${options.global ? ' (global)' : ''}`,
    )
    this.name = 'RateLimitError'
    this.timeToReset = options.timeToReset
    this.bucket = options.bucket
    this.method = options.method
    this.path = options.path
    this.global = options.global
  }
}
