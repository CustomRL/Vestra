import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

/** A request the mock server received. */
export interface RecordedRequest {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  body: string
  at: number
}

/** A running mock Discord API. */
export interface MockDiscord {
  /** The base URL to point a `REST` instance at. */
  url: string
  /** Every request received, in order. */
  requests: RecordedRequest[]
  /** Shuts the server down. */
  close: () => Promise<void>
}

/**
 * Starts a throwaway HTTP server standing in for Discord.
 *
 * @param handler - Responds to each request. Receives the parsed body.
 * @returns The running server.
 *
 * @remarks
 * A real socket rather than a stubbed `fetch`, so the tests exercise header casing,
 * multipart encoding and status handling as they actually behave over the wire — the
 * layer where rate-limit bugs hide.
 */
export async function startMockDiscord(
  handler: (request: RecordedRequest, response: ServerResponse) => void,
): Promise<MockDiscord> {
  const requests: RecordedRequest[] = []

  const server: Server = createServer((incoming: IncomingMessage, response) => {
    const chunks: Buffer[] = []
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk))
    incoming.on('end', () => {
      const recorded: RecordedRequest = {
        method: incoming.method ?? 'GET',
        url: incoming.url ?? '/',
        headers: incoming.headers,
        body: Buffer.concat(chunks).toString('utf8'),
        at: Date.now(),
      }
      requests.push(recorded)
      handler(recorded, response)
    })
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    requests,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    },
  }
}

/** Sends a JSON response with optional extra headers. */
export function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, { 'content-type': 'application/json', ...headers })
  response.end(payload)
}

/**
 * Rate-limit headers as Discord formats them.
 *
 * @param options - The bucket state to report.
 * @returns Headers to merge into a response.
 */
export function rateLimitHeaders(options: {
  bucket: string
  limit: number
  remaining: number
  resetAfterSeconds: number
}): Record<string, string> {
  return {
    'x-ratelimit-bucket': options.bucket,
    'x-ratelimit-limit': String(options.limit),
    'x-ratelimit-remaining': String(options.remaining),
    'x-ratelimit-reset-after': options.resetAfterSeconds.toFixed(3),
    'x-ratelimit-reset': ((Date.now() + options.resetAfterSeconds * 1000) / 1000).toFixed(3),
  }
}

/**
 * A server that enforces a real token-bucket limit and records every violation.
 *
 * @param options - The allowance to enforce.
 * @returns The mock server, plus the list of violations observed.
 *
 * @remarks
 * This is the point of the exercise: rather than asserting that Vestra *parsed* headers,
 * it asserts that Vestra never actually exceeded the allowance those headers described.
 */
export async function startRateLimitedDiscord(options: {
  limit: number
  windowMs: number
}): Promise<MockDiscord & { violations: string[] }> {
  const violations: string[] = []
  const windows = new Map<string, { count: number; resetAt: number }>()

  const mock = await startMockDiscord((request, response) => {
    // Bucket by path, which is what Discord does for these routes.
    const bucket = request.url.split('?')[0] ?? request.url
    const now = Date.now()

    let state = windows.get(bucket)
    if (state === undefined || now >= state.resetAt) {
      state = { count: 0, resetAt: now + options.windowMs }
      windows.set(bucket, state)
    }

    state.count += 1

    if (state.count > options.limit) {
      violations.push(
        `${request.method} ${bucket}: request ${String(state.count)} exceeded a limit of ` +
          `${String(options.limit)} per ${String(options.windowMs)}ms`,
      )
      const retryAfter = (state.resetAt - now) / 1000
      json(
        response,
        429,
        { message: 'You are being rate limited.', retry_after: retryAfter, global: false },
        {
          ...rateLimitHeaders({
            bucket,
            limit: options.limit,
            remaining: 0,
            resetAfterSeconds: retryAfter,
          }),
          'x-ratelimit-scope': 'user',
        },
      )
      return
    }

    json(
      response,
      200,
      { ok: true, n: state.count },
      rateLimitHeaders({
        bucket,
        limit: options.limit,
        remaining: options.limit - state.count,
        resetAfterSeconds: (state.resetAt - now) / 1000,
      }),
    )
  })

  return { ...mock, violations }
}
