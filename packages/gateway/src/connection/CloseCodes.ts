import { GatewayCloseCodes, UnrecoverableGatewayCloseCodes } from '@vestra/types'

/**
 * What a shard should do after a socket closes.
 */
export const ShardCloseAction = {
  /** Reconnect and replay missed events with the existing session. */
  Resume: 'resume',
  /** Reconnect and start a new session. The old one is gone. */
  ReIdentify: 're-identify',
  /** Stop. Reconnecting cannot succeed. */
  Fatal: 'fatal',
} as const

/**
 * A close action.
 */
export type ShardCloseAction = (typeof ShardCloseAction)[keyof typeof ShardCloseAction]

/**
 * How Vestra responds to a close code.
 */
export interface CloseCodeVerdict {
  /** What to do next. */
  action: ShardCloseAction
  /** Whether the situation indicates a bug worth warning about loudly. */
  warn: boolean
  /** Why, in a form suitable for an error message. */
  reason: string
}

/**
 * Codes that mean the session must be discarded, though the shard may reconnect.
 */
const REQUIRES_NEW_SESSION = new Set<number>([
  GatewayCloseCodes.InvalidSeq,
  GatewayCloseCodes.SessionTimedOut,
  // Ambiguous: Discord's description covers both "sent a payload before identifying" and
  // "this session has been invalidated". Treating it as re-identify is the safe reading —
  // a wasted identify costs one session start, whereas a doomed resume loops.
  GatewayCloseCodes.NotAuthenticated,
])

/**
 * Codes that indicate a bug on this side rather than a transient condition.
 */
const CLIENT_BUG = new Set<number>([
  GatewayCloseCodes.UnknownOpcode,
  GatewayCloseCodes.DecodeError,
  GatewayCloseCodes.AlreadyAuthenticated,
])

/**
 * Decides what to do after a socket closes.
 *
 * @param code - The close code, or `undefined` when the socket died without one.
 * @returns The action to take, whether to warn, and why.
 *
 * @remarks
 * The fatal set is not duplicated here: it is
 * {@link @vestra/types#UnrecoverableGatewayCloseCodes}, which matches Discord's
 * documented `Reconnect: false` column exactly. Reconnecting on any of those is a loop
 * that can never succeed, and it presents to the user as a mysterious outage rather than
 * as "enable the MessageContent intent".
 *
 * Everything unrecognised resumes. A proxy or load balancer in front of Discord can emit
 * codes Discord never would, and degrading to a resume attempt is strictly better than
 * treating an unknown code as fatal.
 */
export function classifyCloseCode(code: number | undefined): CloseCodeVerdict {
  if (code === undefined) {
    // Every abnormal termination collapses to this: TCP reset, FIN without a close frame,
    // a non-101 handshake, connection refused. They cannot be told apart from the event,
    // so the shard uses its own context instead.
    return {
      action: ShardCloseAction.Resume,
      warn: false,
      reason: 'the connection ended without a close code',
    }
  }

  if ((UnrecoverableGatewayCloseCodes as readonly number[]).includes(code)) {
    return {
      action: ShardCloseAction.Fatal,
      warn: true,
      reason: fatalExplanation(code),
    }
  }

  if (REQUIRES_NEW_SESSION.has(code)) {
    return {
      action: ShardCloseAction.ReIdentify,
      warn: code === GatewayCloseCodes.NotAuthenticated,
      reason:
        code === GatewayCloseCodes.NotAuthenticated
          ? 'the gateway reported the session was not authenticated, which is ambiguous ' +
            'between a client bug and an invalidated session'
          : 'the session can no longer be resumed',
    }
  }

  if (CLIENT_BUG.has(code)) {
    return {
      action: ShardCloseAction.Resume,
      warn: true,
      reason: `the gateway rejected a payload (${String(code)}), which indicates a bug in Vestra`,
    }
  }

  if (code === GatewayCloseCodes.RateLimited) {
    return {
      action: ShardCloseAction.Resume,
      warn: true,
      reason: 'payloads were sent too quickly; backing off before resuming',
    }
  }

  // A 1000 or 1001 arriving *from* Discord is undocumented. The session is almost
  // certainly gone, so identify afresh rather than resuming into nothing.
  if (code === 1000 || code === 1001) {
    return {
      action: ShardCloseAction.ReIdentify,
      warn: false,
      reason: `the gateway closed normally (${String(code)}), so the session was discarded`,
    }
  }

  return {
    action: ShardCloseAction.Resume,
    warn: false,
    reason: `the connection closed with an unrecognised code (${String(code)})`,
  }
}

/**
 * A message explaining a fatal close in terms of what the user must change.
 */
function fatalExplanation(code: number): string {
  switch (code) {
    case GatewayCloseCodes.AuthenticationFailed:
      return 'the token was rejected. Check it has not been regenerated or revoked.'
    case GatewayCloseCodes.InvalidShard:
      return 'the shard id or count was invalid for this application.'
    case GatewayCloseCodes.ShardingRequired:
      return 'this bot is in too many guilds for one shard and must be sharded.'
    case GatewayCloseCodes.InvalidAPIVersion:
      return 'the gateway rejected the API version.'
    case GatewayCloseCodes.InvalidIntents:
      return 'the intents bit set was malformed.'
    case GatewayCloseCodes.DisallowedIntents:
      return (
        'the application is not approved for one of the requested privileged intents. ' +
        'Enable them in the Developer Portal, or stop requesting them.'
      )
    default:
      return `the gateway closed with an unrecoverable code (${String(code)}).`
  }
}

/**
 * Close codes a client is permitted to send.
 *
 * @remarks
 * Only 1000 and 3000-4999 are valid. Node's `WebSocket.close()` throws
 * `DOMException: invalid code` for anything else — including 1001 and 1006, which are
 * plausible-looking and would otherwise be passed straight through from a received close.
 */
export function assertSendableCloseCode(code: number): number {
  if (code === 1000) return code
  if (Number.isInteger(code) && code >= 3000 && code <= 4999) return code
  throw new RangeError(
    `Close code ${String(code)} cannot be sent. Only 1000 and 3000-4999 are permitted; ` +
      'a received code must never be echoed back directly.',
  )
}

/**
 * The code sent when deliberately shutting a shard down for good.
 *
 * @remarks
 * Invalidates the session, so the bot appears offline promptly rather than lingering.
 */
export const CLOSE_PERMANENT = 1000

/**
 * The code sent for every other close.
 *
 * @remarks
 * Leaves the session resumable, which is what makes a reconnect cheap.
 */
export const CLOSE_RESUMABLE = 4000
