import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REST } from '@vestra/rest'
import { json, startMockDiscord, type MockDiscord, type RecordedRequest } from './mock-discord.ts'

/**
 * Emoji and sticker endpoints.
 *
 * @remarks
 * The library modelled both payloads and emitted `guildEmojisUpdate` and `guildStickersUpdate`
 * from the gateway, and offered no way to create, edit or delete either. A bot could watch an
 * emoji appear and not put one there.
 *
 * Three things here are invisible to the type system and wrong in ways that compile:
 *
 * - The **application emoji listing** answers `{ items: [...] }` rather than an array, alone
 *   among the listings in this API. Unwrapping it is behaviour, not a type.
 * - **Creating a sticker sends form parts**, not `payload_json` — the only route in the API
 *   that does — and its file part is named `file` rather than `files[0]`.
 * - **Editing an emoji's roles replaces the list.** Nothing catches sending one ID meaning
 *   "add", which quietly removes every other.
 */

const GUILD = '613425648685547541'
const APPLICATION = '292180391104217088'
const EMOJI = '41771983429993937'
const STICKER = '112233445566778899'
const ROLE = '41771983423143936'

/** Records every request and answers each with the given body. */
async function recording(body: unknown = {}): Promise<MockDiscord> {
  return await startMockDiscord((_request, response) => {
    json(response, 200, body)
  })
}

function clientFor(mock: MockDiscord): REST {
  return new REST({ api: mock.url, version: '10', timeout: 2_000 }).setToken('t0ken')
}

/** The nth request the mock received. */
function at(mock: MockDiscord, index: number): RecordedRequest {
  const request = mock.requests[index]
  assert.ok(request !== undefined, `expected a request at index ${String(index)}`)
  return request
}

/** One header, flattened, since Node types a repeated header as an array. */
function header(request: RecordedRequest, name: string): string {
  const value = request.headers[name]
  if (value === undefined) return ''
  return Array.isArray(value) ? value.join(', ') : value
}

/** The one request the mock received. */
function only(mock: MockDiscord): RecordedRequest {
  assert.equal(mock.requests.length, 1, 'expected exactly one request')
  return at(mock, 0)
}

describe('guild emoji routes', () => {
  it('EM1: lists, fetches and deletes on the guild emoji path', async () => {
    const mock = await recording([])
    try {
      const rest = clientFor(mock)
      await rest.emojis.getForGuild(GUILD)
      await rest.emojis.getForGuildById(GUILD, EMOJI)
      await rest.emojis.deleteForGuild(GUILD, EMOJI, { reason: 'unused' })

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `GET /v10/guilds/${GUILD}/emojis`,
          `GET /v10/guilds/${GUILD}/emojis/${EMOJI}`,
          `DELETE /v10/guilds/${GUILD}/emojis/${EMOJI}`,
        ],
      )
      assert.equal(at(mock, 2).headers['x-audit-log-reason'], 'unused')
    } finally {
      await mock.close()
    }
  })

  it('EM2: posts the image in the body as a data URI, not as a file', async () => {
    // Discord takes the picture as a base64 data URI inside a JSON body. Uploading it as
    // multipart — the shape every other image-carrying route in this API uses — is rejected,
    // and a plain base64 string without the `data:` prefix is rejected differently.
    const mock = await recording({ id: EMOJI })
    try {
      await clientFor(mock).emojis.createForGuild(GUILD, {
        name: 'blob',
        image: 'data:image/png;base64,iVBORw0KGgo=',
        roles: [ROLE],
      })
      const request = only(mock)

      assert.equal(request.method, 'POST')
      assert.equal(request.url, `/v10/guilds/${GUILD}/emojis`)
      assert.match(header(request, 'content-type'), /application\/json/)
      assert.deepEqual(JSON.parse(request.body), {
        name: 'blob',
        image: 'data:image/png;base64,iVBORw0KGgo=',
        roles: [ROLE],
      })
    } finally {
      await mock.close()
    }
  })

  it('EM3: sends a role clear as null rather than as an empty list', async () => {
    // `null` removes the restriction; `[]` is a restriction to no roles at all, which makes
    // the emoji unusable by everybody. One character apart and opposite in effect.
    const mock = await recording({ id: EMOJI })
    try {
      await clientFor(mock).emojis.editForGuild(GUILD, EMOJI, { roles: null })
      const request = only(mock)

      assert.equal(request.method, 'PATCH')
      assert.equal(request.url, `/v10/guilds/${GUILD}/emojis/${EMOJI}`)
      assert.deepEqual(JSON.parse(request.body), { roles: null })
    } finally {
      await mock.close()
    }
  })
})

describe('application emoji routes', () => {
  it('EM4: unwraps the listing Discord wraps', async () => {
    const mock = await recording({ items: [{ id: EMOJI, name: 'blob' }] })
    try {
      const emojis = await clientFor(mock).emojis.getForApplication(APPLICATION)

      assert.equal(only(mock).url, `/v10/applications/${APPLICATION}/emojis`)
      // An array, not `{ items: [...] }`. A caller writing `emojis.length` on the raw body
      // would get `undefined` and a loop that never runs, which is the failure this prevents.
      assert.ok(Array.isArray(emojis))
      assert.equal(emojis.length, 1)
      assert.equal(emojis[0]?.name, 'blob')
    } finally {
      await mock.close()
    }
  })

  it('EM5: addresses application emojis by application, never by guild', async () => {
    const mock = await recording({ id: EMOJI })
    try {
      const rest = clientFor(mock)
      await rest.emojis.createForApplication(APPLICATION, { name: 'blob', image: 'data:,' })
      await rest.emojis.editForApplication(APPLICATION, EMOJI, { name: 'renamed' })
      await rest.emojis.deleteForApplication(APPLICATION, EMOJI)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `POST /v10/applications/${APPLICATION}/emojis`,
          `PATCH /v10/applications/${APPLICATION}/emojis/${EMOJI}`,
          `DELETE /v10/applications/${APPLICATION}/emojis/${EMOJI}`,
        ],
      )
      // No `roles`: an application emoji has no guild whose roles it could be limited to.
      assert.deepEqual(JSON.parse(at(mock, 0).body), { name: 'blob', image: 'data:,' })
    } finally {
      await mock.close()
    }
  })
})

describe('sticker routes', () => {
  it('EM6: unwraps the sticker pack listing and keeps the flat routes flat', async () => {
    const mock = await recording({ sticker_packs: [{ id: '1', name: 'a pack' }] })
    try {
      const rest = clientFor(mock)
      const packs = await rest.stickers.getPacks()
      await rest.stickers.get(STICKER)

      assert.ok(Array.isArray(packs))
      assert.equal(packs.length, 1)
      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        ['GET /v10/sticker-packs', `GET /v10/stickers/${STICKER}`],
      )
    } finally {
      await mock.close()
    }
  })

  it('EM7: uploads a sticker as form parts with the file part named `file`', async () => {
    // The whole reason `RequestData` has a `fields` member. Discord wants `name`,
    // `description` and `tags` as discrete text parts here rather than inside `payload_json`,
    // and the asset under the part name `file` rather than `files[0]`. Both are invisible in
    // a signature and both fail against the real API rather than against a type.
    const mock = await recording({ id: STICKER })
    try {
      await clientFor(mock).stickers.createForGuild(
        GUILD,
        { name: 'blobwave', description: 'a waving blob', tags: 'wave' },
        { name: 'blob.png', data: 'PNGDATA', contentType: 'image/png' },
      )
      const request = only(mock)

      assert.equal(request.method, 'POST')
      assert.equal(request.url, `/v10/guilds/${GUILD}/stickers`)
      assert.match(header(request, 'content-type'), /multipart\/form-data/)

      // Read off the raw multipart body: each field arrives under its own
      // `Content-Disposition`, and none of them is `payload_json`.
      assert.match(request.body, /name="name"[\s\S]*?blobwave/)
      assert.match(request.body, /name="description"[\s\S]*?a waving blob/)
      assert.match(request.body, /name="tags"[\s\S]*?wave/)
      assert.match(request.body, /name="file"; filename="blob\.png"/)
      assert.doesNotMatch(request.body, /payload_json/)
    } finally {
      await mock.close()
    }
  })

  it('EM8: edits sticker metadata as JSON, since the asset cannot change', async () => {
    const mock = await recording({ id: STICKER })
    try {
      const rest = clientFor(mock)
      await rest.stickers.editForGuild(GUILD, STICKER, { description: null })
      await rest.stickers.deleteForGuild(GUILD, STICKER)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [
          `PATCH /v10/guilds/${GUILD}/stickers/${STICKER}`,
          `DELETE /v10/guilds/${GUILD}/stickers/${STICKER}`,
        ],
      )
      assert.match(header(at(mock, 0), 'content-type'), /application\/json/)
      assert.deepEqual(JSON.parse(at(mock, 0).body), { description: null })
    } finally {
      await mock.close()
    }
  })

  it('EM9: lists and fetches a guild sticker by path', async () => {
    const mock = await recording([])
    try {
      const rest = clientFor(mock)
      await rest.stickers.getForGuild(GUILD)
      await rest.stickers.getForGuildById(GUILD, STICKER)

      assert.deepEqual(
        mock.requests.map((request) => `${request.method} ${request.url}`),
        [`GET /v10/guilds/${GUILD}/stickers`, `GET /v10/guilds/${GUILD}/stickers/${STICKER}`],
      )
    } finally {
      await mock.close()
    }
  })
})
