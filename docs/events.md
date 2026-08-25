# Events

Every event `Client` emits, what it carries, and the rules behind those choices.

The list is generated from `ClientEvents` and pinned by `packages/core/test/event-surface.test.ts`,
which snapshots all 56 events by name and argument count. Renaming one, removing one or changing
its arity fails that test — which is the point, because after publication each of those is a major
version.

## Listening

```ts
import { Client, GatewayIntentBits } from 'vestra'

const client = new Client({
  token: 'not.a.real.token',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
})

client.on('messageCreate', (message) => {
  console.log(message.content)
})
```

Listeners are typed from the event name. A wrong name is a compile error rather than a listener
that never fires, and the argument types come from the same map — there is no `any` anywhere in
the path.

## Naming

An event's name is the camelCase of its gateway name: `MESSAGE_CREATE` becomes `messageCreate`,
`GUILD_MEMBER_ADD` becomes `guildMemberAdd`. `packages/core/test/naming.test.ts` enforces that
mechanically, so the rule holds for every event that does not appear in the table below.

| Gateway         | Client surface                          | Why                                                                                                                  |
| --------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `READY`         | `ready`, once per client                | A twenty-shard bot would otherwise run its startup code twenty times                                                   |
| `RESUMED`       | not emitted                             | Nothing a consumer can act on that `ready` has not already said                                                        |
| `GUILD_CREATE`  | `guildCreate` **or** `guildUnavailable` | A guild arriving during the startup stream, or returning from an outage, is not a join                                 |
| `GUILD_DELETE`  | `guildDelete` **or** `guildUnavailable` | Being removed from a guild and Discord having an outage are different things                                           |
| `RATE_LIMITED`  | not emitted                             | Consumed by the member chunker; the correlated caller receives a rejection, so an event would surface a failure twice  |

## What arrives

Most events carry a **structure** — a camelCase, client-aware object like `Message` or `Guild`.
Some carry **IDs and scalars** instead, and the choice is deliberate rather than an omission.

An event carries IDs when the entity it describes may never have been cached. `messageDelete` is
the clearest case: under the default cache policy messages are not held at all, so an argument
typed `Message | undefined` would put a check in every listener to serve the configuration almost
everybody runs. The IDs are always present, so the event is always useful.

```ts
import { Client, GatewayIntentBits } from 'vestra'

const client = new Client({
  token: 'not.a.real.token',
  intents: [GatewayIntentBits.GuildMessages],
})

client.on('messageDelete', (messageId, channelId, guildId) => {
  // Always three IDs, never a half-populated structure.
  console.log(messageId, channelId, guildId ?? 'a DM')
})
```

The reverse holds for deletes of things that **are** cached by default: `channelDelete` and
`threadDelete` carry the structure, because the cache read happens before the eviction and the
answer is reliable.

## Change records

Every update event carries a second argument saying what the update displaced.

```ts
import { Client, GatewayIntentBits } from 'vestra'

const client = new Client({
  token: 'not.a.real.token',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  cache: { members: true, users: true },
})

client.on('guildMemberUpdate', (member, changes) => {
  if (changes?.roles === undefined) return
  const added = member.roles.filter((role) => !changes.roles!.includes(role))
  console.log(`${member.userId} gained ${String(added.length)} role(s)`)
})
```

`changes` is `null` in two cases, deliberately the same value: the entity was not cached, and the
update changed nothing this library mirrors. In both, the library does not know what the previous
state was, and an empty object would read as "unchanged".

There is no `oldMember` argument. Producing one needs a clone, and every clone this design tried
either threw on the first private-field read or landed on a second hidden class — so an update
reports the previous values of what moved rather than a copy of the whole thing. `VoiceState` is
the one exception: it is a dozen scalars, `VOICE_STATE_UPDATE` always sends the whole object, and
the questions that event exists for (*did they move channel*, *did they mute*) are unanswerable
without the old state, so `voiceStateUpdate` carries `(previous, current)`.

Two fields are never reported. A sub-structure patched in place — `Message.author`,
`GuildMember.user` — leaves no previous object to hand back, because the one a record would carry
is the same object with the new values already in it. `Presence.activities` is excluded on cost:
it is rebuilt on the highest-volume dispatch Discord sends, so reporting it would leave the record
non-null every time while comparing it deeply would run on the busiest path in the library.

## The full surface

`?` marks an argument that can be `undefined`; every argument is required positionally.

### Lifecycle

| Event               | Arguments                                                           |
| ------------------- | ------------------------------------------------------------------- |
| `ready`             | `user: ClientUser`                                                   |
| `shardGuildsReady`  | `shardId: number`, `unresolved: readonly Snowflake[]`                |
| `error`             | `error: Error`, `context: { event: string; shardId: number }`        |
| `raw`               | `payload: GatewayDispatchPayload`, `shardId: number`, `replayed: boolean` |
| `dispatchDropped`   | `payload: GatewayDispatchPayload`, `shardId: number`, `depth: number` |

`ready` fires once the **whole fleet** has reached READY, not once per shard. `login()` resolves
earlier, on the first shard, because a two-hundred shard bot spends over a minute on identify
pacing alone and a startup line has to come out before that. They answer different questions.

### Guilds

| Event                | Arguments                                          |
| -------------------- | -------------------------------------------------- |
| `guildCreate`        | `guild: Guild`                                     |
| `guildUpdate`        | `guild: Guild`, `changes: GuildChanges \| null`    |
| `guildDelete`        | `guildId: Snowflake`                               |
| `guildUnavailable`   | `guildId: Snowflake`                               |
| `guildAuditLogEntryCreate` | `entry: AuditLogEntry`                       |

`guildCreate` fires for every guild during the startup stream as well as on an actual join, and
the payload is identical either way — so a bot that treats it as "joined a new server" greets
every guild it is already in on every reconnect.

### Channels and threads

| Event                 | Arguments                                                                         |
| --------------------- | --------------------------------------------------------------------------------- |
| `channelCreate`       | `channel: Channel`                                                                  |
| `channelUpdate`       | `channel: Channel`, `changes: ChannelChanges \| null`                               |
| `channelDelete`       | `channel: Channel`                                                                  |
| `channelPinsUpdate`   | `channelId: Snowflake`, `guildId?: Snowflake`, `lastPinTimestamp: string \| null`   |
| `threadCreate`        | `thread: ThreadChannel`                                                             |
| `threadUpdate`        | `thread: ThreadChannel`, `changes: ChannelChanges \| null`                           |
| `threadDelete`        | `thread: ThreadChannel`                                                             |
| `threadListSync`      | `guildId: Snowflake`, `threads: ThreadChannel[]`                                     |
| `threadMembersUpdate` | `thread: ThreadChannel`, `added: readonly Snowflake[]`, `removed: readonly Snowflake[]` |

`ChannelChanges` is one flat record covering every field any channel type can report, because
`channelUpdate` emits the base `Channel` and a consumer narrows it with `instanceof`. A record
typed to the base could not report a rename — `name` lives on `GuildChannel`.

### Messages and reactions

| Event                        | Arguments                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `messageCreate`              | `message: Message`                                                                              |
| `messageUpdate`              | `message: Message`, `changes: MessageChanges \| null`                                            |
| `messageDelete`              | `messageId: Snowflake`, `channelId: Snowflake`, `guildId?: Snowflake`                            |
| `messageDeleteBulk`          | `messageIds: readonly Snowflake[]`, `channelId: Snowflake`, `guildId?: Snowflake`                |
| `messageReactionAdd`         | `emoji: ReactionEmoji`, `messageId`, `channelId`, `userId`, `guildId?`                           |
| `messageReactionRemove`      | `emoji: ReactionEmoji`, `messageId`, `channelId`, `userId`, `guildId?`                           |
| `messageReactionRemoveAll`   | `messageId`, `channelId`, `guildId?`                                                             |
| `messageReactionRemoveEmoji` | `emoji: ReactionEmoji`, `messageId`, `channelId`, `guildId?`                                     |
| `typingStart`                | `channelId`, `userId`, `guildId?`, `startedTimestamp: number`                                    |

`messageDeleteBulk` fires once for the batch rather than once per message. A moderator clearing a
hundred messages would otherwise run a hundred listeners, and a bot logging deletions gets rate
limited by its own audit channel.

### Members, roles and bans

| Event               | Arguments                                                             |
| ------------------- | --------------------------------------------------------------------- |
| `guildMemberAdd`    | `member: GuildMember`                                                  |
| `guildMemberUpdate` | `member: GuildMember`, `changes: GuildMemberChanges \| null`           |
| `guildMemberRemove` | `guildId: Snowflake`, `user: User`                                     |
| `guildBanAdd`       | `guildId: Snowflake`, `user: User`                                     |
| `guildBanRemove`    | `guildId: Snowflake`, `user: User`                                     |
| `roleCreate`        | `role: Role`, `guildId: Snowflake`                                     |
| `roleUpdate`        | `role: Role`, `guildId: Snowflake`, `changes: RoleChanges \| null`     |
| `roleDelete`        | `roleId: Snowflake`, `guildId: Snowflake`                              |

The role events carry their guild separately because a `Role` payload has no `guild_id` and the
cache is keyed by role ID alone — without it, a listener wanting the guild would have to search
every one.

`roleUpdate` takes its change record **third**, after the guild ID. Moving the guild ID would have
broken every existing listener for the sake of tidiness.

### Expressions

| Event                 | Arguments                                                         |
| --------------------- | ----------------------------------------------------------------- |
| `guildEmojisUpdate`   | `guildId: Snowflake`, `emojis: Emoji[]`, `removed: Emoji[]`        |
| `guildStickersUpdate` | `guildId: Snowflake`, `stickers: Sticker[]`, `removed: Sticker[]`  |

Discord sends the whole set on every change, so the removed list is computed here rather than left
for a consumer to diff.

### Presence and voice

| Event              | Arguments                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `presenceUpdate`   | `presence: Presence`, `changes: PresenceChanges \| null`                                          |
| `voiceStateUpdate` | `guildId`, `userId`, `previous: VoiceState \| undefined`, `current: VoiceState \| undefined`      |
| `userUpdate`       | `user: ClientUser`, `changes: ClientUserChanges \| null`                                          |

`voiceStateUpdate` puts the IDs first because they are the only arguments always present: voice
states are off by default, so on most clients a departure has no cached state and the pair alone
would be `(undefined, undefined)` — an event saying somebody left without saying who.

`presenceUpdate` is the highest-volume event Discord sends. Anything expensive in that listener is
expensive at that rate.

### Invites, stages, scheduled events and moderation

| Event                            | Arguments                                                              |
| -------------------------------- | ---------------------------------------------------------------------- |
| `inviteCreate`                   | `invite: Invite`                                                        |
| `inviteDelete`                   | `code: string`, `channelId: Snowflake`, `guildId?: Snowflake`           |
| `stageInstanceCreate`            | `stageInstance: StageInstance`                                          |
| `stageInstanceUpdate`            | `stageInstance: StageInstance`                                          |
| `stageInstanceDelete`            | `stageInstance: StageInstance`                                          |
| `guildScheduledEventCreate`      | `scheduledEvent: GuildScheduledEvent`                                   |
| `guildScheduledEventUpdate`      | `scheduledEvent: GuildScheduledEvent`                                   |
| `guildScheduledEventDelete`      | `scheduledEvent: GuildScheduledEvent`                                   |
| `guildScheduledEventUserAdd`     | `guildScheduledEventId`, `userId`, `guildId`                            |
| `guildScheduledEventUserRemove`  | `guildScheduledEventId`, `userId`, `guildId`                            |
| `interactionCreate`              | `interaction: Interaction`                                              |
| `autoModerationRuleCreate`       | `rule: AutoModerationRule`                                              |
| `autoModerationRuleUpdate`       | `rule: AutoModerationRule`                                              |
| `autoModerationRuleDelete`       | `rule: AutoModerationRule`                                              |
| `autoModerationActionExecution`  | `execution: AutoModerationActionExecution`                              |

`inviteDelete` carries a code rather than an `Invite`, because Discord's delete payload is a stub
and inventing the rest would be worse than saying less.

## Events that do not exist yet

Discord sends more dispatches than this library has handlers for. An event only exists once a
handler emits it — there is deliberately no fallback that emits raw payload data under a derived
name, because that would make adding a real handler a breaking change: `entitlementCreate` would
deliver an `APIEntitlement` today and an `Entitlement` later.

Until then, `raw` sees everything, and `payload.t` narrows exactly:

```ts
import { Client, GatewayIntentBits } from 'vestra'

const client = new Client({
  token: 'not.a.real.token',
  intents: [GatewayIntentBits.Guilds],
})

client.on('raw', (payload) => {
  if (payload.t === 'ENTITLEMENT_CREATE') {
    // `payload.d` is `GatewayEntitlementCreateDispatchData` here.
    console.log(payload.d.sku_id)
  }
})
```

`raw` is also the only place `replayed` is surfaced — dispatches redelivered after a resume look
identical to fresh ones everywhere else.

## Errors

A listener that throws does not take the shard down. The failure arrives on `error` with the event
name and shard that produced it, and the read loop carries on.

```ts
import { Client, GatewayIntentBits } from 'vestra'

const client = new Client({
  token: 'not.a.real.token',
  intents: [GatewayIntentBits.Guilds],
})

client.on('error', (error, context) => {
  console.error(`${context.event} on shard ${String(context.shardId)}:`, error.message)
})
```

**Attach an `error` listener.** Node throws on an unhandled `error` event, so a client without one
turns a listener bug into a process exit.

## Ordering

By default a dispatch is routed as soon as it arrives, and a listener returning a promise is not
waited on — the promise is discarded, exactly as `EventEmitter` does. Two `async` listeners for the
same event can therefore interleave.

`serialDispatch` changes that: the client awaits what each listener returned before routing the
next dispatch for that shard. It is per shard rather than global, so a slow listener on one shard
does not delay another's heartbeat, and it is opt-in because it changes what an `async` listener
means — one written for some unrelated reason starts holding up the queue simply by being `async`.

```ts
import { Client, GatewayIntentBits } from 'vestra'

const client = new Client({
  token: 'not.a.real.token',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  serialDispatch: { maxQueued: 512 },
})

client.on('dispatchDropped', (payload, shardId, depth) => {
  console.warn(`dropped ${String(payload.t)} on shard ${String(shardId)} at depth ${String(depth)}`)
})
```

Past `maxQueued` the **newest** payload is dropped and `dispatchDropped` fires. Dropping the oldest
would silently reorder causality — a `MESSAGE_DELETE` surviving while its `MESSAGE_CREATE` is
discarded is worse than a contiguous gap.
