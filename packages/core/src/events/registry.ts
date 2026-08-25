import type { AnyEventHandler } from './EventHandler.js'
import { guildAuditLogEntryCreate } from './handlers/auditlog.js'
import {
  autoModerationActionExecution,
  autoModerationRuleCreate,
  autoModerationRuleDelete,
  autoModerationRuleUpdate,
} from './handlers/automod.js'
import { guildBanAdd, guildBanRemove } from './handlers/bans.js'
import { interactionCreate } from './handlers/interactions.js'
import {
  guildScheduledEventCreate,
  guildScheduledEventDelete,
  guildScheduledEventUpdate,
  guildScheduledEventUserAdd,
  guildScheduledEventUserRemove,
} from './handlers/scheduled.js'
import {
  channelCreate,
  channelDelete,
  channelUpdate,
  threadCreate,
  threadDelete,
  threadListSync,
  threadMembersUpdate,
  threadUpdate,
} from './handlers/channels.js'
import { guildEmojisUpdate, guildStickersUpdate } from './handlers/expressions.js'
import { guildCreate, guildDelete, guildUpdate } from './handlers/guilds.js'
import { inviteCreate, inviteDelete } from './handlers/invites.js'
import { presenceUpdate } from './handlers/presence.js'
import {
  messageReactionAdd,
  messageReactionRemove,
  messageReactionRemoveAll,
  messageReactionRemoveEmoji,
} from './handlers/reactions.js'
import { voiceStateUpdate } from './handlers/voice.js'
import { channelPinsUpdate, messageDeleteBulk, typingStart } from './handlers/misc.js'
import { guildMemberAdd, guildMemberRemove, guildMemberUpdate } from './handlers/members.js'
import { messageCreate, messageDelete, messageUpdate } from './handlers/messages.js'
import { ready, userUpdate } from './handlers/ready.js'
import { roleCreate, roleDelete, roleUpdate } from './handlers/roles.js'
import { stageInstanceCreate, stageInstanceDelete, stageInstanceUpdate } from './handlers/stage.js'

/**
 * Every dispatch that has a handler.
 *
 * @remarks
 * CLAUDE.md's rule in one place: adding a gateway event means adding a file under
 * `handlers/` plus one line here. That is the whole registration mechanism, and it is a
 * plain array rather than a map keyed by event name because the key would duplicate the
 * handler's own `event` field and the two could then disagree — {@link EventRouter.register}
 * files each handler under its own name for exactly that reason.
 *
 * **Every dispatch Discord defines is accounted for.** Seventy-six exist: fifty-one are
 * handled here and the remaining twenty-five are listed in `events/unhandled.ts`, each with
 * the reason it has no handler. Those reach consumers through `raw` and nothing else, which
 * is what makes adding a handler later purely additive rather than a change to an existing
 * event's arguments. `packages/core/test/event-coverage.test.ts` fails naming any dispatch
 * that is neither.
 */
export const handlers: readonly AnyEventHandler[] = [
  ready,
  userUpdate,

  messageCreate,
  messageUpdate,
  messageDelete,

  guildCreate,
  guildUpdate,
  guildDelete,

  channelCreate,
  channelUpdate,
  channelDelete,

  threadCreate,
  threadUpdate,
  threadDelete,
  threadListSync,
  threadMembersUpdate,

  messageReactionAdd,
  messageReactionRemove,
  messageReactionRemoveAll,
  messageReactionRemoveEmoji,

  messageDeleteBulk,
  channelPinsUpdate,
  typingStart,

  guildEmojisUpdate,
  guildStickersUpdate,

  presenceUpdate,
  voiceStateUpdate,

  interactionCreate,
  guildAuditLogEntryCreate,

  guildScheduledEventCreate,
  guildScheduledEventUpdate,
  guildScheduledEventDelete,
  guildScheduledEventUserAdd,
  guildScheduledEventUserRemove,

  autoModerationRuleCreate,
  autoModerationRuleUpdate,
  autoModerationRuleDelete,
  autoModerationActionExecution,

  guildBanAdd,
  guildBanRemove,

  guildMemberAdd,
  guildMemberUpdate,
  guildMemberRemove,

  roleCreate,
  roleUpdate,
  roleDelete,

  inviteCreate,
  inviteDelete,

  stageInstanceCreate,
  stageInstanceUpdate,
  stageInstanceDelete,
]
