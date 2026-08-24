import type { APIPartialEmoji, Snowflake } from '@vestra/types'

/**
 * The emoji on a reaction.
 *
 * @remarks
 * **Separate from {@link Emoji}, and not a lesser version of it.** A reaction's emoji is
 * either a custom guild emoji reduced to three fields, or a standard Unicode character that
 * has no ID at all and never will. `Emoji` requires an ID because the emoji cache is keyed by
 * one; this cannot, so making one a subclass of the other would mean either a nullable cache
 * key or a class that lies about having an identity.
 *
 * **Not a {@link Base} subclass.** There is nothing to fetch and nothing to cache — a reaction
 * emoji is a value that arrives inside a dispatch, like {@link Activity}.
 */
export class ReactionEmoji {
  /** The emoji's ID, or `null` for a standard Unicode emoji. */
  declare readonly id: Snowflake | null
  /** The custom emoji's name, or the Unicode character itself. */
  declare readonly name: string | null
  /** Whether the emoji is animated. */
  declare readonly animated: boolean | undefined

  /**
   * @param data - The payload to mirror.
   */
  constructor(data: APIPartialEmoji) {
    this.id = data.id
    this.name = data.name
    this.animated = data.animated
  }

  /** Whether this is a custom guild emoji rather than a Unicode character. */
  get custom(): boolean {
    return this.id !== null
  }

  /**
   * The form the reaction routes want.
   *
   * @returns `name:id` for a custom emoji, or the character itself for a Unicode one.
   *
   * @remarks
   * **Not URL-encoded here**, because `rest.channels.addReaction` encodes what it is given.
   * Encoding in both places produces `%25F0%259F%2591%258D`, which Discord answers with a 400
   * that blames the emoji — and the classic reaction bug is confusing this with
   * {@link ReactionEmoji.toString}, which is message markup and is rejected outright.
   */
  get identifier(): string {
    if (this.id === null) return this.name ?? ''
    return `${this.name ?? '_'}:${this.id}`
  }

  /**
   * Renders the emoji as it would appear in message content.
   *
   * @returns `<:name:id>` for a custom emoji, or the character itself.
   */
  toString(): string {
    if (this.id === null) return this.name ?? ''
    return `<${this.animated === true ? 'a' : ''}:${this.name ?? '_'}:${this.id}>`
  }
}
