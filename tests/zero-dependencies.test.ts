import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const packagesDir = fileURLToPath(new URL('../packages/', import.meta.url))

interface Manifest {
  name: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

function readManifests(): Manifest[] {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const raw = readFileSync(join(packagesDir, entry.name, 'package.json'), 'utf8')
      return JSON.parse(raw) as Manifest
    })
}

/**
 * "Lightweight" is the whole point of this library, and the way it stops being true
 * is one convenient dependency at a time. This asserts the property directly rather
 * than trusting review to notice.
 */
describe('published packages', () => {
  const manifests = readManifests()

  it('finds every workspace package', () => {
    assert.ok(manifests.length > 0, 'no packages discovered')
  })

  for (const manifest of manifests) {
    it(`${manifest.name} has no third-party runtime dependencies`, () => {
      const deps = Object.keys(manifest.dependencies ?? {})
      const thirdParty = deps.filter((dep) => dep !== 'vestra' && !dep.startsWith('@vestra/'))
      assert.deepEqual(
        thirdParty,
        [],
        `${manifest.name} declares third-party runtime dependencies: ${thirdParty.join(', ')}. ` +
          'Node built-ins and globals only -- see docs/adr/0001-zero-runtime-dependencies.md.',
      )
    })

    it(`${manifest.name} declares no peer dependencies`, () => {
      const peers = Object.keys(manifest.peerDependencies ?? {})
      const thirdParty = peers.filter((dep) => !dep.startsWith('@vestra/'))
      assert.deepEqual(
        thirdParty,
        [],
        `${manifest.name} pushes install burden onto consumers via peers: ${thirdParty.join(', ')}`,
      )
    })
  }
})
