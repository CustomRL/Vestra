import { GatewayError } from './GatewayError.js'

/**
 * Thrown when a shard cannot continue.
 */
export class FatalGatewayError extends GatewayError {
  /** The close code, if the failure came from one. */
  readonly code: number | undefined

  /**
   * @param message - What went wrong and what to change.
   * @param code - The close code, if any.
   */
  constructor(message: string, code?: number) {
    super(message)
    this.name = 'FatalGatewayError'
    this.code = code
  }
}
