import { PermissionFlagsBits, type Snowflake } from '@vestra/types'
import type { PermissionOverwrite } from '../structures/channels/GuildChannel.js'
import { ALL_PERMISSIONS, PermissionsBitField } from './PermissionsBitField.js'

/** What computing permissions needs to know about a guild. */
export interface PermissionGuild {
  /** The guild's ID, which is also the `@everyone` role's ID. */
  readonly id: Snowflake
  /** Who owns the guild. */
  readonly ownerId: Snowflake
}

/** What computing permissions needs to know about a member. */
export interface PermissionMember {
  /** Whose permissions these are. */
  readonly userId: Snowflake
  /** The roles they hold, not including `@everyone`. */
  readonly roles: readonly Snowflake[]
  /** When their timeout expires, if they are timed out. */
  readonly communicationDisabledUntilTimestamp?: string | null | undefined
}

/** What computing permissions needs to know about a role. */
export interface PermissionRole {
  /** The role's ID. */
  readonly id: Snowflake
  /** What it grants, as Discord's decimal string. */
  readonly permissions: string
}

/**
 * The permissions a member has across a guild, before any channel is considered.
 *
 * @param guild - The guild.
 * @param member - The member.
 * @param roles - Every role in the guild, including `@everyone`.
 * @returns The computed set.
 *
 * @remarks
 * Two shortcuts return everything, and both are Discord's rules rather than optimisations. The
 * guild owner has every permission regardless of roles. So does anybody whose roles grant
 * `Administrator`, and that one is why `Administrator` cannot be reasoned about as an ordinary
 * bit: it is not a permission so much as an escape from the whole calculation.
 *
 * `@everyone` is found by ID, because Discord marks it by giving it the guild's own ID rather
 * than a flag. A member's `roles` array never contains it, so it has to be added here — miss
 * that and every permission granted to the whole guild disappears.
 *
 * A role in the member's list that is not in `roles` is skipped rather than treated as granting
 * nothing special, because that is what it is: a role the cache has not seen. The result is
 * then an *understatement* of what the member has, which is the safe direction for a check
 * that gates an action.
 */
export function computeBasePermissions(
  guild: PermissionGuild,
  member: PermissionMember,
  roles: readonly PermissionRole[],
): PermissionsBitField {
  if (member.userId === guild.ownerId) return new PermissionsBitField(ALL_PERMISSIONS)

  const byId = new Map<Snowflake, PermissionRole>()
  for (const role of roles) byId.set(role.id, role)

  // `@everyone` carries the guild's own ID, and is never listed in a member's roles.
  let bits = 0n
  const everyone = byId.get(guild.id)
  if (everyone !== undefined) bits |= BigInt(everyone.permissions)

  for (const roleId of member.roles) {
    const role = byId.get(roleId)
    if (role !== undefined) bits |= BigInt(role.permissions)
  }

  if ((bits & PermissionFlagsBits.Administrator) !== 0n) {
    return new PermissionsBitField(ALL_PERMISSIONS)
  }
  return new PermissionsBitField(bits)
}

/**
 * The permissions a member has in one channel.
 *
 * @param base - What {@link computeBasePermissions} returned.
 * @param guild - The guild, for the `@everyone` overwrite's ID.
 * @param member - The member.
 * @param overwrites - The channel's permission overwrites.
 * @returns The computed set.
 *
 * @remarks
 * The order is fixed by Discord and is not the order the overwrites arrive in: `@everyone`
 * first, then **every** role overwrite accumulated together, then the member's own. Applying
 * role overwrites one at a time instead gives a different and wrong answer whenever one role
 * denies what another allows — the accumulated form lets any allow win over any deny among
 * roles, and the sequential form lets whichever came last win.
 *
 * `Administrator` skips all of it, again.
 */
export function computeOverwrites(
  base: PermissionsBitField,
  guild: PermissionGuild,
  member: PermissionMember,
  overwrites: readonly PermissionOverwrite[],
): PermissionsBitField {
  if (base.has(PermissionFlagsBits.Administrator)) {
    return new PermissionsBitField(ALL_PERMISSIONS)
  }

  let bits = base.bits

  const everyone = overwrites.find((overwrite) => overwrite.id === guild.id)
  if (everyone !== undefined) {
    bits &= ~BigInt(everyone.deny)
    bits |= BigInt(everyone.allow)
  }

  // Accumulated, then applied once. Applying each role's overwrite in turn would make the
  // result depend on the order Discord happened to send them in.
  let roleAllow = 0n
  let roleDeny = 0n
  const held = new Set(member.roles)
  for (const overwrite of overwrites) {
    if (overwrite.type !== 0 || !held.has(overwrite.id)) continue
    roleAllow |= BigInt(overwrite.allow)
    roleDeny |= BigInt(overwrite.deny)
  }
  bits &= ~roleDeny
  bits |= roleAllow

  const own = overwrites.find((overwrite) => overwrite.type === 1 && overwrite.id === member.userId)
  if (own !== undefined) {
    bits &= ~BigInt(own.deny)
    bits |= BigInt(own.allow)
  }

  return new PermissionsBitField(bits)
}

/**
 * What a timeout leaves a member able to do.
 *
 * @remarks
 * Discord strips everything except being able to see a channel and read its history. This is
 * applied last, after overwrites, and it does **not** spare administrators — a timed-out
 * administrator cannot talk either, which is the one place `Administrator` is not an escape
 * from the calculation.
 */
const TIMEOUT_PERMISSIONS: bigint =
  PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory

/**
 * Whether a member is currently timed out.
 *
 * @param member - The member.
 * @param now - The current time in epoch milliseconds. Injectable so this is testable.
 * @returns Whether the timeout is in the future.
 *
 * @remarks
 * The field holds when the timeout *expires*, and Discord leaves it populated after it has
 * passed rather than clearing it. Reading it as a boolean — "is this field set" — reports
 * every member who has ever been timed out as still muted.
 */
export function isTimedOut(member: PermissionMember, now: number): boolean {
  const until = member.communicationDisabledUntilTimestamp
  if (until === undefined || until === null) return false
  return Date.parse(until) > now
}

/**
 * Applies a timeout to an already-computed permission set.
 *
 * @param permissions - What the member would otherwise have.
 * @param member - The member.
 * @param now - The current time in epoch milliseconds.
 * @returns The permissions the timeout leaves.
 */
export function applyTimeout(
  permissions: PermissionsBitField,
  member: PermissionMember,
  now: number,
): PermissionsBitField {
  if (!isTimedOut(member, now)) return permissions
  return new PermissionsBitField(permissions.bits & TIMEOUT_PERMISSIONS)
}
