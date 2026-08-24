/**
 * What a cached entry actually costs.
 *
 * `docs/design/phase-4-core.md` §8-D3 lists four memory claims made without a measurement,
 * one of which decided a design and one of which is an estimate the repository is forbidden
 * from publishing until it is checked:
 *
 *   - §4.11's **two maps rather than one map of records**, chosen because a wrapper object
 *     per entry is pure overhead on the default configuration where no scope has a TTL.
 *   - §4.9's **~20 MB roles estimate** — 2,500 guilds x ~40 roles x ~200 B — which is what
 *     the "roles default on" deviation from ADR 4 rests on.
 *   - The **secondary index**, one `Set` per group plus one reverse entry per key.
 *   - **Composite-key string allocation**, one `guildId:userId` string per member.
 *
 * Every figure needs a forced collection to mean anything, so this refuses to print numbers
 * without `--expose-gc` rather than printing whatever garbage had not been swept.
 *
 * Usage:
 *   node --experimental-strip-types --expose-gc scripts/bench/cache-memory.ts
 */

import type { APIRole, APIUser, Snowflake } from '@vestra/types'
import {
  CacheIndex,
  CacheScope,
  CacheStore,
  Role,
  guildUserKey,
  resolveCachePolicy,
} from '@vestra/core'

const collect = (globalThis as { gc?: () => void }).gc
if (collect === undefined) {
  console.error('cache-memory needs --expose-gc: without a forced collection the numbers are')
  console.error('whatever garbage happened not to have been swept, which is not a measurement.')
  process.exit(1)
}

const gc: () => void = collect

/**
 * Live heap grown by building and holding something, in bytes.
 *
 * @param build - Produces the thing to hold. Its return value is retained.
 * @returns Bytes retained.
 *
 * @remarks
 * Two collections: one to establish the floor and one to drop everything the build made that
 * is not reachable from what it returned. Without the second, transient allocations count.
 */
function retained(build: () => unknown): number {
  gc()
  const before = process.memoryUsage().heapUsed
  const held = build()
  gc()
  const after = process.memoryUsage().heapUsed
  // Touched here so `held` cannot be collected before the measurement above.
  if (held === Symbol.iterator) throw new Error('unreachable')
  return after - before
}

/** Prints one figure, per entry. */
function report(name: string, bytes: number, entries: number): number {
  const each = bytes / entries
  console.log(`  ${name.padEnd(38)} ${each.toFixed(1).padStart(8)} B/entry`)
  return each
}

const GUILDS = 2_500
const ROLES_PER_GUILD = 40
const ROLE_COUNT = GUILDS * ROLES_PER_GUILD

/** A role as `GUILD_CREATE` carries one. */
function rolePayload(guild: number, index: number): APIRole {
  return {
    id: `${String(guild)}${String(index).padStart(4, '0')}00000000000`,
    name: `role-${String(index)}`,
    color: 0,
    hoist: false,
    position: index,
    permissions: '137411140374081',
    managed: false,
    mentionable: false,
    flags: 0,
    colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
  }
}

// --- D3a. Two maps against one map of records. ---

console.log('D3a. Entry layout, 100,000 entries, no TTL')

const LAYOUT_ENTRIES = 100_000

const twoMaps = retained(() => {
  const values = new Map<string, APIUser>()
  const expiry: Map<string, number> | undefined = undefined
  for (let index = 0; index < LAYOUT_ENTRIES; index += 1) {
    values.set(`k${String(index)}`, { id: String(index) } as APIUser)
  }
  return [values, expiry]
})
const twoMapsEach = report('two maps, expiry map unbuilt', twoMaps, LAYOUT_ENTRIES)

const wrapped = retained(() => {
  const values = new Map<string, { value: APIUser; expiresAt: number | undefined }>()
  for (let index = 0; index < LAYOUT_ENTRIES; index += 1) {
    values.set(`k${String(index)}`, {
      value: { id: String(index) } as APIUser,
      expiresAt: undefined,
    })
  }
  return values
})
const wrappedEach = report('one map of wrapper records', wrapped, LAYOUT_ENTRIES)

// --- D3b. The roles estimate the ADR 4 deviation rests on. ---

console.log()
console.log(`D3b. Roles, ${String(GUILDS)} guilds x ${String(ROLES_PER_GUILD)}`)

const rolesBytes = retained(() => {
  const store = new CacheStore<Role>({
    scope: CacheScope.Roles,
    policy: resolveCachePolicy<Role>(CacheScope.Roles, true, true),
    keyOf: (role) => role.id,
    groupKeyOf: (role) => role.guildId,
  })
  for (let guild = 0; guild < GUILDS; guild += 1) {
    const guildId = `${String(guild)}0000000000000000`
    for (let index = 0; index < ROLES_PER_GUILD; index += 1) {
      store.add(new Role(rolePayload(guild, index), guildId, undefined))
    }
  }
  return store
})
const roleEach = report('Role in a grouped CacheStore', rolesBytes, ROLE_COUNT)

// --- D3c. What the secondary index adds. ---

console.log()
console.log('D3c. The secondary index')

const ungrouped = retained(() => {
  const store = new CacheStore<Role>({
    scope: CacheScope.Roles,
    policy: resolveCachePolicy<Role>(CacheScope.Roles, true, true),
    keyOf: (role) => role.id,
  })
  for (let guild = 0; guild < GUILDS; guild += 1) {
    const guildId = `${String(guild)}0000000000000000`
    for (let index = 0; index < ROLES_PER_GUILD; index += 1) {
      store.add(new Role(rolePayload(guild, index), guildId, undefined))
    }
  }
  return store
})
const ungroupedEach = report('the same store, no groupKeyOf', ungrouped, ROLE_COUNT)

const indexOnly = retained(() => {
  const index = new CacheIndex()
  for (let guild = 0; guild < GUILDS; guild += 1) {
    const guildId = `${String(guild)}0000000000000000`
    for (let entry = 0; entry < ROLES_PER_GUILD; entry += 1) {
      index.add(guildId, `${String(guild)}${String(entry).padStart(4, '0')}00000000000`)
    }
  }
  return index
})
report('CacheIndex alone', indexOnly, ROLE_COUNT)

// --- D3d. Composite keys. ---

console.log()
console.log('D3d. Composite member keys')

const KEYS = 200_000
const keyBytes = retained(() => {
  const keys: string[] = new Array<string>(KEYS)
  for (let index = 0; index < KEYS; index += 1) {
    const guildId: Snowflake = '613425648685547541'
    keys[index] = guildUserKey(guildId, `${String(index)}0000000000000`)
  }
  return keys
})
report('guildUserKey, held', keyBytes, KEYS)

console.log()
console.log(`layout: wrapper records cost ${(wrappedEach - twoMapsEach).toFixed(1)} B/entry more`)
console.log(
  `roles:  ${(rolesBytes / 1024 / 1024).toFixed(1)} MB for ${ROLE_COUNT.toLocaleString('en-US')}, ` +
    `against the ~20 MB estimate`,
)
console.log(`index:  ${(roleEach - ungroupedEach).toFixed(1)} B/entry, measured by difference`)
