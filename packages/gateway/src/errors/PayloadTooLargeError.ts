import { GatewayError } from './GatewayError.js'

/**
 * The hard ceiling on a single gateway payload.
 *
 * @remarks
 * Exceeding it closes the connection with 4002.
 *
 * Lives beside the error rather than beside the queue that enforces it, so the message
 * can quote the limit without the error module importing the sender that throws it.
 */
export const MAX_PAYLOAD_BYTES = 4096

/**
 * Thrown when a payload is too large for the gateway to accept.
 */
export class PayloadTooLargeError extends GatewayError {
  /** The opcode of the rejected payload. */
  readonly opcode: number
  /** How large the payload was, in bytes. */
  readonly size: number

  /**
   * @param opcode - The opcode of the rejected payload.
   * @param size - The serialised size in bytes.
   */
  constructor(opcode: number, size: number) {
    super(
      `Gateway payload for opcode ${String(opcode)} is ${String(size)} bytes, past the ` +
        `${String(MAX_PAYLOAD_BYTES)} byte limit. Sending it would close the connection ` +
        'with code 4002. Split the request — a large `user_ids` array is the usual cause.',
    )
    this.name = 'PayloadTooLargeError'
    this.opcode = opcode
    this.size = size
  }
}
