import type { Changes, ChangesDraft } from '../Changes.js'
import type { Channel } from './Channel.js'
import type { ForumChannel } from './ForumChannel.js'
import type { GroupDMChannel } from './GroupDMChannel.js'
import type { GuildChannel } from './GuildChannel.js'
import type { GuildTextBasedChannel } from './GuildTextBasedChannel.js'
import type { TextChannel } from './TextChannel.js'
import type { ThreadChannel } from './ThreadChannel.js'
import type { ThreadOnlyChannel } from './ThreadOnlyChannel.js'
import type { VoiceChannel } from './VoiceChannel.js'

/**
 * Every field any channel type can report as changed, with the type its owner declares.
 *
 * @remarks
 * **One flat record rather than one per class, because `channelUpdate` emits the base
 * {@link Channel}.** A consumer narrows it with `instanceof` and then asks about the fields
 * that class has, so a record typed to the base would be unable to report a rename — `name`
 * lives on {@link GuildChannel} — and a union of eleven per-class records could not be read at
 * all without narrowing it separately from the channel it describes. `changes.topic` has to
 * compile.
 *
 * The cost of that is a record whose type offers keys a given update will never fill: a text
 * channel's update cannot carry `bitrate`. That is the same shape the first argument already
 * has, since a `Channel` is whichever subclass arrived, and it is the price of one record type
 * for one event.
 *
 * Each field's type is read off the class that declares it rather than written out again, so a
 * field that changes type on its structure changes type here without anybody remembering to
 * look. Where two classes declare the same field, both are named: {@link GuildChannel.name} is
 * a `string` and a group DM's is nullable, and the record has to hold either.
 */
interface ChannelFields<Client> {
  flags: Channel<Client>['flags']
  name: GuildChannel<Client>['name'] | GroupDMChannel<Client>['name']
  position: GuildChannel<Client>['position']
  permissionOverwrites: GuildChannel<Client>['permissionOverwrites']
  parentId: GuildChannel<Client>['parentId']
  nsfw: GuildChannel<Client>['nsfw']
  lastMessageId: GuildTextBasedChannel<Client>['lastMessageId']
  lastPinTimestamp: GuildTextBasedChannel<Client>['lastPinTimestamp']
  rateLimitPerUser: GuildTextBasedChannel<Client>['rateLimitPerUser']
  topic: GuildTextBasedChannel<Client>['topic']
  defaultAutoArchiveDuration: TextChannel<Client>['defaultAutoArchiveDuration']
  bitrate: VoiceChannel<Client>['bitrate']
  userLimit: VoiceChannel<Client>['userLimit']
  rtcRegion: VoiceChannel<Client>['rtcRegion']
  videoQualityMode: VoiceChannel<Client>['videoQualityMode']
  lastThreadId: ThreadOnlyChannel<Client>['lastThreadId']
  defaultReactionEmoji: ThreadOnlyChannel<Client>['defaultReactionEmoji']
  defaultThreadRateLimitPerUser: ThreadOnlyChannel<Client>['defaultThreadRateLimitPerUser']
  defaultSortOrder: ThreadOnlyChannel<Client>['defaultSortOrder']
  defaultForumLayout: ForumChannel<Client>['defaultForumLayout']
  ownerId: ThreadChannel<Client>['ownerId']
  archived: ThreadChannel<Client>['archived']
  autoArchiveDuration: ThreadChannel<Client>['autoArchiveDuration']
  archiveTimestamp: ThreadChannel<Client>['archiveTimestamp']
  locked: ThreadChannel<Client>['locked']
  invitable: ThreadChannel<Client>['invitable']
  createTimestamp: ThreadChannel<Client>['createTimestamp']
  messageCount: ThreadChannel<Client>['messageCount']
  memberCount: ThreadChannel<Client>['memberCount']
  totalMessageSent: ThreadChannel<Client>['totalMessageSent']
  appliedTags: ThreadChannel<Client>['appliedTags']
  icon: GroupDMChannel<Client>['icon']
  applicationId: GroupDMChannel<Client>['applicationId']
  managed: GroupDMChannel<Client>['managed']
}

/**
 * What a channel or thread edit displaced.
 *
 * @typeParam Client - The client type the channel is bound to.
 *
 * @remarks
 * The second argument to `channelUpdate` and `threadUpdate`, and `null` when the channel was
 * not cached or when the update changed nothing. Channels are cached by default; threads are
 * not.
 *
 * Two fields a channel patch writes are deliberately absent. A forum's `availableTags` is a
 * list of objects rebuilt on every dispatch, and comparing tag definitions by value to catch a
 * renamed tag costs more than the answer is worth. A DM's `recipients` is rebuilt into fresh
 * {@link User} structures, and the set of people in a DM does not change — a bot cannot be
 * added to a group DM after the fact.
 *
 * See {@link Changes} for why an update reports this rather than a copy of the old channel.
 */
export type ChannelChanges<Client = unknown> = Changes<
  ChannelFields<Client>,
  keyof ChannelFields<Client>
>

/**
 * A {@link ChannelChanges} record while a `patch` is still filling it.
 *
 * @typeParam Client - The client type the channel is bound to.
 *
 * @remarks
 * Threaded up the inheritance chain rather than merged at the end: each `patch` calls
 * `super.patch`, takes the draft it returns and adds its own fields to it, so a six-level
 * chain allocates one record rather than six.
 */
export type ChannelChangesDraft<Client = unknown> = ChangesDraft<
  ChannelFields<Client>,
  keyof ChannelFields<Client>
>
