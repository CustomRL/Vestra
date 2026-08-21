import { PermissionFlagsBits } from '@vestra/types'

/** The name of a permission Discord defines. */
export type PermissionName = keyof typeof PermissionFlagsBits

/**
 * Anything that can stand for a permission set.
 *
 * @remarks
 * The `string & Record<never, never>` is not noise. Written as plain `string`, the union
 * swallows {@link PermissionName} and an editor stops suggesting the forty-nine flag names —
 * which is most of the value of accepting names at all. The intersection is a distinct type as
 * far as union reduction is concerned, so the literals survive while any decimal string is
 * still accepted.
 */
export type PermissionResolvable =
  bigint | PermissionName | (string & Record<never, never>) | readonly PermissionResolvable[]

/**
 * Every permission bit Discord currently defines, combined.
 *
 * @remarks
 * Computed from the flags rather than written as a literal, so a permission added to
 * `@vestra/types` is included here without anybody remembering to update a constant. That
 * matters because this is what an administrator and a guild owner are given, and a stale
 * literal would quietly deny them whatever Discord added last.
 */
export const ALL_PERMISSIONS: bigint = Object.values(PermissionFlagsBits).reduce(
  (all, bit) => all | bit,
  0n,
)

/**
 * A set of permissions.
 *
 * @remarks
 * **A `bigint` behind a class, not a `number`.** Discord's flags passed 2^31 years ago, and
 * every one of them is a `bigint` in `@vestra/types` for that reason. The wrapper exists
 * because the raw form is a decimal *string* on the wire, and `permissions & flag` on a string
 * is `0` rather than an error — a silent wrong answer in exactly the code that decides whether
 * a bot may act.
 *
 * **Immutable.** `add` and `remove` return new instances. Permission sets get passed into
 * checks and stored on structures, and one that could be mutated in place would let a check
 * change the thing it was checking.
 *
 * **`has` is true for anything when the set contains `Administrator`.** That is Discord's rule,
 * not a convenience: an administrator genuinely has every permission, and a check that answered
 * otherwise would be wrong about the most important case. {@link PermissionsBitField.hasExact}
 * is there for the rarer question of what was literally granted.
 */
export class PermissionsBitField {
  /** The raw bits. */
  readonly bits: bigint

  /**
   * @param value - What to build from. Defaults to nothing granted.
   */
  constructor(value: PermissionResolvable = 0n) {
    this.bits = PermissionsBitField.resolve(value)
  }

  /**
   * Turns anything permission-shaped into raw bits.
   *
   * @param value - A bigint, a decimal string, a flag name, or an array of those.
   * @returns The combined bits.
   *
   * @throws TypeError - If a string is neither a flag name nor a decimal integer.
   *
   * @remarks
   * Throws rather than returning `0n` for an unrecognised string. A typo in a flag name is a
   * programmer error, and silently resolving it to "no permissions" produces a check that
   * always fails for a reason nothing reports.
   */
  static resolve(value: PermissionResolvable): bigint {
    if (typeof value === 'bigint') return value

    if (Array.isArray(value)) {
      let bits = 0n
      for (const entry of value as readonly PermissionResolvable[]) {
        bits |= PermissionsBitField.resolve(entry)
      }
      return bits
    }

    const named = (PermissionFlagsBits as Record<string, bigint | undefined>)[value as string]
    if (named !== undefined) return named

    // A decimal string is how Discord serialises a set. `BigInt` accepts other forms — `0x20`,
    // `1e3`, leading whitespace — and accepting them would mean a permission string that came
    // from somewhere unexpected parsed as a number nobody intended.
    if (!/^\d+$/.test(value as string)) {
      throw new TypeError(
        `${JSON.stringify(value)} is not a permission flag name or a decimal permission string.`,
      )
    }
    return BigInt(value as string)
  }

  /**
   * Whether every given permission is granted.
   *
   * @param value - The permissions to check for.
   * @returns Whether they are all granted.
   *
   * @remarks
   * `true` for anything when `Administrator` is present, which is Discord's rule.
   */
  has(value: PermissionResolvable): boolean {
    if ((this.bits & PermissionFlagsBits.Administrator) !== 0n) return true
    return this.hasExact(value)
  }

  /**
   * Whether every given permission is literally present in the bits.
   *
   * @param value - The permissions to check for.
   * @returns Whether they are all set.
   *
   * @remarks
   * Ignores the `Administrator` shortcut. The question this answers is "what was granted",
   * which is what a permissions editor needs and what a bot deciding whether it may act does
   * not.
   */
  hasExact(value: PermissionResolvable): boolean {
    const wanted = PermissionsBitField.resolve(value)
    return (this.bits & wanted) === wanted
  }

  /** A new set with these permissions added. */
  add(value: PermissionResolvable): PermissionsBitField {
    return new PermissionsBitField(this.bits | PermissionsBitField.resolve(value))
  }

  /** A new set with these permissions removed. */
  remove(value: PermissionResolvable): PermissionsBitField {
    return new PermissionsBitField(this.bits & ~PermissionsBitField.resolve(value))
  }

  /** Whether two sets hold exactly the same bits. */
  equals(value: PermissionResolvable): boolean {
    return this.bits === PermissionsBitField.resolve(value)
  }

  /** Whether nothing at all is granted. */
  get empty(): boolean {
    return this.bits === 0n
  }

  /**
   * The names of the permissions present.
   *
   * @returns The flag names, in the order `@vestra/types` declares them.
   *
   * @remarks
   * Names Discord currently defines and nothing else. A bit set that Discord has not published
   * a name for is dropped rather than rendered as a number, because a list mixing
   * `'SendMessages'` with `1099511627776` is worse than one that is simply incomplete.
   */
  toArray(): PermissionName[] {
    const names: PermissionName[] = []
    for (const [name, bit] of Object.entries(PermissionFlagsBits)) {
      if ((this.bits & bit) === bit) names.push(name as PermissionName)
    }
    return names
  }

  /**
   * The decimal string Discord uses on the wire.
   *
   * @remarks
   * This is what a request body wants. `JSON.stringify` cannot serialise a `bigint` at all —
   * it throws — so a permissions field that held the raw value would make the whole payload
   * unserialisable.
   */
  toString(): string {
    return this.bits.toString()
  }

  /** The decimal string, so `JSON.stringify` works on anything holding one of these. */
  toJSON(): string {
    return this.bits.toString()
  }
}
