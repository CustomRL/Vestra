import type {
  APIThreadMember,
  RESTGetAPIChannelJoinedThreadsArchivedQuery,
  RESTGetAPIChannelThreadMembersQuery,
  RESTGetAPIChannelThreadsArchivedQuery,
  RESTGetAPIChannelThreadsArchivedResult,
  Snowflake,
} from '@vestra/types'
import type { REST } from '../REST.js'
import type { RouteOptions } from './options.js'

/**
 * Membership of and access to existing threads.
 *
 * @remarks
 * **Starting a thread is not here.** A thread is started *from* a channel or *from* a message,
 * so `channels.startThread` and `channels.startThreadFromMessage` stay where the thing they
 * start from is. What lives here is everything addressed by a thread that already exists —
 * who is in it, and which archived ones can be listed — which is a different resource wearing
 * the same word.
 *
 * **A thread is a channel**, so fetching, editing and deleting one goes through the channel
 * routes. There is deliberately no `threads.get` shadowing `channels.get`.
 *
 * **The three archived listings differ in more than their path.** Public and private archived
 * threads page by *archive timestamp*; the joined-private listing pages by thread ID. Both use
 * a parameter called `before`, and passing a snowflake to the timestamp form is accepted and
 * returns a page from 2015.
 */
export class ThreadRoutes {
  readonly #rest: REST

  /**
   * @param rest - The client to issue requests through.
   */
  constructor(rest: REST) {
    this.#rest = rest
  }

  /**
   * Joins a thread as the current user.
   *
   * @param threadId - The thread to join.
   * @param options - Request options.
   */
  async join(threadId: Snowflake, options: RouteOptions = {}): Promise<void> {
    await this.#rest.put<undefined>(`/channels/${threadId}/thread-members/@me`, options)
  }

  /**
   * Leaves a thread as the current user.
   *
   * @param threadId - The thread to leave.
   * @param options - Request options.
   */
  async leave(threadId: Snowflake, options: RouteOptions = {}): Promise<void> {
    await this.#rest.delete<undefined>(`/channels/${threadId}/thread-members/@me`, options)
  }

  /**
   * Adds someone else to a thread.
   *
   * @param threadId - The thread to add them to.
   * @param userId - Who to add.
   * @param options - Request options.
   *
   * @remarks
   * Separate from {@link ThreadRoutes.join} rather than an optional user ID, for the same
   * reason the reaction routes are: joining needs only access to the thread, and adding
   * somebody else needs to be able to send in it. One method would hide that.
   */
  async addMember(
    threadId: Snowflake,
    userId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.put<undefined>(`/channels/${threadId}/thread-members/${userId}`, options)
  }

  /**
   * Removes someone from a thread. Needs `ManageThreads`, or ownership of a private thread.
   *
   * @param threadId - The thread to remove them from.
   * @param userId - Who to remove.
   * @param options - Request options.
   */
  async removeMember(
    threadId: Snowflake,
    userId: Snowflake,
    options: RouteOptions = {},
  ): Promise<void> {
    await this.#rest.delete<undefined>(`/channels/${threadId}/thread-members/${userId}`, options)
  }

  /**
   * Fetches one thread member.
   *
   * @param threadId - The thread.
   * @param userId - Whose membership to read.
   * @param query - Whether to include the guild member.
   * @param options - Request options.
   * @returns The membership.
   *
   * @remarks
   * A 404 means they are not in the thread, which is the intended way to ask — there is no
   * membership test that answers a boolean.
   */
  async getMember(
    threadId: Snowflake,
    userId: Snowflake,
    query: { with_member?: boolean } = {},
    options: RouteOptions = {},
  ): Promise<APIThreadMember> {
    return await this.#rest.get<APIThreadMember>(`/channels/${threadId}/thread-members/${userId}`, {
      ...options,
      query: query as Record<string, string | number | boolean | undefined>,
    })
  }

  /**
   * Lists a thread's members.
   *
   * @param threadId - The thread to read.
   * @param query - Pagination, and whether to include guild members.
   * @param options - Request options.
   * @returns Its members.
   *
   * @remarks
   * Needs the `GuildMembers` privileged intent, which is unusual for a REST route and easy to
   * miss: without it Discord answers `403` rather than returning a shorter list.
   */
  async getMembers(
    threadId: Snowflake,
    query: RESTGetAPIChannelThreadMembersQuery = {},
    options: RouteOptions = {},
  ): Promise<APIThreadMember[]> {
    return await this.#rest.get<APIThreadMember[]>(`/channels/${threadId}/thread-members`, {
      ...options,
      query: query as Record<string, string | number | boolean | undefined>,
    })
  }

  /**
   * Lists a channel's archived public threads, newest archive first.
   *
   * @param channelId - The parent channel, not a thread.
   * @param query - Pagination by archive timestamp.
   * @param options - Request options.
   * @returns The threads, the current user's memberships, and whether more remain.
   *
   * @remarks
   * **`before` is an ISO8601 timestamp**, not a snowflake, because the listing is ordered by
   * when each thread archived rather than by when it was created. A snowflake is accepted and
   * silently produces a page from 2015.
   *
   * `has_more` is the only reliable end-of-pages signal: `limit` is advisory, so a full page
   * says nothing on its own.
   */
  async getPublicArchived(
    channelId: Snowflake,
    query: RESTGetAPIChannelThreadsArchivedQuery = {},
    options: RouteOptions = {},
  ): Promise<RESTGetAPIChannelThreadsArchivedResult> {
    return await this.#rest.get<RESTGetAPIChannelThreadsArchivedResult>(
      `/channels/${channelId}/threads/archived/public`,
      { ...options, query: query as Record<string, string | number | boolean | undefined> },
    )
  }

  /**
   * Lists a channel's archived private threads. Needs `ManageThreads`.
   *
   * @param channelId - The parent channel, not a thread.
   * @param query - Pagination by archive timestamp.
   * @param options - Request options.
   * @returns The threads, the current user's memberships, and whether more remain.
   *
   * @remarks
   * Every private thread in the channel, joined or not, which is why it needs a moderator
   * permission where {@link ThreadRoutes.getJoinedPrivateArchived} needs none.
   */
  async getPrivateArchived(
    channelId: Snowflake,
    query: RESTGetAPIChannelThreadsArchivedQuery = {},
    options: RouteOptions = {},
  ): Promise<RESTGetAPIChannelThreadsArchivedResult> {
    return await this.#rest.get<RESTGetAPIChannelThreadsArchivedResult>(
      `/channels/${channelId}/threads/archived/private`,
      { ...options, query: query as Record<string, string | number | boolean | undefined> },
    )
  }

  /**
   * Lists archived private threads the bot is in.
   *
   * @param channelId - The parent channel, not a thread.
   * @param query - Pagination by thread ID.
   * @param options - Request options.
   * @returns The threads, the current user's memberships, and whether more remain.
   *
   * @remarks
   * **This one pages by ID**, unlike the other two, because it is ordered by thread ID rather
   * than by archive time. Same parameter name, different meaning, and swapping them is a
   * mistake nothing rejects.
   */
  async getJoinedPrivateArchived(
    channelId: Snowflake,
    query: RESTGetAPIChannelJoinedThreadsArchivedQuery = {},
    options: RouteOptions = {},
  ): Promise<RESTGetAPIChannelThreadsArchivedResult> {
    return await this.#rest.get<RESTGetAPIChannelThreadsArchivedResult>(
      `/channels/${channelId}/users/@me/threads/archived/private`,
      { ...options, query: query as Record<string, string | number | boolean | undefined> },
    )
  }
}
