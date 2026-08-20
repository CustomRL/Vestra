/**
 * Reports fields Discord's OpenAPI specification declares that `@vestra/types` does not.
 *
 * Hand-writing the typings buys control and costs currency (see
 * docs/adr/0003-hand-written-types.md). This script is the mitigation: it makes the lag
 * visible instead of silent.
 *
 * It runs on a schedule, never on pull requests. Blocking a contributor because Discord
 * shipped a field this morning would be hostile, and the drift is a maintenance signal
 * rather than a defect in the change under review.
 *
 * Usage:
 *   node --experimental-strip-types scripts/check-api-drift.ts [--json] [--preview]
 *
 * Exits 1 when drift is found, so a workflow can decide whether to open an issue.
 */

import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const SPEC_BASE = 'https://raw.githubusercontent.com/discord/discord-api-spec/main/specs'

/**
 * Which of our types correspond to which schema in Discord's specification.
 *
 * Add a row when you model a new resource. A type absent from this table is simply not
 * checked, which is why the report prints the coverage count — an empty report with two
 * mappings means nothing at all.
 */
const MAPPINGS: { ours: string; theirs: string }[] = [
  { ours: 'APIUser', theirs: 'UserResponse' },
  { ours: 'APIGuild', theirs: 'GuildResponse' },
  { ours: 'APIGuildMember', theirs: 'GuildMemberResponse' },
  { ours: 'APIMessage', theirs: 'MessageResponse' },
  { ours: 'APIRole', theirs: 'GuildRoleResponse' },
  { ours: 'APIEmoji', theirs: 'EmojiResponse' },
  { ours: 'APIAttachment', theirs: 'MessageAttachmentResponse' },
  { ours: 'APIEmbed', theirs: 'MessageEmbedResponse' },
  { ours: 'APIThreadMetadata', theirs: 'ThreadMetadataResponse' },
  { ours: 'APIForumTag', theirs: 'ForumTagResponse' },
  { ours: 'APIVoiceState', theirs: 'VoiceStateResponse' },
  { ours: 'APIPoll', theirs: 'PollResponse' },
  { ours: 'APISticker', theirs: 'GuildStickerResponse' },
  { ours: 'APIStickerItem', theirs: 'MessageStickerItemResponse' },
  { ours: 'APIRoleColors', theirs: 'GuildRoleColorsResponse' },
  { ours: 'APIIncidentsData', theirs: 'GuildIncidentsDataResponse' },
]

/**
 * Fields the specification declares that Vestra deliberately does not model.
 *
 * @remarks
 * A report that is permanently non-empty trains everyone to ignore it, so a field is
 * either modelled or recorded here with a reason. Removing an entry is how you decide to
 * model it.
 */
const IGNORED: Record<string, Record<string, string>> = {
  APIMessage: {
    lobby_member:
      'Lobbies are an unreleased SDK feature with no public documentation; the shape ' +
      'would be guesswork and is not reachable by a bot token.',
    shared_client_theme:
      'Client themes are a first-party client feature, not part of the bot API surface.',
  },
}

interface SpecSchema {
  properties?: Record<string, unknown>
}

interface Spec {
  info?: { version?: string }
  components?: { schemas?: Record<string, SpecSchema> }
}

interface Drift {
  ours: string
  theirs: string
  missing: string[]
}

/**
 * Reads the property names of every exported type in `@vestra/types`.
 *
 * Uses the type checker rather than reading declarations directly, so that inherited and
 * intersected members are included — most of our payloads extend a shared base.
 */
function readOurTypes(): Map<string, Set<string>> {
  const entry = fileURLToPath(new URL('../packages/types/src/index.ts', import.meta.url))
  const program = ts.createProgram([entry], {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  })

  const checker = program.getTypeChecker()
  const source = program.getSourceFile(entry)
  if (source === undefined) throw new Error(`could not load ${entry}`)

  const moduleSymbol = checker.getSymbolAtLocation(source)
  if (moduleSymbol === undefined) throw new Error('entry point exports nothing')

  const result = new Map<string, Set<string>>()
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const declared = checker.getDeclaredTypeOfSymbol(exported)
    const properties = checker.getPropertiesOfType(declared)
    if (properties.length === 0) continue
    result.set(exported.getName(), new Set(properties.map((p) => p.getName())))
  }
  return result
}

async function fetchSpec(preview: boolean): Promise<Spec> {
  const url = `${SPEC_BASE}/openapi${preview ? '_preview' : ''}.json`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`fetching ${url} failed: ${String(response.status)} ${response.statusText}`)
  }
  return (await response.json()) as Spec
}

function findDrift(
  ours: Map<string, Set<string>>,
  spec: Spec,
): { drift: Drift[]; checked: number } {
  const schemas = spec.components?.schemas ?? {}
  const drift: Drift[] = []
  let checked = 0

  for (const mapping of MAPPINGS) {
    const ourFields = ours.get(mapping.ours)
    const theirSchema = schemas[mapping.theirs]

    if (ourFields === undefined) {
      drift.push({ ...mapping, missing: ['<type not found in @vestra/types>'] })
      continue
    }
    if (theirSchema?.properties === undefined) {
      drift.push({ ...mapping, missing: ['<schema not found in the specification>'] })
      continue
    }

    checked += 1
    const ignored = IGNORED[mapping.ours] ?? {}
    const missing = Object.keys(theirSchema.properties)
      .filter((field) => !ourFields.has(field) && !(field in ignored))
      .sort()
    if (missing.length > 0) drift.push({ ...mapping, missing })
  }

  return { drift, checked }
}

function renderMarkdown(drift: Drift[], checked: number, version: string): string {
  const ignoredCount = Object.values(IGNORED).reduce(
    (sum, fields) => sum + Object.keys(fields).length,
    0,
  )
  const lines = [
    '## API typing drift',
    '',
    `Compared ${String(checked)} of ${String(MAPPINGS.length)} mapped types against Discord's`,
    `OpenAPI specification (API version ${version}), ignoring ${String(ignoredCount)} fields`,
    'recorded as deliberately unmodelled.',
    '',
  ]

  if (drift.length === 0) {
    lines.push('No drift found. Every mapped type covers each field the specification declares.')
    return lines.join('\n')
  }

  lines.push('The specification declares these fields; `@vestra/types` does not.', '')
  for (const entry of drift) {
    lines.push(`### \`${entry.ours}\` (spec: \`${entry.theirs}\`)`, '')
    for (const field of entry.missing) lines.push(`- \`${field}\``)
    lines.push('')
  }
  lines.push(
    '---',
    '',
    'Extra fields on our side are not reported: the specification omits some documented',
    'fields, and gateway payloads are not in it at all, so a field we have and it lacks is',
    'not evidence of a mistake.',
  )
  return lines.join('\n')
}

const args = new Set(process.argv.slice(2))
const spec = await fetchSpec(args.has('--preview'))
const { drift, checked } = findDrift(readOurTypes(), spec)

if (args.has('--json')) {
  console.log(JSON.stringify({ version: spec.info?.version, checked, drift }, null, 2))
} else {
  console.log(renderMarkdown(drift, checked, spec.info?.version ?? 'unknown'))
}

process.exitCode = drift.length > 0 ? 1 : 0
