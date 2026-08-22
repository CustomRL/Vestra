import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import {
  ApplicationCommandType,
  ComponentType,
  GatewayOpcodes,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  MessageType,
  type APIInteraction,
  type APIInteractionResponse,
  type APIMessage,
  type GatewayDispatchPayload,
} from '@vestra/types'
import {
  CacheRegistry,
  EventRouter,
  handlers,
  Message,
  User,
  type CacheOptions,
  type DispatchShard,
  type EventContext,
  type RestCapable,
} from '@vestra/core'
// Not on the barrel yet — the registry line and the `structures/index.ts` export are the
// caller's to add, so these come straight from the built output of their own files.
import { Interaction } from '@vestra/core'

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }
const INTERACTION_ID = '1002960826007359488'
const APPLICATION_ID = '81384788765712384'
const GUILD_ID = '613425648685547541'
const CHANNEL_ID = '41771983423143936'
const USER_ID = '80351110224678912'
const TOKEN = 'aW50ZXJhY3Rpb246dG9rZW4'

const USER = {
  id: USER_ID,
  username: 'nelly',
  discriminator: '0',
  global_name: null,
  avatar: null,
}

function apiMessage(id: string): APIMessage {
  return {
    id,
    channel_id: CHANNEL_ID,
    author: USER,
    content: 'hello',
    timestamp: '2023-01-01T00:00:00+00:00',
    edited_timestamp: null,
    tts: false,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: MessageType.Default,
  }
}

/** A slash command invoked in a guild: the case where the invoking user is nested. */
const GUILD_COMMAND: APIInteraction = {
  id: INTERACTION_ID,
  application_id: APPLICATION_ID,
  type: InteractionType.ApplicationCommand,
  data: { id: '2', name: 'ping', type: ApplicationCommandType.ChatInput },
  guild_id: GUILD_ID,
  channel_id: CHANNEL_ID,
  member: {
    user: USER,
    roles: [],
    joined_at: '2021-03-14T12:00:00.000000+00:00',
    deaf: false,
    mute: false,
    flags: 0,
    permissions: '2048',
  },
  token: TOKEN,
  version: 1,
  app_permissions: '379904',
  locale: 'en-US',
  guild_locale: 'en-GB',
  entitlements: [],
  authorizing_integration_owners: { '0': GUILD_ID },
  context: 0,
  attachment_size_limit: 8_388_608,
}

/** The same command invoked in a DM: the case where it is at the top level. */
const DM_COMMAND: APIInteraction = {
  id: INTERACTION_ID,
  application_id: APPLICATION_ID,
  type: InteractionType.ApplicationCommand,
  data: { id: '2', name: 'ping', type: ApplicationCommandType.ChatInput },
  channel_id: CHANNEL_ID,
  user: USER,
  token: TOKEN,
  version: 1,
  app_permissions: '0',
  entitlements: [],
  authorizing_integration_owners: { '1': USER_ID },
  attachment_size_limit: 8_388_608,
}

const COMPONENT: APIInteraction = {
  ...GUILD_COMMAND,
  type: InteractionType.MessageComponent,
  data: { custom_id: 'confirm', component_type: ComponentType.Button },
  message: apiMessage('m1'),
}

const AUTOCOMPLETE: APIInteraction = {
  ...GUILD_COMMAND,
  type: InteractionType.ApplicationCommandAutocomplete,
}

const MODAL_SUBMIT: APIInteraction = {
  ...GUILD_COMMAND,
  type: InteractionType.ModalSubmit,
  data: { custom_id: 'feedback', components: [] },
}

interface Call {
  method: string
  args: unknown[]
}

/** Records what would have been sent, so the response methods run without a socket. */
function restStub(): { client: RestCapable; calls: Call[] } {
  const calls: Call[] = []
  const record =
    (method: string, result: unknown) =>
    (...args: unknown[]): Promise<unknown> => {
      calls.push({ method, args })
      return Promise.resolve(result)
    }

  const client = {
    rest: {
      interactions: {
        reply: record('reply', undefined),
        getReply: record('getReply', apiMessage('original')),
        editReply: record('editReply', apiMessage('edited')),
        deleteReply: record('deleteReply', undefined),
        followUp: record('followUp', apiMessage('followup')),
      },
    },
  } as unknown as RestCapable

  return { client, calls }
}

function harness(options: CacheOptions = { users: true }): {
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

  // Its own router, because the registry line that would put this handler in `handlers` is
  // not written yet.
  return { router: new EventRouter(context, handlers), context, emitted }
}

function dispatch(t: string, d: unknown): GatewayDispatchPayload {
  return { op: GatewayOpcodes.Dispatch, t, s: 1, d } as GatewayDispatchPayload
}

describe('the Interaction structure', () => {
  it('IN1: mirrors the payload into camelCase fields', () => {
    const interaction = new Interaction(GUILD_COMMAND, undefined)

    assert.equal(interaction.id, INTERACTION_ID)
    assert.equal(interaction.applicationId, APPLICATION_ID)
    assert.equal(interaction.type, InteractionType.ApplicationCommand)
    assert.equal(interaction.token, TOKEN)
    assert.equal(interaction.guildId, GUILD_ID)
    assert.equal(interaction.channelId, CHANNEL_ID)
    assert.equal(interaction.appPermissions, '379904')
    assert.equal(interaction.locale, 'en-US')
    assert.equal(interaction.guildLocale, 'en-GB')
    assert.equal(interaction.context, 0)
    assert.equal(interaction.attachmentSizeLimit, 8_388_608)
    // Held by reference rather than copied, like a message's attachments.
    assert.equal(interaction.entitlements, GUILD_COMMAND.entitlements)
    assert.equal(
      interaction.authorizingIntegrationOwners,
      GUILD_COMMAND.authorizing_integration_owners,
    )
  })

  it('IN2: finds the invoking user nested in `member` on a guild interaction', () => {
    // The single most common interaction bug: `payload.user` is undefined for every guild
    // interaction, and reaching for it silently loses the invoker.
    const interaction = new Interaction(GUILD_COMMAND, undefined)

    assert.ok(interaction.user instanceof User)
    assert.equal(interaction.user.id, USER_ID)
    assert.ok(interaction.member !== undefined)
    assert.equal(interaction.member.guildId, GUILD_ID)
    assert.equal(interaction.member.userId, USER_ID)
    // The same object, not a second copy of it — one allocation, and identity holds.
    assert.equal(interaction.user, interaction.member.user)
  })

  it('IN3: finds it at the top level on a DM interaction', () => {
    const interaction = new Interaction(DM_COMMAND, undefined)

    assert.ok(interaction.user instanceof User)
    assert.equal(interaction.user.id, USER_ID)
    assert.equal(interaction.member, undefined)
    assert.equal(interaction.guildId, undefined)
  })

  it('IN4: narrows on `type` rather than on the shape of `data`', () => {
    // A command and an autocomplete carry byte-identical `data`, so anything probing for keys
    // answers the same for both. Only `type` tells them apart.
    const command = new Interaction(GUILD_COMMAND, undefined)
    const autocomplete = new Interaction(AUTOCOMPLETE, undefined)
    const component = new Interaction(COMPONENT, undefined)
    const modal = new Interaction(MODAL_SUBMIT, undefined)

    assert.deepEqual(
      [
        command.isCommand(),
        command.isAutocomplete(),
        command.isComponent(),
        command.isModalSubmit(),
      ],
      [true, false, false, false],
    )
    assert.deepEqual(
      [
        autocomplete.isCommand(),
        autocomplete.isAutocomplete(),
        autocomplete.isComponent(),
        autocomplete.isModalSubmit(),
      ],
      [false, true, false, false],
    )
    assert.deepEqual(
      [
        component.isCommand(),
        component.isAutocomplete(),
        component.isComponent(),
        component.isModalSubmit(),
      ],
      [false, false, true, false],
    )
    assert.deepEqual(
      [modal.isCommand(), modal.isAutocomplete(), modal.isComponent(), modal.isModalSubmit()],
      [false, false, false, true],
    )
  })

  it('IN5: holds `data` by reference and builds the component message as a structure', () => {
    const interaction = new Interaction(COMPONENT, undefined)

    // Not converted: the shape depends on `type`, so it stays the payload it arrived as.
    assert.equal(interaction.data, COMPONENT.data)
    assert.ok(interaction.message instanceof Message)
    assert.equal(interaction.message.id, 'm1')
    // A command carries no message at all.
    assert.equal(new Interaction(GUILD_COMMAND, undefined).message, undefined)
  })

  it('IN6: reads its creation time from its own snowflake', () => {
    const interaction = new Interaction(GUILD_COMMAND, undefined)

    assert.equal(interaction.createdTimestamp, 1659194895031)
    assert.equal(interaction.createdAt.toISOString(), '2022-07-30T15:28:15.031Z')
  })
})

describe('responding to an interaction', () => {
  it('IN7: replies against the interaction ID and token, once, with a source message', async () => {
    const { client, calls } = restStub()
    await new Interaction(GUILD_COMMAND, client).reply({ content: 'pong' })

    assert.deepEqual(calls, [
      {
        method: 'reply',
        args: [
          INTERACTION_ID,
          TOKEN,
          {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: { content: 'pong' },
          },
          {},
        ],
      },
    ])
  })

  it('IN8: defers with the type that buys fifteen minutes, carrying the flags', async () => {
    // The whole reason `deferReply` exists: it must send the *deferred* type, or the user
    // sees a real message instead of a loading state — and ephemerality is fixed here,
    // because the loading state is already public or already private.
    const { client, calls } = restStub()
    await new Interaction(GUILD_COMMAND, client).deferReply({ flags: MessageFlags.Ephemeral })

    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0]?.args[2], {
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data: { flags: MessageFlags.Ephemeral },
    })
  })

  it('IN9: passes a raw response through untouched', async () => {
    // The escape hatch for the response types the sugar does not name. An autocomplete
    // interaction has no other valid answer at all.
    const { client, calls } = restStub()
    const response: APIInteractionResponse = {
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: { choices: [{ name: 'one', value: '1' }] },
    }

    await new Interaction(AUTOCOMPLETE, client).respond(response)

    assert.equal(calls[0]?.args[2], response)
  })

  it('IN10: addresses every followup route by application ID, not interaction ID', async () => {
    // Discord splits the two: the callback route is keyed by the interaction, everything after
    // it is a webhook route keyed by the application. Swapping them is a 404 fifteen minutes
    // into a working command.
    const { client, calls } = restStub()
    const interaction = new Interaction(GUILD_COMMAND, client)

    const fetched = await interaction.fetchReply()
    const edited = await interaction.editReply({ content: 'done' })
    const followed = await interaction.followUp({ content: 'also' })
    await interaction.deleteReply()

    assert.deepEqual(
      calls.map((call) => call.method),
      ['getReply', 'editReply', 'followUp', 'deleteReply'],
    )
    for (const call of calls) {
      assert.equal(call.args[0], APPLICATION_ID, `${call.method} used the wrong ID`)
      assert.equal(call.args[1], TOKEN, `${call.method} sent the wrong token`)
    }

    // Structures back, not payloads — the difference between this vocabulary and `rest`.
    assert.ok(fetched instanceof Message)
    assert.equal(fetched.id, 'original')
    assert.ok(edited instanceof Message)
    assert.equal(edited.id, 'edited')
    assert.ok(followed instanceof Message)
    assert.equal(followed.id, 'followup')
  })
})

describe('the INTERACTION_CREATE handler', () => {
  it('IN11: emits the interaction as a structure', () => {
    const { router, emitted } = harness()
    router.route(dispatch('INTERACTION_CREATE', GUILD_COMMAND), shard, false)

    // `raw` fires for every dispatch and is not what this is about.
    const events = emitted.filter((entry) => entry.event !== 'raw')
    assert.equal(events.length, 1)
    const emit = events[0]
    assert.ok(emit !== undefined)
    assert.equal(emit.event, 'interactionCreate')
    const interaction = emit.args[0]
    assert.ok(interaction instanceof Interaction)
    assert.equal(interaction.id, INTERACTION_ID)
    assert.equal(interaction.token, TOKEN)
  })

  it('IN12: caches the invoking user and nothing else', () => {
    // Interactions are events, not entities: nothing is stored under the interaction's own ID,
    // and the message a component was attached to is a snapshot rather than a cache write.
    const { router, context } = harness({ users: true, messages: true, guilds: true })
    router.route(dispatch('INTERACTION_CREATE', COMPONENT), shard, false)

    assert.equal(context.cache.users.size, 1)
    assert.equal(context.cache.users.get(USER_ID)?.username, 'nelly')
    assert.equal(context.cache.messages.size, 0)
    assert.equal(context.cache.guilds.size, 0)
  })

  it('IN13: leaves the cache where it was when the dispatch is replayed', () => {
    // After a resume Discord replays what it already sent. The user cached the first time must
    // be patched in place rather than replaced, or a held reference goes stale on reconnect.
    const { router, context } = harness()
    router.route(dispatch('INTERACTION_CREATE', GUILD_COMMAND), shard, false)
    const first = context.cache.users.get(USER_ID)

    router.route(dispatch('INTERACTION_CREATE', GUILD_COMMAND), shard, true)

    assert.equal(context.cache.users.size, 1)
    assert.equal(context.cache.users.get(USER_ID), first)
  })
})
