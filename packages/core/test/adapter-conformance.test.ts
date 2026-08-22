import { describe } from 'node:test'
import { MemoryCacheAdapter } from '@vestra/core'
import { runCacheAdapterConformance } from './adapter-conformance.ts'

/**
 * The adapters `@vestra/core` ships, run through the suite third parties will use.
 *
 * @remarks
 * Running the default against its own conformance suite is what keeps the suite honest. A
 * requirement the shipped adapter cannot meet is a requirement no third party should be
 * asked to meet either, and it fails here first.
 *
 * `NullCacheAdapter` deliberately does not appear: it satisfies the type but not the
 * contract, because storing nothing is the whole point of it. Asserting otherwise would
 * force the suite to weaken to whatever both can pass.
 */
describe('cache adapter conformance', () => {
  runCacheAdapterConformance('memory', (context) => new MemoryCacheAdapter(context))
})
