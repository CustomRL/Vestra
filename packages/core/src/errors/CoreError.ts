/**
 * The base class of every error this package throws.
 *
 * @remarks
 * The same argument `GatewayError` makes one layer down: core's failures originate in
 * unrelated places — a client used after it was destroyed, a handler that threw, a member
 * request routed to a shard that is not connected — but a caller nearly always wants to treat
 * them as one category, because none is worth retrying blindly.
 *
 * ```ts
 * try {
 *   await client.fetchMembers(guildId)
 * } catch (error) {
 *   if (error instanceof CoreError) reportAndContinue(error)
 *   throw error
 * }
 * ```
 *
 * Naming each concrete class instead compiles today and quietly stops matching the day a
 * fourth is added.
 *
 * **Deliberately not a subclass of `GatewayError`.** A consumer catching `GatewayError` is
 * asking about the connection; a client error is not about the connection, and folding them
 * together would make `instanceof GatewayError` answer `true` for a mistyped option. The two
 * hierarchies stay separate and a consumer who wants both names both.
 *
 * Never thrown directly; the subclasses carry the fields worth branching on.
 */
export class CoreError extends Error {
  /**
   * @param message - What went wrong.
   * @param options - Standard error options, including `cause`.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CoreError'
  }
}
