import type { GatewayReceivePayload, GatewaySendPayload } from '@vestra/types'

/**
 * Serialises and parses gateway payloads.
 *
 * @remarks
 * An interface with one implementation, which keeps the door open for ETF without
 * committing to it. ETF needs `erlpack`, a native module, so it cannot be the default
 * under ADR 1 — and with zstd-stream the wire-size gap is small enough that the native
 * build step is hard to justify.
 */
export interface Encoding {
  /** The value for the gateway URL's `encoding` parameter. */
  readonly query: string
  /**
   * Parses an incoming payload.
   *
   * @param data - The raw payload. Valid only for the duration of this call.
   * @returns The parsed payload.
   * @throws If the payload is malformed.
   */
  decode: (data: Buffer | string) => GatewayReceivePayload
  /**
   * Serialises an outgoing payload.
   *
   * @param payload - The payload to send.
   * @returns The wire representation.
   */
  encode: (payload: GatewaySendPayload) => string | Uint8Array
}
