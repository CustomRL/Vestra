import type { ISO8601Timestamp } from '../globals.js'
import type { PollLayoutType } from '../enums/poll.js'
import type { APIPartialEmoji } from './emoji.js'

/**
 * A poll attached to a message.
 *
 * @remarks
 * A message carries at most one poll, and a poll cannot be added to a message after it
 * has been sent. This is the form Discord sends back; the form used to create one is
 * `APIPollCreateRequest`, which carries `duration` in place of `expiry`.
 */
export interface APIPoll {
  /**
   * The question being asked.
   *
   * @remarks
   * Only `text` is populated. Discord ignores `emoji` on a question, even though the
   * question reuses the same poll media shape as the answers.
   */
  question: APIPollMedia
  /** The available answers, up to 10. */
  answers: APIPollAnswer[]
  /**
   * When the poll closes.
   *
   * @remarks
   * Nullable only to leave room for non-expiring polls; every poll Discord currently
   * creates has an expiry. A poll past its expiry is closed but still present on the
   * message, so do not treat a past timestamp as a missing poll.
   */
  expiry: ISO8601Timestamp | null
  /** Whether a voter may select more than one answer. */
  allow_multiselect: boolean
  /** How the poll is rendered. */
  layout_type: PollLayoutType
  /**
   * The vote tallies.
   *
   * @remarks
   * Absent means "unknown results", not "no votes". Discord omits the field on
   * responses where its backend has no authoritative tally to hand — typically a
   * message fetched from a cache path — so falling back to zero counts here will
   * display wrong numbers. Fetch the message again to get results.
   */
  results?: APIPollResults
}

/**
 * The text and emoji backing a poll's question or one of its answers.
 *
 * @remarks
 * Both fields are optional in the schema because the same shape backs both positions,
 * but a usable question or answer has `text`. Text is limited to 300 characters on a
 * question and 55 on an answer.
 */
export interface APIPollMedia {
  /** The displayed text. */
  text?: string
  /**
   * The emoji shown beside an answer.
   *
   * @remarks
   * When creating a poll, send only `id` for a custom emoji or only `name` for a
   * unicode one. Sending both is rejected.
   */
  emoji?: APIPartialEmoji
}

/**
 * One selectable answer in a poll.
 */
export interface APIPollAnswer {
  /**
   * The answer's ID, used to correlate it with an entry in `APIPollResults`.
   *
   * @remarks
   * Optional because Discord assigns it: it is present on every poll received from the
   * API or the gateway and absent when creating one. It is an index rather than a
   * snowflake — currently 1 for the first answer, incrementing sequentially — and is
   * only unique within its own poll.
   */
  answer_id?: number
  /** The answer's text and optional emoji. */
  poll_media: APIPollMedia
}

/**
 * The vote tallies for a poll.
 *
 * @remarks
 * Counts are eventually consistent. While a poll is open they are close but not
 * guaranteed exact; once it closes, a background job performs a final accurate tally
 * and sets `is_finalized`. Anything that depends on precise numbers — announcing a
 * winner, awarding something — should wait for `is_finalized` rather than reading the
 * counts as they arrive.
 */
export interface APIPollResults {
  /**
   * Whether the final tally has completed.
   *
   * @remarks
   * `false` while the poll is open, and also for a short window after it closes while
   * the tally job runs.
   */
  is_finalized: boolean
  /**
   * The counts, one entry per answer that has votes.
   *
   * @remarks
   * Answers with no votes are omitted entirely rather than reported as zero, so this
   * array is not parallel to `APIPoll.answers` and must be looked up by `answer_id`.
   */
  answer_counts: APIPollAnswerCount[]
}

/**
 * The number of votes cast for a single answer.
 */
export interface APIPollAnswerCount {
  /** The `answer_id` of the answer this count belongs to. */
  id: number
  /** The number of votes cast, subject to the consistency caveats on `APIPollResults`. */
  count: number
  /**
   * Whether the current user voted for this answer.
   *
   * @remarks
   * Reflects the token that made the request, so for a bot it is that bot's own vote —
   * usually `false`, since bots cannot vote in polls.
   */
  me_voted: boolean
}

/**
 * A poll as sent when creating a message.
 *
 * @remarks
 * Differs from `APIPoll` in two ways: `duration` replaces `expiry`, since the caller
 * chooses a length rather than an absolute time, and the answers carry no `answer_id`
 * because Discord assigns those.
 */
export interface APIPollCreateRequest {
  /** The question being asked. Only `text` is used. */
  question: APIPollMedia
  /** The available answers, up to 10. */
  answers: APIPollAnswer[]
  /**
   * How many hours the poll stays open for, up to 768 (32 days).
   *
   * @remarks
   * Hours, not seconds or milliseconds. Defaults to 24 when omitted.
   */
  duration?: number
  /** Whether a voter may select more than one answer. Defaults to `false`. */
  allow_multiselect?: boolean
  /** How the poll is rendered. Defaults to `PollLayoutType.Default`. */
  layout_type?: PollLayoutType
}
