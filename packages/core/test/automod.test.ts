import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
  GatewayOpcodes,
  type APIAutoModerationActionExecution,
  type APIAutoModerationRule,
  type GatewayDispatchPayload,
} from '@vestra/types'
import {
  CacheRegistry,
  EventRouter,
  handlers,
  type CacheOptions,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'
import { AutoModerationActionExecution, AutoModerationRule } from '@vestra/core'
import {} from '@vestra/core'

/**
 * The Auto Moderation structures and the four dispatches that produce them.
 *
 * @remarks
 * The structure is imported from `dist` by relative path rather than from `@vestra/core`,
 * because it is not on the barrel yet — and so are the handlers, which are not in the
 * registry yet. Both resolve to the same module instances the router loads, so `instanceof`
 * still means what it says. When the wiring lands these become plain `@vestra/core` imports.
 *
 * The router is built by hand from the four handlers for the same reason: `handlers` does not
 * contain them yet.
 */

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }

const GUILD_ID = '613425648685547541'
const USER_ID = '80351110224678912'
const CHANNEL_ID = '41771983423143936'
const ALERT_CHANNEL_ID = '155117677105512449'
const MESSAGE_ID = '900000000000000000'
const ALERT_MESSAGE_ID = '900000000000000001'
/** Encodes 2022-04-15T05:20:00.000Z, so the creation time is checkable against a literal. */
const RULE_ID = '964394640998400001'
const RULE_CREATED_AT = 1650000000000

/** A `Keyword` rule with every trigger field and three shapes of action. */
function ruleFull(): APIAutoModerationRule {
  return {
    id: RULE_ID,
    guild_id: GUILD_ID,
    name: 'No invites',
    creator_id: USER_ID,
    event_type: AutoModerationRuleEventType.MessageSend,
    trigger_type: AutoModerationRuleTriggerType.Keyword,
    trigger_metadata: {
      keyword_filter: ['discord.gg', 'join my'],
      regex_patterns: ['^spam'],
      presets: [AutoModerationRuleKeywordPresetType.Slurs],
      allow_list: ['discord.gg/vestra'],
      mention_total_limit: 5,
      mention_raid_protection_enabled: true,
    },
    actions: [
      { type: AutoModerationActionType.BlockMessage, metadata: { custom_message: 'Not here.' } },
      {
        type: AutoModerationActionType.SendAlertMessage,
        metadata: { channel_id: ALERT_CHANNEL_ID },
      },
      { type: AutoModerationActionType.Timeout, metadata: { duration_seconds: 60 } },
      { type: AutoModerationActionType.BlockMemberInteraction },
    ],
    enabled: true,
    exempt_roles: ['41771983423143936'],
    exempt_channels: [CHANNEL_ID],
  }
}

/** A `Spam` rule, whose trigger metadata Discord sends empty. */
function ruleSparse(): APIAutoModerationRule {
  return {
    id: RULE_ID,
    guild_id: GUILD_ID,
    name: 'No spam',
    creator_id: USER_ID,
    event_type: AutoModerationRuleEventType.MessageSend,
    trigger_type: AutoModerationRuleTriggerType.Spam,
    trigger_metadata: {},
    actions: [{ type: AutoModerationActionType.BlockMessage }],
    enabled: false,
    exempt_roles: [],
    exempt_channels: [],
  }
}

/** An execution carrying every optional field. */
function executionFull(): APIAutoModerationActionExecution {
  return {
    guild_id: GUILD_ID,
    action: {
      type: AutoModerationActionType.SendAlertMessage,
      metadata: { channel_id: ALERT_CHANNEL_ID },
    },
    rule_id: RULE_ID,
    rule_trigger_type: AutoModerationRuleTriggerType.Keyword,
    user_id: USER_ID,
    channel_id: CHANNEL_ID,
    message_id: MESSAGE_ID,
    alert_system_message_id: ALERT_MESSAGE_ID,
    content: 'join discord.gg/spam',
    matched_keyword: 'discord.gg',
    matched_content: 'discord.gg',
  }
}

/** A blocked message from a bot with no `MessageContent` intent: nothing optional survives. */
function executionSparse(): APIAutoModerationActionExecution {
  return {
    guild_id: GUILD_ID,
    action: { type: AutoModerationActionType.BlockMemberInteraction },
    rule_id: RULE_ID,
    rule_trigger_type: AutoModerationRuleTriggerType.MemberProfile,
    user_id: USER_ID,
    content: '',
    matched_keyword: null,
    matched_content: null,
  }
}

describe('the AutoModerationRule structure', () => {
  it('AM1: mirrors the payload, taking its guild from the rule rather than an argument', () => {
    // `guild_id` is on the rule here, unlike `APIRole`, so a constructor argument for it would
    // be a second source for one value and the two could disagree.
    const rule = new AutoModerationRule(ruleFull(), undefined)

    assert.equal(rule.id, RULE_ID)
    assert.equal(rule.guildId, GUILD_ID)
    assert.equal(rule.name, 'No invites')
    assert.equal(rule.creatorId, USER_ID)
    assert.equal(rule.eventType, AutoModerationRuleEventType.MessageSend)
    assert.equal(rule.triggerType, AutoModerationRuleTriggerType.Keyword)
    assert.equal(rule.enabled, true)
    assert.deepEqual(rule.exemptRoles, ['41771983423143936'])
    assert.deepEqual(rule.exemptChannels, [CHANNEL_ID])
  })

  it('AM2: converts trigger_metadata rather than holding it by reference', () => {
    // The house rule, and both halves of it: a held reference would put
    // `rule.triggerMetadata.keyword_filter` in user code, and it would alias the dispatch the
    // router is still holding.
    const payload = ruleFull()
    const rule = new AutoModerationRule(payload, undefined)

    assert.deepEqual(rule.triggerMetadata, {
      keywordFilter: ['discord.gg', 'join my'],
      regexPatterns: ['^spam'],
      presets: [AutoModerationRuleKeywordPresetType.Slurs],
      allowList: ['discord.gg/vestra'],
      mentionTotalLimit: 5,
      mentionRaidProtectionEnabled: true,
    })
    assert.deepEqual(
      Object.keys(rule.triggerMetadata).filter((key) => key.includes('_')),
      [],
      'a snake_case key reached the structure',
    )
  })

  it('AM3: copies the trigger arrays instead of aliasing the dispatch', () => {
    const payload = ruleFull()
    const rule = new AutoModerationRule(payload, undefined)

    payload.trigger_metadata.keyword_filter?.push('added after the fact')
    payload.exempt_roles.push('9')

    assert.deepEqual(rule.triggerMetadata.keywordFilter, ['discord.gg', 'join my'])
    assert.deepEqual(rule.exemptRoles, ['41771983423143936'])
  })

  it('AM4: converts every action and its metadata', () => {
    const rule = new AutoModerationRule(ruleFull(), undefined)

    assert.deepEqual(rule.actions, [
      {
        type: AutoModerationActionType.BlockMessage,
        metadata: { channelId: undefined, durationSeconds: undefined, customMessage: 'Not here.' },
      },
      {
        type: AutoModerationActionType.SendAlertMessage,
        metadata: {
          channelId: ALERT_CHANNEL_ID,
          durationSeconds: undefined,
          customMessage: undefined,
        },
      },
      {
        type: AutoModerationActionType.Timeout,
        metadata: { channelId: undefined, durationSeconds: 60, customMessage: undefined },
      },
      { type: AutoModerationActionType.BlockMemberInteraction, metadata: undefined },
    ])
  })

  it('AM5: copies the actions array rather than aliasing it', () => {
    const payload = ruleFull()
    const rule = new AutoModerationRule(payload, undefined)

    payload.actions.push({ type: AutoModerationActionType.Timeout })

    assert.equal(rule.actions.length, 4, 'the structure followed the payload array')
  })

  it('AM6: leaves an unsent trigger field undefined rather than inventing an empty array', () => {
    // A `Spam` rule has no keyword filter at all. An empty array would say it has one and it
    // is empty, which is what a `Keyword` rule with nothing in it looks like — a different
    // fact, and Discord takes care to send the two differently.
    const rule = new AutoModerationRule(ruleSparse(), undefined)

    assert.equal(rule.triggerMetadata.keywordFilter, undefined)
    assert.equal(rule.triggerMetadata.presets, undefined)
    assert.equal(rule.triggerMetadata.mentionTotalLimit, undefined)
  })

  it('AM7: leaves an action that carried no metadata with none', () => {
    const rule = new AutoModerationRule(ruleSparse(), undefined)

    assert.equal(rule.actions[0]?.metadata, undefined)
  })

  it('AM8: builds one shape whatever the payload omits', () => {
    // CONTRIBUTING's first performance rule. `shape.test.ts` sweeps this for every structure
    // in its VARIANTS list; this one is not on the barrel yet, so it is checked here.
    const sparse = new AutoModerationRule(ruleSparse(), undefined)
    const full = new AutoModerationRule(ruleFull(), undefined)

    assert.deepEqual(Object.keys(sparse), Object.keys(full), 'the two builds differ in shape')
    assert.ok(Object.keys(sparse).length > 0, 'the structure has no own fields at all')
  })

  it('AM9: reads the creation time out of the ID', () => {
    const rule = new AutoModerationRule(ruleFull(), undefined)

    assert.equal(rule.createdTimestamp, RULE_CREATED_AT)
    assert.equal(rule.createdAt.toISOString(), '2022-04-15T05:20:00.000Z')
  })
})

describe('the AutoModerationActionExecution structure', () => {
  it('AE1: mirrors the execution payload, converting its one action', () => {
    const execution = new AutoModerationActionExecution(executionFull(), undefined)

    assert.equal(execution.guildId, GUILD_ID)
    assert.equal(execution.ruleId, RULE_ID)
    assert.equal(execution.ruleTriggerType, AutoModerationRuleTriggerType.Keyword)
    assert.equal(execution.userId, USER_ID)
    assert.equal(execution.channelId, CHANNEL_ID)
    assert.equal(execution.messageId, MESSAGE_ID)
    assert.equal(execution.alertSystemMessageId, ALERT_MESSAGE_ID)
    assert.equal(execution.content, 'join discord.gg/spam')
    assert.equal(execution.matchedKeyword, 'discord.gg')
    assert.equal(execution.matchedContent, 'discord.gg')
    assert.deepEqual(execution.action, {
      type: AutoModerationActionType.SendAlertMessage,
      metadata: {
        channelId: ALERT_CHANNEL_ID,
        durationSeconds: undefined,
        customMessage: undefined,
      },
    })
  })

  it('AE2: keeps the three absent IDs absent rather than guessing at them', () => {
    // A blocked message never got an ID, and a `MemberProfile` match was never in a channel.
    const execution = new AutoModerationActionExecution(executionSparse(), undefined)

    assert.equal(execution.channelId, undefined)
    assert.equal(execution.messageId, undefined)
    assert.equal(execution.alertSystemMessageId, undefined)
    assert.equal(execution.matchedKeyword, null)
    assert.equal(execution.matchedContent, null)
  })

  it('AE3: builds one shape whatever the payload omits', () => {
    const sparse = new AutoModerationActionExecution(executionSparse(), undefined)
    const full = new AutoModerationActionExecution(executionFull(), undefined)

    assert.deepEqual(Object.keys(sparse), Object.keys(full), 'the two builds differ in shape')
    assert.ok(Object.keys(sparse).length > 0, 'the structure has no own fields at all')
  })
})

/** Every scope on, so a write to any of them would be visible. */
const ALL_SCOPES: CacheOptions = {
  guilds: true,
  channels: true,
  threads: true,
  roles: true,
  members: true,
  users: true,
  messages: true,
  emojis: true,
  stickers: true,
  presences: true,
  voiceStates: true,
}

function harness(): {
  router: EventRouter
  context: EventContext
  emitted: { event: string; args: unknown[] }[]
} {
  const emitted: { event: string; args: unknown[] }[] = []
  const context: EventContext = {
    cache: new CacheRegistry(ALL_SCOPES),
    rest: undefined as never,
    user: undefined,
    emit: (event: string, ...args: unknown[]) => {
      emitted.push({ event, args })
      return true
    },
    listenerCount: () => 0,
  } as EventContext

  // The real registry now that these are wired into it, like every other handler test — so
  // this also fails if one of them is dropped from it.
  const router = new EventRouter(context, handlers)

  return { router, context, emitted }
}

function dispatch(t: string, d: unknown): GatewayDispatchPayload {
  return { op: GatewayOpcodes.Dispatch, t, s: 1, d } as GatewayDispatchPayload
}

describe('Auto Moderation handlers', () => {
  it('AH1: emits the new rule as a structure', () => {
    const { router, emitted } = harness()
    router.route(dispatch('AUTO_MODERATION_RULE_CREATE', ruleFull()), shard, false)

    const last = emitted.at(-1)
    assert.equal(last?.event, 'autoModerationRuleCreate')
    const rule = last.args[0]
    assert.ok(rule instanceof AutoModerationRule)
    assert.equal(rule.id, RULE_ID)
    assert.equal(rule.guildId, GUILD_ID)
  })

  it('AH2: emits the updated rule, carrying what changed', () => {
    const { router, emitted } = harness()
    const edited = ruleFull()
    edited.name = 'No invites, really'
    edited.enabled = false
    router.route(dispatch('AUTO_MODERATION_RULE_UPDATE', edited), shard, false)

    const last = emitted.at(-1)
    assert.equal(last?.event, 'autoModerationRuleUpdate')
    const rule = last.args[0]
    assert.ok(rule instanceof AutoModerationRule)
    assert.equal(rule.name, 'No invites, really')
    assert.equal(rule.enabled, false)
  })

  it('AH3: emits the whole rule on a delete, not just its ID', () => {
    // The payload carries the whole rule, so a listener gets the trigger and the actions of
    // the rule that just went away. Emitting an ID would throw away what actually arrived.
    const { router, emitted } = harness()
    router.route(dispatch('AUTO_MODERATION_RULE_DELETE', ruleFull()), shard, false)

    const last = emitted.at(-1)
    assert.equal(last?.event, 'autoModerationRuleDelete')
    const rule = last.args[0]
    assert.ok(rule instanceof AutoModerationRule)
    assert.equal(rule.id, RULE_ID)
    assert.equal(rule.name, 'No invites')
    assert.equal(rule.actions.length, 4)
  })

  it('AH4: emits an execution report rather than a rule', () => {
    // `AUTO_MODERATION_ACTION_EXECUTION` is not a rule: it names one by ID and carries the
    // single action that ran. Emitting a rule here would mean inventing the nine fields the
    // dispatch does not send.
    const { router, emitted } = harness()
    router.route(dispatch('AUTO_MODERATION_ACTION_EXECUTION', executionFull()), shard, false)

    const last = emitted.at(-1)
    assert.equal(last?.event, 'autoModerationActionExecution')
    const execution = last.args[0]
    assert.ok(execution instanceof AutoModerationActionExecution)
    assert.equal(execution instanceof AutoModerationRule, false)
    assert.equal(execution.ruleId, RULE_ID)
    assert.equal(execution.action.type, AutoModerationActionType.SendAlertMessage)
  })

  it('AH5: gives each dispatch its own event rather than one shared one', () => {
    // Four dispatches, four events. Registering a handler under the wrong dispatch name is the
    // failure `EventHandler.event` exists to catch.
    const { router, emitted } = harness()
    router.route(dispatch('AUTO_MODERATION_RULE_CREATE', ruleFull()), shard, false)
    router.route(dispatch('AUTO_MODERATION_RULE_UPDATE', ruleFull()), shard, false)
    router.route(dispatch('AUTO_MODERATION_RULE_DELETE', ruleFull()), shard, false)
    router.route(dispatch('AUTO_MODERATION_ACTION_EXECUTION', executionFull()), shard, false)

    // `raw` fires for every dispatch and is not what this is about.
    assert.deepEqual(
      emitted.map((entry) => entry.event).filter((event) => event !== 'raw'),
      [
        'autoModerationRuleCreate',
        'autoModerationRuleUpdate',
        'autoModerationRuleDelete',
        'autoModerationActionExecution',
      ],
    )
  })

  it('AH6: caches nothing anywhere', () => {
    // The decision recorded on `AutoModerationRule`: ten cold objects per guild, visible only
    // to a bot with ManageGuild, and every dispatch carries the whole rule — so a scope would
    // sit empty in almost every process while costing a store, a key row, an evictGuild branch
    // and a case in every adapter. This is what makes that claim checkable.
    const { router, context } = harness()
    router.route(dispatch('AUTO_MODERATION_RULE_CREATE', ruleFull()), shard, false)
    router.route(dispatch('AUTO_MODERATION_RULE_UPDATE', ruleFull()), shard, false)
    router.route(dispatch('AUTO_MODERATION_RULE_DELETE', ruleFull()), shard, false)
    router.route(dispatch('AUTO_MODERATION_ACTION_EXECUTION', executionFull()), shard, false)

    const filled = context.cache.stores
      .filter((store) => store.size > 0)
      .map((store) => store.scope)
    assert.deepEqual(filled, [], 'the Auto Moderation handlers must write to no scope')
  })
})
