import { CoreError } from './CoreError.js'

/** Why a client operation was refused. */
export const ClientErrorCode = {
  /** The client was destroyed, and destroying is not reversible. */
  Destroyed: 'Destroyed',
  /** A shard the operation needs is not connected. */
  ShardUnavailable: 'ShardUnavailable',
  /** The operation needs the client to be logged in, and it is not. */
  NotReady: 'NotReady',
} as const

/** Why a client operation was refused. */
export type ClientErrorCode = (typeof ClientErrorCode)[keyof typeof ClientErrorCode]

/**
 * Thrown when the client itself refuses an operation.
 *
 * @remarks
 * **Carries a `code` rather than relying on the message.** A consumer deciding whether to
 * retry needs to tell "that shard is reconnecting, try again shortly" from "this client is
 * finished, building a new one is the only way forward" — and matching on message text is how
 * that check silently stops working the day somebody improves the wording.
 */
export class ClientError extends CoreError {
  /** Which refusal this is. */
  readonly code: ClientErrorCode

  /**
   * @param code - Which refusal this is.
   * @param message - What went wrong, and what to do instead.
   * @param options - Standard error options, including `cause`.
   */
  constructor(code: ClientErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ClientError'
    this.code = code
  }
}
