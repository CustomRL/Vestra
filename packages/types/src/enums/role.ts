/**
 * Role-related enumerations.
 */

/**
 * Flags on a role.
 */
export const RoleFlags = {
  /** The role can be selected by members in an onboarding prompt. */
  InPrompt: 1 << 0,
} as const

/**
 * A role flag.
 */
export type RoleFlags = (typeof RoleFlags)[keyof typeof RoleFlags]
