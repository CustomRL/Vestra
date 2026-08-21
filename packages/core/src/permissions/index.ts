/**
 * Permission bit sets and the rules for computing them.
 *
 * @remarks
 * A directory of its own because the computation is a documented algorithm with an order that
 * matters, not a helper. See `compute.ts` for which parts of that order are Discord's rules
 * rather than choices.
 */

export {
  applyTimeout,
  computeBasePermissions,
  computeOverwrites,
  isTimedOut,
  type PermissionGuild,
  type PermissionMember,
  type PermissionRole,
} from './compute.js'
export {
  ALL_PERMISSIONS,
  PermissionsBitField,
  type PermissionName,
  type PermissionResolvable,
} from './PermissionsBitField.js'
