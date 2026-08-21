/**
 * What every structure needs, and nothing else.
 *
 * @remarks
 * The whole base class. Each omission is a decision, and they are worth stating because
 * the obvious additions all have a cost this design declines to pay.
 *
 * **No `id`.** Several structures have no snowflake at all — a voice state is keyed by
 * (guild, user), a typing start by nothing. Declaring `id` here forces those to inherit a
 * field they must then lie about. Structures that have one declare it themselves, and the
 * creation time comes from {@link snowflakeTimestamp} rather than an inherited getter. A
 * two-level `Base` → `SnowflakeStructure` hierarchy was rejected: it buys one shared getter
 * at the cost of a layer every reader has to hold in their head.
 *
 * **No `equals()`.** On a cache hit two references to the same entity are the same object,
 * so `===` is already right. On a miss, `a.id === b.id` is what anybody means. A deep
 * `equals` invites the reading "these two have equal contents", which is expensive, rarely
 * wanted, and wrong the moment an array field is compared by reference.
 *
 * **No `toJSON()`.** The client sits in a private field behind a prototype getter, so
 * `JSON.stringify(structure)` already yields the structure's own camelCase fields and
 * nothing else. One consequence must be documented rather than discovered: **the JSON of a
 * structure is not an API payload.** It is camelCase, it omits whatever the structure chose
 * not to mirror, and it cannot be posted back to Discord. Request bodies come from
 * `@vestra/types`' `REST*JSONBody` types.
 */

/**
 * A thing that came from a client and can reach it again.
 *
 * @typeParam Client - The client type. Generic rather than a concrete import, because
 * structures are constructed by the client and importing it here would close a cycle that
 * the package graph and `tsc --build` both take seriously.
 */
export abstract class Base<Client> {
  readonly #client: Client

  /**
   * @param client - The client that produced this structure.
   */
  protected constructor(client: Client) {
    this.#client = client
  }

  /** The client that produced this structure. */
  get client(): Client {
    return this.#client
  }
}
