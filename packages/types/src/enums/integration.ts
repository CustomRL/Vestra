/**
 * Integration- and webhook-related enumerations.
 */

/**
 * What happens to a subscriber whose subscription to an external service lapses.
 *
 * @remarks
 * Only meaningful on integrations that have a `role_id`, since both behaviours are
 * expressed by taking that role away. Discord bot and `guild_subscription` integrations
 * never carry this field at all.
 *
 * The choice is applied after `expire_grace_period` days have passed, not immediately
 * when the external service reports the subscription as lapsed.
 */
export const IntegrationExpireBehavior = {
  /** Take the subscriber role away but leave the member in the guild. */
  RemoveRole: 0,
  /** Remove the member from the guild entirely. */
  Kick: 1,
} as const

/**
 * An integration expire behaviour.
 */
export type IntegrationExpireBehavior =
  (typeof IntegrationExpireBehavior)[keyof typeof IntegrationExpireBehavior]

/**
 * The service an integration connects a guild to.
 *
 * @remarks
 * This is a string on the wire rather than a number, unlike most Discord enumerations.
 *
 * The value decides which of the integration object's optional fields are populated:
 * `Twitch` and `YouTube` carry the subscriber and syncing fields, `Discord` carries
 * `application` and `scopes` instead, and `GuildSubscription` carries neither group.
 */
export const IntegrationType = {
  /** A Twitch channel, syncing its subscribers into a guild role. */
  Twitch: 'twitch',
  /** A YouTube channel, syncing its members into a guild role. */
  YouTube: 'youtube',
  /** A bot or OAuth2 application added to the guild. */
  Discord: 'discord',
  /** A role subscription sold through the guild's own server subscription tiers. */
  GuildSubscription: 'guild_subscription',
} as const

/**
 * An integration type.
 */
export type IntegrationType = (typeof IntegrationType)[keyof typeof IntegrationType]

/**
 * What a webhook is for, which decides how it is executed and which fields it carries.
 *
 * @remarks
 * These are the webhooks Discord posts *to*. They are unrelated to the outgoing webhook
 * events Discord sends to an application's configured endpoint, which are not typed by
 * this enumeration.
 */
export const WebhookType = {
  /** Posts messages to a channel using a generated token. The only type an app creates. */
  Incoming: 1,
  /**
   * Created by Channel Following to repost another channel's announcements.
   *
   * @remarks
   * Made by Discord itself rather than by an application, and it has no token, so it
   * cannot be executed. Only this type carries `source_guild` and `source_channel`.
   */
  ChannelFollower: 2,
  /** Owned by an application and used to edit its interaction responses. */
  Application: 3,
} as const

/**
 * A webhook type.
 */
export type WebhookType = (typeof WebhookType)[keyof typeof WebhookType]
