/**
 * The base class of every error this package throws.
 *
 * @remarks
 * Gateway failures originate in unrelated places — a fatal close code, an exhausted daily
 * session allowance, a payload the socket would refuse, a send that waited past its
 * ceiling — but a caller nearly always wants to treat them as one category, because none
 * of them is worth retrying blindly and all of them mean "stop and tell somebody". A
 * shared base lets that be written once:
 *
 * ```ts
 * try {
 *   await manager.spawn()
 * } catch (error) {
 *   if (error instanceof GatewayError) reportAndExit(error)
 *   throw error
 * }
 * ```
 *
 * Naming each concrete class instead would compile today and quietly stop matching the
 * day a fifth failure is added, which is the sort of gap that only shows up in
 * production. Never thrown directly; the subclasses carry the fields worth branching on.
 */
export class GatewayError extends Error {
  /**
   * @param message - What went wrong and what to change.
   */
  constructor(message: string) {
    super(message)
    this.name = 'GatewayError'
  }
}
