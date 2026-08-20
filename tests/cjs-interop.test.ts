import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'

const requireCjs = createRequire(import.meta.url)

const entrypoints = ['@vestra/types', '@vestra/rest', '@vestra/gateway', '@vestra/core', 'vestra']

/**
 * Vestra is ESM-only, which is only tenable because Node 22.12+ can `require()` an ES
 * module -- but that support disappears the moment any module in the graph uses
 * top-level await, which turns the whole package into an async module.
 *
 * ESLint cannot detect this reliably (await hides in declarations, loops and nested
 * expressions), so the property is tested behaviourally instead: if a CJS consumer can
 * require every entrypoint, no top-level await slipped in.
 *
 * Requires `pnpm build` first -- this deliberately tests the emitted output, not source.
 */
describe('CommonJS interop', () => {
  for (const name of entrypoints) {
    it(`${name} is require()-able from CommonJS`, () => {
      let mod: unknown
      try {
        mod = requireCjs(name)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ERR_REQUIRE_ASYNC_MODULE') {
          assert.fail(
            `${name} uses top-level await somewhere in its module graph, which breaks ` +
              'require(esm) for CommonJS consumers. See docs/adr/0002-esm-only.md.',
          )
        }
        throw error
      }
      assert.equal(typeof mod, 'object', `${name} did not resolve to a module namespace`)
    })
  }
})
