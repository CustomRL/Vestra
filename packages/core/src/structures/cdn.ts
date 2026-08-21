import type { Snowflake } from '@vestra/types'

/** The image formats Discord's CDN serves. */
export type ImageFormat = 'png' | 'jpg' | 'webp' | 'gif'

/** How an image should be requested. */
export interface ImageOptions {
  /**
   * The format to ask for.
   *
   * @remarks
   * Defaults to `gif` for an animated asset and `png` for a static one. Overriding it with
   * `png` on an animated hash is legitimate and gives the first frame; overriding with `gif`
   * on a static one returns a 415.
   */
  format?: ImageFormat
  /**
   * The width in pixels.
   *
   * @remarks
   * Discord accepts powers of two from 16 to 4096 and rejects everything else, so this is
   * validated rather than passed through — a `size: 100` that silently returns a 400 in
   * production is worse than one that fails where it was written.
   */
  size?: number
}

const BASE = 'https://cdn.discordapp.com'

/** The sizes Discord's CDN accepts. */
const SIZES: ReadonlySet<number> = new Set([16, 32, 64, 128, 256, 512, 1024, 2048, 4096])

/**
 * Whether a hash names an animated asset.
 *
 * @param hash - The asset hash.
 * @returns Whether it is animated.
 *
 * @remarks
 * Discord marks animated assets with an `a_` prefix on the hash and nothing else — there is no
 * flag anywhere in the payload. Requesting `.png` for one returns a still frame rather than an
 * error, so getting this wrong produces avatars that quietly stop moving rather than anything
 * that looks broken.
 */
export function isAnimatedHash(hash: string): boolean {
  return hash.startsWith('a_')
}

/**
 * Builds a CDN URL.
 *
 * @param path - The path below the CDN root, without a leading slash or extension.
 * @param hash - The asset hash, which decides the default format.
 * @param options - The requested format and size.
 * @returns The URL.
 *
 * @throws RangeError - If `size` is not one Discord accepts.
 */
function cdnUrl(path: string, hash: string, options: ImageOptions = {}): string {
  const format = options.format ?? (isAnimatedHash(hash) ? 'gif' : 'png')
  const url = `${BASE}/${path}.${format}`

  const size = options.size
  if (size === undefined) return url

  if (!SIZES.has(size)) {
    throw new RangeError(
      `${String(size)} is not a CDN image size. Discord accepts powers of two from 16 to 4096.`,
    )
  }
  return `${url}?size=${String(size)}`
}

/** A user's avatar. */
export function userAvatarUrl(userId: Snowflake, hash: string, options?: ImageOptions): string {
  return cdnUrl(`avatars/${userId}/${hash}`, hash, options)
}

/**
 * The avatar Discord shows a user who has not set one.
 *
 * @param userId - The user's ID.
 * @param discriminator - Their discriminator, `'0'` on a migrated account.
 * @returns The URL.
 *
 * @remarks
 * **Two different rules, and which applies depends on the account.** Legacy accounts still
 * carry a four-digit discriminator and their default avatar is `discriminator % 5`. Migrated
 * accounts report `'0'`, and Discord switched them to `(id >> 22) % 6` — a different modulus
 * over a different value. Applying the old rule to a migrated account gives everybody the blue
 * one, because `0 % 5` is `0`.
 *
 * The shift is done in `bigint` because a snowflake exceeds `Number.MAX_SAFE_INTEGER`; `>>` on
 * a number would silently truncate it and produce the wrong index.
 */
export function defaultAvatarUrl(userId: Snowflake, discriminator: string): string {
  const index =
    discriminator === '0'
      ? Number((BigInt(userId) >> 22n) % 6n)
      : Number.parseInt(discriminator, 10) % 5

  return `${BASE}/embed/avatars/${String(index)}.png`
}

/** A user's profile banner. */
export function userBannerUrl(userId: Snowflake, hash: string, options?: ImageOptions): string {
  return cdnUrl(`banners/${userId}/${hash}`, hash, options)
}

/**
 * A member's guild-specific avatar.
 *
 * @remarks
 * A different path from the user's own avatar, not a variant of it — a member who has set a
 * per-guild avatar has two, and the guild one wins inside that guild.
 */
export function memberAvatarUrl(
  guildId: Snowflake,
  userId: Snowflake,
  hash: string,
  options?: ImageOptions,
): string {
  return cdnUrl(`guilds/${guildId}/users/${userId}/avatars/${hash}`, hash, options)
}

/** A member's guild-specific banner. */
export function memberBannerUrl(
  guildId: Snowflake,
  userId: Snowflake,
  hash: string,
  options?: ImageOptions,
): string {
  return cdnUrl(`guilds/${guildId}/users/${userId}/banners/${hash}`, hash, options)
}

/** A guild's icon. */
export function guildIconUrl(guildId: Snowflake, hash: string, options?: ImageOptions): string {
  return cdnUrl(`icons/${guildId}/${hash}`, hash, options)
}

/** A guild's invite splash. Never animated. */
export function guildSplashUrl(guildId: Snowflake, hash: string, options?: ImageOptions): string {
  return cdnUrl(`splashes/${guildId}/${hash}`, hash, options)
}

/** A guild's discovery splash. Never animated. */
export function guildDiscoverySplashUrl(
  guildId: Snowflake,
  hash: string,
  options?: ImageOptions,
): string {
  return cdnUrl(`discovery-splashes/${guildId}/${hash}`, hash, options)
}

/** A guild's banner. */
export function guildBannerUrl(guildId: Snowflake, hash: string, options?: ImageOptions): string {
  return cdnUrl(`banners/${guildId}/${hash}`, hash, options)
}

/** A role's icon. */
export function roleIconUrl(roleId: Snowflake, hash: string, options?: ImageOptions): string {
  return cdnUrl(`role-icons/${roleId}/${hash}`, hash, options)
}
