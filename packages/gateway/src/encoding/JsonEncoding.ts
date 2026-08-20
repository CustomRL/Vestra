import type { GatewayReceivePayload, GatewaySendPayload } from '@vestra/types'
import type { Encoding } from './Encoding.js'

/**
 * JSON encoding, the default.
 */
export class JsonEncoding implements Encoding {
  /** The value for the gateway URL's `encoding` parameter. */
  readonly query = 'json'

  /**
   * Parses an incoming payload.
   *
   * @param data - The raw payload. Valid only for the duration of this call.
   * @returns The parsed payload.
   * @throws If the payload is not valid JSON.
   *
   * @remarks
   * `Buffer.toString('utf8')` rather than a `TextDecoder`: it is faster for the one-shot
   * case and avoids retaining the buffer, which the borrow contract forbids.
   */
  decode(data: Buffer | string): GatewayReceivePayload {
    const text = typeof data === 'string' ? data : data.toString('utf8')
    return JSON.parse(text) as GatewayReceivePayload
  }

  /**
   * Serialises an outgoing payload.
   *
   * @param payload - The payload to send.
   * @returns The payload as JSON text.
   */
  encode(payload: GatewaySendPayload): string {
    return JSON.stringify(payload)
  }
}
