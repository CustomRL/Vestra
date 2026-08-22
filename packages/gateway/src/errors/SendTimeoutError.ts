import { GatewayError } from './GatewayError.js'

/**
 * Thrown when a send waits longer than the configured ceiling.
 */
export class SendTimeoutError extends GatewayError {
  /**
   * @param waitMs - How long the send would have had to wait.
   */
  constructor(waitMs: number) {
    super(`Sending would have waited ${String(waitMs)}ms for the gateway command allowance.`)
    this.name = 'SendTimeoutError'
  }
}
