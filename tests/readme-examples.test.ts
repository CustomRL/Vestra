import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import ts from 'typescript'

/**
 * A path in the form TypeScript's compiler host uses.
 *
 * @param value - A filesystem path.
 * @returns The same path with forward slashes.
 *
 * @remarks
 * The host works in forward slashes on every platform while `fileURLToPath` hands back
 * backslash-separated paths on Windows. Comparing the two directly meant the virtual file
 * below never matched, and the snippet silently failed to load rather than failing to compile.
 */
function toPosix(value: string): string {
  return value.split(sep).join('/')
}

/**
 * Every TypeScript example in the repository's prose compiles against the shipped types.
 *
 * @remarks
 * The README example is the first code anybody runs, and it is the one piece of the
 * repository that nothing else touches — no test imports it, no build compiles it, and it
 * keeps working right up until it does not. A published library whose first example does not
 * compile has spent its credibility before the reader reaches the second heading.
 *
 * Compiled through the real module resolver rather than checked by eye, so `import { Client }
 * from 'vestra'` has to actually resolve to the built package and every member the snippet
 * touches has to exist with the type the snippet assumes.
 *
 * Snippets are compiled one per program, because a reader copies one block, not all of them.
 * A block that only compiles because an earlier block declared something is a block that does
 * not work.
 */

/** The repository root, with forward slashes. */
const repoRoot = toPosix(fileURLToPath(new URL('../', import.meta.url)))

/**
 * Prose files whose TypeScript blocks are claims about the shipped API.
 *
 * @remarks
 * `docs/events.md` is here because it is a reference rather than a narrative: every block in it
 * is a listener somebody will copy, and a reference whose examples do not compile is worse than
 * no reference — it is wrong with authority.
 */
const SOURCES = ['README.md', 'docs/events.md']

/** One fenced block, with enough context to name it when it fails. */
interface Snippet {
  file: string
  line: number
  code: string
}

/**
 * Pulls every ```ts block out of a markdown file.
 *
 * @param file - The path, relative to the repository root.
 * @returns The blocks, in order.
 *
 * @remarks
 * `ts` and `typescript` only. A ```js block is not a claim about the typings, and a ```bash
 * block is not code at all.
 */
function snippetsIn(file: string): Snippet[] {
  const text = readFileSync(`${repoRoot}${file}`, 'utf8')
  const lines = text.split('\n')
  const found: Snippet[] = []

  let open: { line: number; body: string[] } | undefined
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (open === undefined) {
      if (/^```(ts|typescript)\s*$/.test(line.trim())) open = { line: index + 1, body: [] }
      continue
    }
    if (line.trim() === '```') {
      found.push({ file, line: open.line, code: open.body.join('\n') })
      open = undefined
      continue
    }
    open.body.push(line)
  }

  return found
}

/**
 * Type-checks one snippet as its own module.
 *
 * @param snippet - The block to check.
 * @returns Every diagnostic, formatted.
 *
 * @remarks
 * The virtual file sits at the repository root so `node_modules` resolution finds the
 * workspace packages exactly as a consumer's file would. A compiler host that served it from
 * a temporary directory outside the tree would resolve nothing, and one that wrote it into
 * `tests/` would be picked up by `pnpm typecheck` and fail the build.
 *
 * `skipLibCheck` is off deliberately for the snippet itself but on for the dependency graph:
 * this is asking whether the example compiles, not whether Node's own typings do.
 */
function check(snippet: Snippet, index: number): string[] {
  const virtualPath = `${repoRoot}readme-snippet-${String(index)}.ts`
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    exactOptionalPropertyTypes: true,
    skipLibCheck: true,
    noEmit: true,
    types: ['node'],
  }

  const host = ts.createCompilerHost(options, true)
  const readFile = host.readFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  const getSourceFile = host.getSourceFile.bind(host)
  const isVirtual = (name: string): boolean => toPosix(name) === virtualPath

  host.fileExists = (name) => (isVirtual(name) ? true : fileExists(name))
  host.readFile = (name) => (isVirtual(name) ? snippet.code : readFile(name))
  host.getSourceFile = (name, languageVersion, onError, shouldCreate) =>
    isVirtual(name)
      ? ts.createSourceFile(name, snippet.code, languageVersion, true)
      : getSourceFile(name, languageVersion, onError, shouldCreate)

  const program = ts.createProgram([virtualPath], options, host)
  const source = program.getSourceFile(virtualPath)
  assert.ok(source !== undefined, 'the snippet was not loaded')

  return [...program.getSemanticDiagnostics(source), ...program.getSyntacticDiagnostics(source)]
    .map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')
      if (diagnostic.start === undefined) return message
      const { line } = source.getLineAndCharacterOfPosition(diagnostic.start)
      // Reported against the markdown file's own line numbering, so the failure names the
      // place to edit rather than a line in a file that does not exist on disk.
      return `${snippet.file}:${String(snippet.line + line + 1)} ${message}`
    })
    .sort()
}

describe('prose examples', () => {
  const snippets = SOURCES.flatMap((file) => snippetsIn(file))

  it('RM1: finds the examples to check', () => {
    // A regex that quietly matched nothing would make every case below pass, which is the one
    // way a test like this fails silently.
    assert.ok(snippets.length > 0, 'no TypeScript blocks were found in the prose')
    assert.ok(
      snippets.some((snippet) => snippet.code.includes('new Client')),
      'the README no longer shows a client being constructed',
    )
  })

  it('RM2: compiles every example against the built packages', () => {
    const failures = snippets.flatMap((snippet, index) => check(snippet, index))
    assert.deepEqual(failures, [], `a prose example does not compile:\n${failures.join('\n')}`)
  })
})
