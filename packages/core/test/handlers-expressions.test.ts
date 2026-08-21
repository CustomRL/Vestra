import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import { GatewayOpcodes, StickerFormatType, type GatewayDispatchPayload } from '@vestra/types'
import {
  CacheRegistry,
  createEmoji,
  Emoji,
  EventRouter,
  handlers,
  Sticker,
  type CacheOptions,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }
const GUILD_ID = '613425648685547541'

function emoji(id: string, name: string, extra: Record<string, unknown> = {}): unknown {
  return {
    id,
    name,
    roles: [],
    require_colons: true,
    managed: false,
    animated: false,
    available: true,
    ...extra,
  }
}

function sticker(id: string, name: string, extra: Record<string, unknown> = {}): unknown {
  return {
    id,
    name,
    description: null,
    tags: 'wave, hello',
    type: 2,
    format_type: StickerFormatType.PNG,
    guild_id: GUILD_ID,
    ...extra,
  }
}

function harness(options: CacheOptions = { emojis: true, stickers: true }): {
  router: EventRouter
  context: EventContext
  emitted: { event: string; args: unknown[] }[]
} {
  const emitted: { event: string; args: unknown[] }[] = []
  const context: EventContext = {
    cache: new CacheRegistry(options),
    rest: undefined as never,
    user: undefined,
    emit: (event: string, ...args: unknown[]) => {
      emitted.push({ event, args })
      return true
    },
    listenerCount: () => 0,
  } as EventContext

  return { router: new EventRouter(context, handlers), context, emitted }
}

function dispatch(t: string, d: unknown): GatewayDispatchPayload {
  return { op: GatewayOpcodes.Dispatch, t, s: 1, d } as GatewayDispatchPayload
}

describe('emoji and sticker handlers', () => {
  it('E1: drops an emoji that vanished from the new set', () => {
    // The whole reason these handlers reconcile. A deletion is expressed only as an absence
    // from the next full list — there is no event that names it — so adding what arrived and
    // stopping there leaves deleted emojis cached until the process restarts.
    const { router, context } = harness()
    router.route(
      dispatch('GUILD_EMOJIS_UPDATE', {
        guild_id: GUILD_ID,
        emojis: [emoji('1', 'alpha'), emoji('2', 'beta')],
      }),
      shard,
      false,
    )
    assert.equal(context.cache.emojis.size, 2)

    router.route(
      dispatch('GUILD_EMOJIS_UPDATE', { guild_id: GUILD_ID, emojis: [emoji('1', 'alpha')] }),
      shard,
      false,
    )

    assert.equal(context.cache.emojis.get('1')?.name, 'alpha')
    assert.equal(context.cache.emojis.get('2'), undefined)
    assert.equal(context.cache.emojis.size, 1)
  })

  it('E2: reconciles only the guild that changed', () => {
    // The group index is what makes this affordable, and what stops one guild's update
    // emptying another's emojis.
    const { router, context } = harness()
    router.route(
      dispatch('GUILD_EMOJIS_UPDATE', { guild_id: GUILD_ID, emojis: [emoji('1', 'alpha')] }),
      shard,
      false,
    )
    router.route(
      dispatch('GUILD_EMOJIS_UPDATE', { guild_id: '999', emojis: [emoji('9', 'other')] }),
      shard,
      false,
    )

    router.route(dispatch('GUILD_EMOJIS_UPDATE', { guild_id: GUILD_ID, emojis: [] }), shard, false)

    assert.equal(context.cache.emojis.get('1'), undefined)
    assert.equal(context.cache.emojis.get('9')?.name, 'other')
  })

  it('E3: patches a surviving emoji in place rather than replacing it', () => {
    const { router, context } = harness()
    router.route(
      dispatch('GUILD_EMOJIS_UPDATE', { guild_id: GUILD_ID, emojis: [emoji('1', 'alpha')] }),
      shard,
      false,
    )
    const held = context.cache.emojis.get('1')

    router.route(
      dispatch('GUILD_EMOJIS_UPDATE', { guild_id: GUILD_ID, emojis: [emoji('1', 'renamed')] }),
      shard,
      false,
    )

    assert.equal(held?.name, 'renamed')
    assert.equal(context.cache.emojis.get('1'), held)
  })

  it('E4: reports the removed emojis, and they are genuinely the removed ones', () => {
    // Not a "previous" list: the survivors get patched in place, so handing back what `group()`
    // returned before reconciling would report the new values under an old name. The removed
    // ones are safe because nothing patched them.
    const { router, emitted } = harness()
    router.route(
      dispatch('GUILD_EMOJIS_UPDATE', {
        guild_id: GUILD_ID,
        emojis: [emoji('1', 'alpha'), emoji('2', 'beta')],
      }),
      shard,
      false,
    )

    router.route(
      dispatch('GUILD_EMOJIS_UPDATE', { guild_id: GUILD_ID, emojis: [emoji('1', 'renamed')] }),
      shard,
      false,
    )

    const [guildId, current, removed] = emitted.at(-1)?.args as [string, Emoji[], Emoji[]]
    assert.equal(guildId, GUILD_ID)
    assert.deepEqual(
      current.map((entry) => entry.name),
      ['renamed'],
    )
    assert.deepEqual(
      removed.map((entry) => entry.name),
      ['beta'],
    )
  })

  it('E5: skips a payload with no ID, which is a standard Unicode emoji', () => {
    // `APIEmoji` covers both forms, and the reaction form has no ID. Caching it would need a
    // nullable key, which makes the whole scope unkeyable.
    const { router, context } = harness()
    router.route(
      dispatch('GUILD_EMOJIS_UPDATE', {
        guild_id: GUILD_ID,
        emojis: [{ id: null, name: '👍' }, emoji('1', 'alpha')],
      }),
      shard,
      false,
    )

    assert.equal(context.cache.emojis.size, 1)
    assert.equal(context.cache.emojis.get('1')?.name, 'alpha')
  })

  it('E6: reconciles stickers the same way', () => {
    const { router, context, emitted } = harness()
    router.route(
      dispatch('GUILD_STICKERS_UPDATE', {
        guild_id: GUILD_ID,
        stickers: [sticker('1', 'wave'), sticker('2', 'nod')],
      }),
      shard,
      false,
    )

    router.route(
      dispatch('GUILD_STICKERS_UPDATE', { guild_id: GUILD_ID, stickers: [sticker('1', 'wave')] }),
      shard,
      false,
    )

    assert.equal(context.cache.stickers.get('2'), undefined)
    const removed = (emitted.at(-1)?.args as [string, Sticker[], Sticker[]])[2]
    assert.deepEqual(
      removed.map((entry) => entry.name),
      ['nod'],
    )
  })
})

describe('Emoji and Sticker structures', () => {
  it('E7: keeps the reaction identifier and the message markup apart', () => {
    // The classic reaction bug: the REST route takes `name:id` and rejects `<:name:id>` with a
    // 400 that does not explain itself.
    const built = createEmoji(emoji('41771983423143936', 'vestra') as never, GUILD_ID, undefined)

    assert.ok(built instanceof Emoji)
    assert.equal(built.identifier, 'vestra:41771983423143936')
    assert.equal(String(built), '<:vestra:41771983423143936>')
  })

  it('E8: marks an animated emoji in both forms and in its URL', () => {
    // Discord serves the animated and static images under the same ID, so asking for the wrong
    // extension returns the wrong thing rather than a 404.
    const built = createEmoji(
      emoji('41771983423143936', 'spin', { animated: true }) as never,
      GUILD_ID,
      undefined,
    )

    assert.ok(built instanceof Emoji)
    assert.equal(String(built), '<a:spin:41771983423143936>')
    assert.ok(built.imageUrl.endsWith('.gif'))
  })

  it('E9: refuses to build an emoji with no ID', () => {
    assert.equal(createEmoji({ id: null, name: '👍' }, GUILD_ID, undefined), undefined)
  })

  it('E10: splits the sticker tag string and trims what it produces', () => {
    // Mirroring the raw string would put the split and the trim in every consumer, and half of
    // them would forget the trim.
    const built = new Sticker(sticker('1', 'wave', { tags: 'wave,  hello , ' }) as never, undefined)

    assert.deepEqual(built.tags, ['wave', 'hello'])
    assert.deepEqual(new Sticker(sticker('1', 'x', { tags: '' }) as never, undefined).tags, [])
  })

  it('E11: sends Lottie and GIF stickers to the right hosts', () => {
    // Not one URL shape with a swapped extension. A Lottie sticker is JSON, and a GIF sticker
    // comes from the media host rather than the CDN.
    const png = new Sticker(sticker('1', 'a') as never, undefined)
    const lottie = new Sticker(
      sticker('2', 'b', { format_type: StickerFormatType.Lottie }) as never,
      undefined,
    )
    const gif = new Sticker(
      sticker('3', 'c', { format_type: StickerFormatType.GIF }) as never,
      undefined,
    )

    assert.equal(png.assetUrl, 'https://cdn.discordapp.com/stickers/1.png')
    assert.equal(lottie.assetUrl, 'https://cdn.discordapp.com/stickers/2.json')
    assert.equal(gif.assetUrl, 'https://media.discordapp.net/stickers/3.gif')
  })
})
