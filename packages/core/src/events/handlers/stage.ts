import { StageInstance } from '../../structures/StageInstance.js'
import { defineHandler } from '../EventHandler.js'

/**
 * Stage instance dispatches.
 *
 * @remarks
 * **All three carry the whole instance, including the delete**, which is why all three emit a
 * {@link StageInstance} and none of them has to read a cache first. `channelDelete` reads
 * before it deletes because a `CHANNEL_DELETE` is a stub and nothing can resolve a deleted
 * channel afterwards; `STAGE_INSTANCE_DELETE` has no such problem — the payload the listener
 * needs is the payload that arrived, so a listener gets the topic and privacy level of the
 * stage that just ended rather than an ID it cannot look up.
 *
 * Nothing is cached; {@link StageInstance} records why there is no scope.
 */

/** A stage went live. */
export const stageInstanceCreate = defineHandler('STAGE_INSTANCE_CREATE', (client, data) => {
  client.emit('stageInstanceCreate', new StageInstance(data, client))
})

/**
 * A live stage's topic or privacy level changed.
 *
 * @remarks
 * A fresh structure rather than a patch, because there is nothing cached to patch. Two
 * updates for the same stage produce two objects, and comparing them by `id` is what tells a
 * listener they describe the same stage.
 */
export const stageInstanceUpdate = defineHandler('STAGE_INSTANCE_UPDATE', (client, data) => {
  client.emit('stageInstanceUpdate', new StageInstance(data, client))
})

/**
 * A stage ended.
 *
 * @remarks
 * Fires when a moderator ends the stage **and** when Discord closes it for having had no
 * speakers, so it is not evidence that anybody asked for it.
 */
export const stageInstanceDelete = defineHandler('STAGE_INSTANCE_DELETE', (client, data) => {
  client.emit('stageInstanceDelete', new StageInstance(data, client))
})
