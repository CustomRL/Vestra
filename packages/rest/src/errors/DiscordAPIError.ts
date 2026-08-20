/**
 * The body Discord returns for a 4xx it considers an API error.
 */
export interface DiscordErrorData {
  /** Discord's numeric error code, distinct from the HTTP status. */
  code: number
  /** A human-readable message. */
  message: string
  /** Per-field validation detail, present on most 400 responses. */
  errors?: unknown
}

/**
 * An error Discord described in the response body.
 *
 * @remarks
 * These carry a `code` that is far more specific than the HTTP status — `50013` is
 * "Missing Permissions" whatever the status happens to be — so branch on `code`, never
 * on `status`.
 *
 * Almost never worth retrying: the request was understood and rejected, so sending it
 * again produces the same rejection while consuming invalid-request budget.
 */
export class DiscordAPIError extends Error {
  /** Discord's numeric error code. */
  readonly code: number
  /** The HTTP status code. */
  readonly status: number
  /** The HTTP method used. */
  readonly method: string
  /** The request path. */
  readonly path: string
  /** The raw error body. */
  readonly raw: DiscordErrorData
  /** Per-field validation detail, when Discord supplied any. */
  readonly errors: unknown

  /**
   * @param raw - The parsed error body.
   * @param status - The HTTP status code.
   * @param method - The HTTP method used.
   * @param path - The request path.
   */
  constructor(raw: DiscordErrorData, status: number, method: string, path: string) {
    super(`${method} ${path} failed: ${raw.message} (code ${String(raw.code)})`)
    this.name = 'DiscordAPIError'
    this.code = raw.code
    this.status = status
    this.method = method
    this.path = path
    this.raw = raw
    this.errors = raw.errors
  }

  /**
   * Whether a body looks like a Discord API error rather than an arbitrary payload.
   *
   * @param body - A parsed response body.
   * @returns `true` when the body carries Discord's error shape.
   */
  static isErrorBody(body: unknown): body is DiscordErrorData {
    return (
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      typeof body.code === 'number' &&
      'message' in body &&
      typeof body.message === 'string'
    )
  }
}
