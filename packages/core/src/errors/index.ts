/**
 * The errors `@vestra/core` throws.
 *
 * @remarks
 * Separate from `@vestra/gateway`'s hierarchy on purpose — see {@link CoreError}.
 */

export { ClientError, ClientErrorCode } from './ClientError.js'
export { CoreError } from './CoreError.js'
export { EventHandlerError } from './EventHandlerError.js'
