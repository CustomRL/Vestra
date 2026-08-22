import {
  AutoModerationActionExecution,
  AutoModerationRule,
} from '../../structures/AutoModerationRule.js'
import { defineHandler } from '../EventHandler.js'

/**
 * Auto Moderation dispatches.
 *
 * @remarks
 * **Nothing is cached.** {@link AutoModerationRule} records why there is no scope: at most ten
 * cold configuration objects per guild, visible only to a bot with `ManageGuild`, and every
 * dispatch carries the whole rule anyway.
 *
 * **All four need `ManageGuild`.** A bot without it never receives one, so an empty stream
 * here is a permission answer rather than a quiet guild — and the `AutoModerationConfiguration`
 * and `AutoModerationExecution` intents gate the rule events and the execution event
 * separately, so a bot can see rules change and never see one fire.
 *
 * **The fourth is not a rule.** `AUTO_MODERATION_ACTION_EXECUTION` reports that a rule matched
 * and carries its own payload — one action, not the rule's set — so it emits
 * {@link AutoModerationActionExecution} rather than a rule that would be nine invented fields.
 */

/** A rule was created. */
export const autoModerationRuleCreate = defineHandler(
  'AUTO_MODERATION_RULE_CREATE',
  (client, data) => {
    client.emit('autoModerationRuleCreate', new AutoModerationRule(data, client))
  },
)

/**
 * A rule was changed.
 *
 * @remarks
 * A fresh structure rather than a patch, because nothing is cached to patch. The payload is
 * the whole rule rather than a delta, so the structure is complete either way.
 */
export const autoModerationRuleUpdate = defineHandler(
  'AUTO_MODERATION_RULE_UPDATE',
  (client, data) => {
    client.emit('autoModerationRuleUpdate', new AutoModerationRule(data, client))
  },
)

/**
 * A rule was deleted.
 *
 * @remarks
 * Emits the whole rule rather than its ID, because the payload carries the whole rule — the
 * same half of the delete-handler rule {@link stageInstanceDelete} follows, and the opposite
 * outcome to `inviteDelete`, where the dispatch is a stub and nothing can fill it in.
 */
export const autoModerationRuleDelete = defineHandler(
  'AUTO_MODERATION_RULE_DELETE',
  (client, data) => {
    client.emit('autoModerationRuleDelete', new AutoModerationRule(data, client))
  },
)

/**
 * A rule matched and one of its actions ran.
 *
 * @remarks
 * Fires per action, so a rule that both blocks a message and alerts a channel produces two of
 * these for one message. Nothing in the payload distinguishes them beyond `action`, so a
 * listener that counts violations counts actions unless it groups by rule and user itself.
 */
export const autoModerationActionExecution = defineHandler(
  'AUTO_MODERATION_ACTION_EXECUTION',
  (client, data) => {
    client.emit('autoModerationActionExecution', new AutoModerationActionExecution(data, client))
  },
)
