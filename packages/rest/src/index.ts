/**
 * Discord REST client: bucket-accurate rate limiting over native `fetch`.
 *
 * @packageDocumentation
 */

import { APIVersion } from '@vestra/types'

/**
 * Base URL for all Discord REST requests, pinned to the API version
 * declared by {@link @vestra/types#APIVersion}.
 */
export const RouteBases = {
  api: `https://discord.com/api/v${APIVersion}`,
  cdn: 'https://cdn.discordapp.com',
} as const
