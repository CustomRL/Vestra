import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as types from '@vestra/types'

/**
 * Every enumeration in this package is hand-written, and the failure mode of hand-written
 * enumerations is a copy-paste collision: two members silently sharing a value, so one of
 * them can never be matched. These checks are mechanical rather than clever on purpose --
 * they cost nothing and they catch the mistake that review reliably misses.
 */

type EnumLike = Record<string, number | string | bigint>

function isEnumLike(value: unknown): value is EnumLike {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const values = Object.values(value)
  if (values.length === 0) return false
  return values.every(
    (v) => typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint',
  )
}

const enums = Object.entries(types as Record<string, unknown>)
  .filter((entry): entry is [string, EnumLike] => isEnumLike(entry[1]))
  .sort(([a], [b]) => a.localeCompare(b))

describe('enumerations', () => {
  it('discovers the exported enumerations', () => {
    assert.ok(enums.length > 5, `expected several enumerations, found ${String(enums.length)}`)
  })

  for (const [name, members] of enums) {
    it(`${name} has no duplicate values`, () => {
      const seen = new Map<string, string>()
      const duplicates: string[] = []

      for (const [member, value] of Object.entries(members)) {
        const key = `${typeof value}:${String(value)}`
        const existing = seen.get(key)
        if (existing === undefined) {
          seen.set(key, member)
        } else {
          duplicates.push(`${existing} and ${member} both equal ${String(value)}`)
        }
      }

      assert.deepEqual(duplicates, [], `${name}: ${duplicates.join('; ')}`)
    })

    it(`${name} is frozen at the type level and consistent at runtime`, () => {
      for (const [member, value] of Object.entries(members)) {
        assert.notEqual(value, undefined, `${name}.${member} is undefined`)
      }
    })
  }
})

describe('bit flags', () => {
  const flagEnums = enums.filter(([name]) => name.endsWith('Flags') || name.endsWith('FlagsBits'))

  it('finds the flag enumerations', () => {
    assert.ok(flagEnums.length > 0, 'no flag enumerations discovered')
  })

  for (const [name, members] of flagEnums) {
    it(`${name} members are all powers of two`, () => {
      const offenders: string[] = []

      for (const [member, value] of Object.entries(members)) {
        if (typeof value === 'string') continue
        const big = typeof value === 'bigint' ? value : BigInt(value)
        // A power of two has exactly one bit set, so n & (n - 1) clears it to zero.
        if (big <= 0n || (big & (big - 1n)) !== 0n) {
          offenders.push(`${member} = ${String(value)}`)
        }
      }

      assert.deepEqual(
        offenders,
        [],
        `${name} has non-power-of-two members: ${offenders.join(', ')}`,
      )
    })
  }
})
