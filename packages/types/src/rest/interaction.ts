import type { InteractionResponseType, MessageFlags } from '../enums/index.js'
import type { APIApplicationCommandOptionChoice } from '../payloads/application-command.js'
import type { APIAttachment } from '../payloads/attachment.js'
import type { APIMessageComponent, APIModalComponent } from '../payloads/component.js'
import type { APIEmbed } from '../payloads/embed.js'
import type { APIPollCreateRequest } from '../payloads/poll.js'
import type { Snowflake } from '../globals.js'
import type { APIAllowedMentions } from './channel.js'

/**
 * The message an interaction response carries.
 *
 * @remarks
 * Close to a message create body but not the same shape, which is why it is spelled out rather
 * than aliased: there is no `message_reference`, no `nonce` and no `sticker_ids`, and `flags`
 * accepts two values that mean nothing on an ordinary message — `Ephemeral`, which shows the
 * reply only to the invoking user, and `SuppressEmbeds`.
 */
export interface APIInteractionCallbackData {
  /** Whether the response should be read aloud. */
  tts?: boolean
  /** The message content. */
  content?: string
  /** Up to ten embeds. */
  embeds?: APIEmbed[]
  /** Which mentions are allowed to ping. */
  allowed_mentions?: APIAllowedMentions
  /**
   * A bit set of {@link MessageFlags}.
   *
   * @remarks
   * `Ephemeral` is the one that matters here and has no meaning on an ordinary message: the
   * response is shown only to the user who invoked the interaction, and cannot later be made
   * public.
   */
  flags?: MessageFlags
  /** Message components. */
  components?: APIMessageComponent[]
  /** Attachments being uploaded or retained. */
  attachments?: Partial<APIAttachment>[]
  /** A poll to send with the response. */
  poll?: APIPollCreateRequest
}

/** Autocomplete suggestions, which are the whole response for an autocomplete interaction. */
export interface APIInteractionCallbackAutocompleteData {
  /** Up to twenty-five choices. */
  choices: APIApplicationCommandOptionChoice[]
}

/** The modal an interaction opens. */
export interface APIInteractionCallbackModalData {
  /** An identifier of up to 100 characters, sent back with the submission. */
  custom_id: string
  /** The modal's title. */
  title: string
  /** The modal's contents. */
  components: APIModalComponent[]
}

/**
 * A response to an interaction.
 *
 * @remarks
 * A discriminated union on `type`, because which `data` is valid depends entirely on it — a
 * modal response carrying message content is rejected by Discord, and the union is what makes
 * that a compile error rather than a 400.
 *
 * The three acknowledgement types carry no `data` at all. `DeferredChannelMessageWithSource` is
 * the one to reach for when the work takes longer than three seconds: it shows the user a
 * loading state and gives the bot fifteen minutes to send the real reply as a followup.
 */
export type APIInteractionResponse =
  | { type: typeof InteractionResponseType.Pong }
  | {
      type: typeof InteractionResponseType.ChannelMessageWithSource
      data: APIInteractionCallbackData
    }
  | {
      type: typeof InteractionResponseType.DeferredChannelMessageWithSource
      data?: Pick<APIInteractionCallbackData, 'flags'>
    }
  | { type: typeof InteractionResponseType.DeferredMessageUpdate }
  | { type: typeof InteractionResponseType.UpdateMessage; data: APIInteractionCallbackData }
  | {
      type: typeof InteractionResponseType.ApplicationCommandAutocompleteResult
      data: APIInteractionCallbackAutocompleteData
    }
  | { type: typeof InteractionResponseType.Modal; data: APIInteractionCallbackModalData }
  | { type: typeof InteractionResponseType.LaunchActivity }

/** `POST /interactions/{id}/{token}/callback` */
export type RESTPostAPIInteractionCallbackJSONBody = APIInteractionResponse

/**
 * `POST /webhooks/{application_id}/{token}`
 *
 * @remarks
 * A followup is a webhook execution, which is why `thread_id` and the username and avatar
 * overrides appear here and not on the initial response.
 */
export interface RESTPostAPIInteractionFollowupJSONBody extends APIInteractionCallbackData {
  /** Overrides the webhook's default username. */
  username?: string
  /** Overrides the webhook's default avatar. */
  avatar_url?: string
  /** Sends the followup into a thread of the original channel. */
  thread_id?: Snowflake
}

/** `PATCH /webhooks/{application_id}/{token}/messages/{message_id}` */
export type RESTPatchAPIInteractionFollowupJSONBody = Partial<APIInteractionCallbackData>

/** `PATCH /webhooks/{application_id}/{token}/messages/@original` */
export type RESTPatchAPIInteractionOriginalResponseJSONBody = Partial<APIInteractionCallbackData>
