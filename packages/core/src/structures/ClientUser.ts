import type { APIUser } from '@vestra/types'
import type { Changes, ChangesDraft } from './Changes.js'
import { User, type UserChangeField } from './User.js'

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
/**
 * The fields a {@link ClientUser.patch} can report as changed.
 *
 * @remarks
 * Everything {@link UserChangeField} carries, plus the two fields only the current user has.
 */
export type ClientUserChangeField = UserChangeField | 'mfaEnabled' | 'verified'

/**
 * What an edit to the bot's own user displaced.
 *
 * @typeParam Client - The client type the user is bound to.
 *
 * @remarks
 * The second argument to `userUpdate`. See {@link Changes}.
 */
export type ClientUserChanges<Client = unknown> = Changes<ClientUser<Client>, ClientUserChangeField>

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
   * Applies a newer payload in place, reporting what it displaced.
   *
   * @param data - The payload to apply.
   * @returns The previous values of the fields that actually changed, or `null` if none did.
   *
   * @remarks
   * The record the base class started is the one this adds to, rather than a second object
   * merged into it afterwards — the draft is still mutable on the way back up the chain, and
   * merging two records would allocate twice to describe one patch.
   */
  override patch(data: APIUser): ClientUserChanges<Client> | null {
    type Draft = ChangesDraft<ClientUser<Client>, ClientUserChangeField>
    let changes: Draft | null = super.patch(data)

    if (data.mfa_enabled !== this.mfaEnabled) (changes ??= {}).mfaEnabled = this.mfaEnabled
    this.mfaEnabled = data.mfa_enabled
    if (data.verified !== this.verified) (changes ??= {}).verified = this.verified
    this.verified = data.verified

    return changes
  }
}
