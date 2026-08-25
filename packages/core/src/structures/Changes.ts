/**
 * What an update event reports instead of an old copy of the structure.
 *
 * @remarks
 * **There is no `oldMessage`, and the reason is not stylistic.** Every other Discord library
 * hands an update listener `(old, new)`, which needs a clone of the structure taken before the
 * patch. Cloning here was tried three ways and none of them work:
 * `Object.create(Message.prototype)` plus a field copy throws on the first `client` read,
 * because private fields are installed only by the constructor; defining the client as a
 * non-enumerable property instead makes that work and still leaves the clone on a different
 * hidden class from the constructor's, so every structure read downstream goes polymorphic;
 * and the one shape-safe clone — re-running the constructor — needs the raw payload retained
 * for the lifetime of the cache entry.
 *
 * So an update carries the structure as it now is, plus the previous values of the fields that
 * actually changed. That is strictly more useful than a stale snapshot the reader has to diff
 * themselves, it allocates only when something changed, and it does not teach a shape that is
 * `undefined` most of the time — under the default cache policy the structure was usually
 * never held, so there is nothing to have cloned.
 *
 * **What it costs.** `scripts/bench/message-patch.ts` puts a recording patch beside the
 * assign-only one it replaced, on identical state: **13ns** per content edit — the shape a
 * real `MESSAGE_UPDATE` has — and **17ns** for an update that changes nothing. The worst case,
 * a payload carrying every field with every one different, costs **151ns**, almost all of it
 * building a thirteen-key record one property at a time; Discord does not send that payload.
 * Measured on Node 25 on the machine that ran it, and beside a socket read all three are noise.
 *
 * **`changes` is `null`, not `{}`, when nothing changed or nothing was cached.** Those two
 * cases are deliberately the same value: in both, this library does not know what the previous
 * state was, and a caller that treats "no cache entry" as "no change" is wrong in a way an
 * empty object would hide.
 */

/**
 * The previous values of whichever fields an update changed.
 *
 * @typeParam Structure - The structure being patched.
 * @typeParam Field - The fields that structure can report. Named explicitly rather than derived
 *   from `keyof Structure`, so the record cannot offer keys it will never fill.
 *
 * @remarks
 * A key is present only if that field changed, and its value is what the field held before.
 * Absent means unchanged — never "changed to `undefined`", which is why fields whose previous
 * value cannot be recovered are left out of `Field` entirely rather than reported as absent.
 *
 * **Comparison is `!==`.** Exact for strings, numbers, booleans and snowflakes; reference-only
 * for arrays and objects. A payload is freshly parsed JSON, so an array field reports as
 * changed whenever the payload carries it, even when its contents are identical. Deep equality
 * on a dispatch path costs more than the answer is worth, and the alternative to saying so is
 * letting people find out.
 */
export type Changes<Structure, Field extends keyof Structure> = {
  readonly [Key in Field]?: Structure[Key]
}

/**
 * A {@link Changes} record while the `patch` that owns it is still filling it.
 *
 * @typeParam Structure - The structure being patched.
 * @typeParam Field - The fields that structure can report.
 *
 * @remarks
 * The published record is `readonly`, because a listener has no business editing history. A
 * `patch` needs to write to it, and it is the only thing that ever will — the draft never
 * leaves the method that created it except by being returned, at which point it is read-only
 * to everybody who can see it.
 */
export type ChangesDraft<Structure, Field extends keyof Structure> = {
  -readonly [Key in Field]?: Structure[Key]
}

/*
 * There is deliberately no `recordChange(changes, key, value)` helper.
 *
 * It would be one line per field instead of two, and it would write `changes[key] = value` — a
 * keyed store, which V8 cannot resolve to a fixed offset. That is the same reason a shared
 * `patch` helper was rejected, where the identical shortcut measured 5.6x a hand-written
 * assignment. Each `patch` therefore builds its own record inline, with
 * `;(changes ??= {}).field = this.field` doing the lazy allocation in the same statement that
 * records the value.
 */
