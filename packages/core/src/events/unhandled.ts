import type { GatewayDispatchEvents } from '@vestra/types'

/**
 * Why each dispatch has no handler.
 *
 * @remarks
 * **Every dispatch Discord defines is either handled or listed here, and
 * `packages/core/test/event-coverage.test.ts` fails naming any that is neither.** Without that
 * pairing, "unhandled" is indistinguishable from "nobody has looked at it yet" — and the
 * difference matters, because a new Discord event arriving in `@vestra/types` should be a
 * decision somebody makes rather than a silent absence.
 *
 * An unhandled event is not broken. It reaches consumers through `client.on('raw', …)` with
 * its payload exactly as it arrived, and adding a handler later is purely additive: nothing
 * that exists today changes shape. That is the whole reason unhandled events emit nothing
 * rather than emitting their raw payload under a derived camelCase name — see
 * {@link ClientEvents}.
 *
 * The reasons fall into four kinds, and they are not equally permanent:
 *
 * - **Mechanic.** Handled somewhere that is not a handler, because it must keep working
 *   regardless of what a consumer opts out of. These will never become handlers.
 * - **No structure.** The entity is not modelled yet. These become handlers when it is, and
 *   the reason names what is missing.
 * - **Needs REST first.** Handling it would promise an API surface that does not exist —
 *   `INTERACTION_CREATE` without the callback routes is the clear case.
 * - **Deliberate.** Modelled and reachable, and still not worth a typed event.
 */
export const UnhandledEvents: Readonly<Partial<Record<GatewayDispatchEvents, string>>> = {
  // --- Mechanics: owned outside the handler system on purpose. ---
  RESUMED:
    'Mechanic. `ShardBridge` handles session resumption directly, because a handler can be ' +
    'opted out of and session bookkeeping cannot. A consumer wanting to know uses the shard ' +
    'events on `client.shards`.',
  GUILD_MEMBERS_CHUNK:
    'Mechanic. `MemberChunker` consumes these to resolve `client.fetchMembers()`. Routing them ' +
    'through a handler would let the opt-out list break member fetching.',
  RATE_LIMITED:
    'Mechanic. A gateway-level signal about the connection rather than an event about Discord, ' +
    'and the transport already reports it.',

  // --- Needs REST first: handling would promise a surface that does not exist. ---
  INTERACTION_CREATE:
    'Needs REST first. An interaction that cannot be responded to is worse than none: Discord ' +
    'shows the user "this interaction failed" after three seconds. The callback routes are not ' +
    'in `@vestra/rest` yet, and this becomes a handler in the same change that adds them.',

  // --- No structure yet: each becomes a handler when its entity is modelled. ---
  ENTITLEMENT_CREATE: 'No structure. Entitlement is not modelled.',
  ENTITLEMENT_UPDATE: 'No structure. Entitlement is not modelled.',
  ENTITLEMENT_DELETE: 'No structure. Entitlement is not modelled.',
  SUBSCRIPTION_CREATE: 'No structure. Subscription is not modelled.',
  SUBSCRIPTION_UPDATE: 'No structure. Subscription is not modelled.',
  SUBSCRIPTION_DELETE: 'No structure. Subscription is not modelled.',
  GUILD_AUDIT_LOG_ENTRY_CREATE: 'No structure. AuditLogEntry is not modelled.',
  GUILD_SCHEDULED_EVENT_CREATE: 'No structure. GuildScheduledEvent is not modelled.',
  GUILD_SCHEDULED_EVENT_UPDATE: 'No structure. GuildScheduledEvent is not modelled.',
  GUILD_SCHEDULED_EVENT_DELETE: 'No structure. GuildScheduledEvent is not modelled.',
  GUILD_SCHEDULED_EVENT_USER_ADD: 'No structure. GuildScheduledEvent is not modelled.',
  GUILD_SCHEDULED_EVENT_USER_REMOVE: 'No structure. GuildScheduledEvent is not modelled.',
  GUILD_SOUNDBOARD_SOUND_CREATE: 'No structure. SoundboardSound is not modelled.',
  GUILD_SOUNDBOARD_SOUND_UPDATE: 'No structure. SoundboardSound is not modelled.',
  GUILD_SOUNDBOARD_SOUND_DELETE: 'No structure. SoundboardSound is not modelled.',
  GUILD_SOUNDBOARD_SOUNDS_UPDATE: 'No structure. SoundboardSound is not modelled.',
  SOUNDBOARD_SOUNDS: 'No structure. SoundboardSound is not modelled.',
  INTEGRATION_CREATE: 'No structure. Integration is not modelled.',
  INTEGRATION_UPDATE: 'No structure. Integration is not modelled.',
  INTEGRATION_DELETE: 'No structure. Integration is not modelled.',
  MESSAGE_POLL_VOTE_ADD: 'No structure. Poll is not modelled.',
  MESSAGE_POLL_VOTE_REMOVE: 'No structure. Poll is not modelled.',
  THREAD_MEMBER_UPDATE: 'No structure. ThreadMember is not modelled.',
  THREAD_MEMBERS_UPDATE:
    'No structure. ThreadMember is not modelled. Note that ' +
    '`docs/design/phase-4-core.md` §5.2 specifies replay behaviour for this event and §7 R4 ' +
    'tests it, which describes something that does not run — recorded as §8-E E2.',
  VOICE_CHANNEL_EFFECT_SEND: 'No structure. VoiceChannelEffect is not modelled.',

  // --- Deliberate: modelled enough to handle, and still not worth a typed event. ---
  APPLICATION_COMMAND_PERMISSIONS_UPDATE:
    'Deliberate. Nothing in the cache changes, and a bot that cares is already managing its ' +
    'own commands through REST.',
  GUILD_INTEGRATIONS_UPDATE:
    'Deliberate. Carries a guild ID and nothing else — it is a hint to re-fetch integrations, ' +
    'which are not modelled.',
  VOICE_SERVER_UPDATE:
    'Deliberate. Carries the voice gateway endpoint and token, which are only useful to a ' +
    'voice connection implementation. Vestra has none, and surfacing credentials as a typed ' +
    'event would imply otherwise.',
  WEBHOOKS_UPDATE:
    'Deliberate. Carries guild and channel IDs and nothing else — a hint to re-fetch webhooks, ' +
    'which have no routes yet.',
}
