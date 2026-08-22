import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as core from '@vestra/core'
import * as gateway from '@vestra/gateway'
import * as rest from '@vestra/rest'
import * as types from '@vestra/types'

/**
 * What `@vestra/core` re-exports is the same thing the lower package exports.
 *
 * @remarks
 * §7 **PK3**. `@vestra/core` re-exports the packages below it so a consumer needs one import,
 * and that is where a specific silent failure lives: **two colliding star exports are a
 * compile error (TS2308), but an explicit re-export shadows a star export with no diagnostic
 * at all.** Add a `Timers` to core's own sources and the barrel quietly starts handing out a
 * different `Timers` from the one `@vestra/gateway` exports, and `instanceof` checks and type
 * comparisons start disagreeing for reasons nothing reports.
 *
 * Compared by identity rather than by name, because a name check would pass in exactly the
 * case this exists to catch.
 */

const LOWER: readonly [string, Record<string, unknown>][] = [
  ['@vestra/gateway', gateway],
  ['@vestra/rest', rest],
  ['@vestra/types', types],
]

const coreExports = core as unknown as Record<string, unknown>

describe('barrel pass-through', () => {
  it('PK1: re-exports something from every package below it', () => {
    // Guards the guard: if the barrel stopped re-exporting entirely, PK3 would compare an
    // empty set and pass.
    for (const [name, module] of LOWER) {
      const shared = Object.keys(module).filter((key) => key in coreExports)
      assert.ok(shared.length > 0, `core re-exports nothing from ${name}`)
    }
  })

  it('PK3: hands back the same object the lower package exports', () => {
    const shadowed: string[] = []

    for (const [name, module] of LOWER) {
      for (const [key, value] of Object.entries(module)) {
        if (!(key in coreExports)) continue
        if (coreExports[key] !== value) shadowed.push(`${key} (from ${name})`)
      }
    }

    assert.deepEqual(
      shadowed.sort(),
      [],
      `these are a different object through @vestra/core: ${shadowed.join(', ')}`,
    )
  })

  it('PK4: exports nothing undefined', () => {
    // An export that resolves to `undefined` is what a circular import looks like from the
    // outside, and it is invisible until somebody calls it.
    const empty = Object.entries(coreExports)
      .filter(([, value]) => value === undefined)
      .map(([key]) => key)

    assert.deepEqual(empty, [], `these exports are undefined: ${empty.join(', ')}`)
  })
})
