import type { APIUser } from '@vestra/types'
import { User } from './User.js'

/**
 * The bot's own user.
 *
 * @remarks
 * A subclass rather than a plain {@link User} because the client needs its own identity to
 * do two things constantly — recognise its own messages, and compute its own permissions —
 * and `client.user` being a distinct type is what stops it being cached, evicted, or
 * confused with somebody else's user.
 *
 * It is deliberately **not** an entry in the `users` scope. A pinned entry there would be
 * evicted the moment a consumer set `users: false`, taking with it the one user the client
 * cannot function without. `client.user` is a field, which satisfies ADR 4's "the default
 * adapter caches the current user" more strongly than a scope could.
 */
export class ClientUser<Client = unknown> extends User<Client> {
  /**
   * Whether the account has two-factor authentication enabled.
   *
   * @remarks
   * Only ever sent for the current user, which is why it lives here rather than on
   * {@link User}.
   */
  declare mfaEnabled: boolean | undefined
  /** Whether the account's email is verified. Current user only. */
  declare verified: boolean | undefined

  /**
   * @param data - The payload to mirror.
   * @param client - The client this user belongs to.
   */
  constructor(data: APIUser, client: Client) {
    super(data, client)

    this.mfaEnabled = data.mfa_enabled
    this.verified = data.verified
  }

  /**
   * Applies a newer payload in place.
   *
   * @param data - The payload to apply.
   */
  override patch(data: APIUser): void {
    super.patch(data)
    this.mfaEnabled = data.mfa_enabled
    this.verified = data.verified
  }
}
