import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { ChannelType } from '@vestra/types'
import {
  createChannel,
  Emoji,
  Guild,
  GuildMember,
  Message,
  Presence,
  Role,
  Sticker,
  User,
  VoiceState,
} from '@vestra/core'

/**
 * No structure emits a redundant field definition.
 *
 * @remarks
 * CONTRIBUTING's rule — "declare structure fields with `declare` and assign them in the
 * constructor, so no redundant field initialisation is emitted before your assignment" — was
 * a sentence in a document and nothing more. This is the sentence, checked.
 *
 * **What goes wrong without it.** `useDefineForClassFields` is on, so a bare `name: string`
 * compiles to `name;` in the class body: every instance gets the property defined as
 * `undefined` and then immediately assigned in the constructor. Two writes per field per
 * object, on the objects the library creates most. `declare` emits nothing and the constructor
 * assignment creates the property once.
 *
 * **Checked against the compiled output, not the source.** The source is where the mistake is
 * made, but the emit is where it matters, and reading the emit means this cannot be fooled by
 * a spelling of the declaration nobody anticipated.
 *
 * Scoped to `structures/`, which is what the rule says. `Client` and `CacheRegistry` have bare
 * fields and keep them: they are constructed once per process, so the redundant define is
 * paid once and `declare` there would be cargo-culting a hot-path rule onto cold code.
 */

const DIST = fileURLToPath(new URL('../dist/structures', import.meta.url))

/** Every compiled file under `dist/structures`, including the channels directory. */
async function compiledStructures(directory: string): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) found.push(...(await compiledStructures(path)))
    else if (entry.name.endsWith('.js')) found.push(path)
  }
  return found
}

/**
 * Field definitions emitted into a class body.
 *
 * @remarks
 * A bare declaration compiles to the field name alone on its own line, indented inside the
 * class. `#private` fields are excluded: they cannot be `declare`d, they are genuine storage
 * rather than a mirrored payload field, and several hold a real initialiser.
 */
function bareFields(source: string): string[] {
  const found: string[] = []
  let inClass = false

  for (const line of source.split('\n')) {
    if (/^(export )?(abstract )?class /.test(line)) inClass = true
    else if (line === '}') inClass = false
    if (!inClass) continue

    const match = /^ {4}([A-Za-z_$][A-Za-z0-9_$]*);$/.exec(line)
    if (match?.[1] !== undefined) found.push(match[1])
  }

  return found
}

/** Kept as a constant because an escape in a template literal does not survive every editor. */
const NEWLINE = String.fromCharCode(10)

const GUILD_ID = '613425648685547541'
const USER_ID = '80351110224678912'
const CHANNEL_ID = '41771983423143936'

const USER_MIN = { id: USER_ID, username: 'n', discriminator: '0', global_name: null, avatar: null }
const USER_FULL = {
  ...USER_MIN,
  bot: true,
  system: false,
  banner: 'b',
  accent_color: 1,
  locale: 'en-US',
  flags: 0,
  premium_type: 0,
  public_flags: 0,
}

const GUILD_MIN = {
  id: GUILD_ID,
  name: 'g',
  icon: null,
  splash: null,
  discovery_splash: null,
  home_header: null,
  owner_id: USER_ID,
  afk_channel_id: null,
  afk_timeout: 300,
  verification_level: 1,
  default_message_notifications: 0,
  explicit_content_filter: 0,
  roles: [],
  emojis: [],
  features: [],
  mfa_level: 0,
  application_id: null,
  system_channel_id: null,
  system_channel_flags: 0,
  rules_channel_id: null,
  vanity_url_code: null,
  description: null,
  banner: null,
  premium_tier: 0,
  preferred_locale: 'en-US',
  public_updates_channel_id: null,
  nsfw: false,
  nsfw_level: 0,
  premium_progress_bar_enabled: false,
  safety_alerts_channel_id: null,
  incidents_data: null,
}
const GUILD_FULL = {
  ...GUILD_MIN,
  joined_at: '2021-03-14T12:00:00.000000+00:00',
  large: true,
  member_count: 7,
  premium_subscription_count: 3,
}

const ROLE_MIN = {
  id: '1',
  name: 'r',
  color: 0,
  colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
  hoist: false,
  position: 0,
  permissions: '0',
  managed: false,
  mentionable: false,
  flags: 0,
}
const ROLE_FULL = { ...ROLE_MIN, icon: 'i', unicode_emoji: '🛡' }

const MEMBER_MIN = { roles: [], deaf: false, mute: false, flags: 0 }
const MEMBER_FULL = {
  ...MEMBER_MIN,
  user: USER_MIN,
  nick: 'n',
  avatar: 'a',
  banner: 'b',
  joined_at: '2021-03-14T12:00:00.000000+00:00',
  premium_since: null,
  pending: false,
  permissions: '0',
  communication_disabled_until: null,
}

const MESSAGE_MIN = { id: '900000000000000000', channel_id: CHANNEL_ID }
const MESSAGE_FULL = {
  ...MESSAGE_MIN,
  guild_id: GUILD_ID,
  author: USER_MIN,
  content: 'hi',
  timestamp: '2023-01-01T00:00:00+00:00',
  edited_timestamp: null,
  tts: false,
  mention_everyone: false,
  mentions: [],
  mention_roles: [],
  attachments: [],
  embeds: [],
  pinned: false,
  type: 0,
}

const VOICE_MIN = {
  user_id: USER_ID,
  channel_id: null,
  session_id: 's',
  deaf: false,
  mute: false,
  self_deaf: false,
  self_mute: false,
  self_video: false,
  suppress: false,
  request_to_speak_timestamp: null,
}
const VOICE_FULL = { ...VOICE_MIN, channel_id: CHANNEL_ID, self_stream: true }

const PRESENCE_MIN = {
  user: { id: USER_ID },
  guild_id: GUILD_ID,
  status: 'online',
  activities: [],
  client_status: {},
}
const PRESENCE_FULL = {
  ...PRESENCE_MIN,
  client_status: { desktop: 'online', mobile: 'idle', web: 'dnd', vr: 'online' },
}

const EMOJI_MIN = { id: '1', name: 'e' }
const EMOJI_FULL = {
  ...EMOJI_MIN,
  roles: ['2'],
  user: USER_MIN,
  require_colons: true,
  managed: false,
  animated: true,
  available: true,
}

const STICKER_MIN = { id: '1', name: 's', description: null, tags: '', type: 2, format_type: 1 }
const STICKER_FULL = {
  ...STICKER_MIN,
  pack_id: '9',
  available: true,
  guild_id: GUILD_ID,
  user: USER_MIN,
  sort_value: 1,
}

const TEXT_MIN = { id: CHANNEL_ID, type: ChannelType.GuildText, name: 'c', position: 0 }
const TEXT_FULL = {
  ...TEXT_MIN,
  permission_overwrites: [{ id: '1', type: 0, allow: '0', deny: '0' }],
  parent_id: '9',
  nsfw: true,
  last_message_id: '5',
  last_pin_timestamp: '2023-01-01T00:00:00+00:00',
  rate_limit_per_user: 5,
  topic: 't',
  default_auto_archive_duration: 1440,
}

const THREAD_MIN = { id: CHANNEL_ID, type: ChannelType.PublicThread, name: 'c', position: 0 }
const THREAD_FULL = {
  ...THREAD_MIN,
  parent_id: '9',
  owner_id: USER_ID,
  message_count: 1,
  member_count: 1,
  total_message_sent: 1,
  applied_tags: ['1'],
  thread_metadata: {
    archived: false,
    auto_archive_duration: 1440,
    archive_timestamp: '2023-01-01T00:00:00+00:00',
    locked: false,
    invitable: true,
    create_timestamp: '2023-01-01T00:00:00+00:00',
  },
}

/** A sparse and a full build of each structure, which must have the same shape. */
const VARIANTS: { name: string; sparse: object; full: object }[] = [
  {
    name: 'User',
    sparse: new User(USER_MIN, undefined),
    full: new User(USER_FULL as never, undefined),
  },
  {
    name: 'Guild',
    sparse: new Guild(GUILD_MIN as never, undefined),
    full: new Guild(GUILD_FULL as never, undefined),
  },
  {
    name: 'Role',
    sparse: new Role(ROLE_MIN, GUILD_ID, undefined),
    full: new Role(ROLE_FULL, GUILD_ID, undefined),
  },
  {
    name: 'GuildMember',
    sparse: new GuildMember(MEMBER_MIN as never, GUILD_ID, USER_ID, undefined),
    full: new GuildMember(MEMBER_FULL, GUILD_ID, USER_ID, undefined),
  },
  {
    name: 'Message',
    sparse: new Message(MESSAGE_MIN, undefined),
    full: new Message(MESSAGE_FULL as never, undefined),
  },
  {
    name: 'VoiceState',
    sparse: new VoiceState(VOICE_MIN, GUILD_ID, undefined),
    full: new VoiceState(VOICE_FULL, GUILD_ID, undefined),
  },
  {
    name: 'Presence',
    sparse: new Presence(PRESENCE_MIN as never, undefined),
    full: new Presence(PRESENCE_FULL as never, undefined),
  },
  {
    name: 'Emoji',
    sparse: new Emoji(EMOJI_MIN, GUILD_ID, undefined),
    full: new Emoji(EMOJI_FULL, GUILD_ID, undefined),
  },
  {
    name: 'Sticker',
    sparse: new Sticker(STICKER_MIN as never, undefined),
    full: new Sticker(STICKER_FULL as never, undefined),
  },
  {
    name: 'TextChannel',
    sparse: createChannel(TEXT_MIN as never, undefined, GUILD_ID) as object,
    full: createChannel(TEXT_FULL as never, undefined, GUILD_ID) as object,
  },
  {
    name: 'ThreadChannel',
    sparse: createChannel(THREAD_MIN as never, undefined, GUILD_ID) as object,
    full: createChannel(THREAD_FULL as never, undefined, GUILD_ID) as object,
  },
]

describe('structure shape', () => {
  it('SH1: reads a real set of compiled structures', () => {
    // Guards the guard. Pointed at a directory that does not exist, or run before a build,
    // this would find nothing and pass.
    return compiledStructures(DIST).then((files) => {
      assert.ok(
        files.length > 15,
        `expected the compiled structures; found ${String(files.length)}`,
      )
    })
  })

  it('SH2: emits no field definition before the constructor assigns it', async () => {
    const offenders: string[] = []

    for (const file of await compiledStructures(DIST)) {
      const fields = bareFields(await readFile(file, 'utf8'))
      const name = file.slice(DIST.length + 1)
      for (const field of fields) offenders.push(`${name}: ${field}`)
    }

    assert.deepEqual(
      offenders.sort(),
      [],
      `these fields need \`declare\`, or they are defined as undefined on every instance:\n${offenders.join('\n')}`,
    )
  })

  it('SH3: builds one shape whatever the payload omits', () => {
    // The other half of CONTRIBUTING's first performance rule, and the half nothing enforced:
    // a constructor must assign every field, including the ones the payload did not send. Miss
    // one and a structure built from a sparse payload has a different hidden class from one
    // built from a full payload — two shapes for one type, on the objects built most.
    //
    // Per-structure versions of this exist (S7, GS1, CH9, R3); this is the sweep, so a new
    // structure is covered without anybody writing a matching test.
    const differing: string[] = []

    for (const { name, sparse, full } of VARIANTS) {
      const sparseKeys = Object.keys(sparse)
      const fullKeys = Object.keys(full)
      if (sparseKeys.join(',') !== fullKeys.join(',')) {
        const missing = fullKeys.filter((key) => !sparseKeys.includes(key))
        const extra = sparseKeys.filter((key) => !fullKeys.includes(key))
        differing.push(
          `${name}: sparse is missing [${missing.join(', ')}]` +
            (extra.length > 0 ? `, and has extra [${extra.join(', ')}]` : ''),
        )
      }
    }

    assert.deepEqual(differing, [], ['these build two shapes:', ...differing].join(NEWLINE))
  })

  it('SH4: compares a real set of variants', () => {
    // Guards the guard: an empty VARIANTS list would make SH3 pass by comparing nothing.
    assert.ok(VARIANTS.length >= 9, `expected a real set; got ${String(VARIANTS.length)}`)
    for (const { name, sparse } of VARIANTS) {
      assert.ok(Object.keys(sparse).length > 0, `${name} has no own fields at all`)
    }
  })
})
