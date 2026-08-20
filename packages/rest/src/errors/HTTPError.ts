/**
 * A transport-level failure, or a response Discord did not describe as an API error.
 *
 * @remarks
 * Distinct from {@link DiscordAPIError}: this means the request never reached a
 * meaningful conclusion — a 5xx, a gateway timeout, an HTML error page from
 * Cloudflare — so there is no Discord error code to branch on. These are the failures
 * worth retrying; a `DiscordAPIError` almost never is.
 */
export class HTTPError extends Error {
  /** The HTTP status code. */
  readonly status: number
  /** The HTTP method used. */
  readonly method: string
  /** The request path. */
  readonly path: string
  /** The raw response body, when one was readable. */
  readonly body: string | undefined

  /**
   * @param status - The HTTP status code.
   * @param statusText - The HTTP status text.
   * @param method - The HTTP method used.
   * @param path - The request path.
   * @param body - The raw response body, if readable.
   */
  constructor(status: number, statusText: string, method: string, path: string, body?: string) {
    super(`${String(status)} ${statusText} on ${method} ${path}`)
    this.name = 'HTTPError'
    this.status = status
    this.method = method
    this.path = path
    this.body = body
  }
}
