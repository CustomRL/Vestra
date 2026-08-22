/**
 * Timer and randomness sources, injectable so heartbeat behaviour is testable without
 * waiting real seconds.
 */
export interface Timers {
  /** Schedules a callback. */
  setTimeout: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>
  /** Cancels a scheduled callback. */
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void
  /** The current time in milliseconds. */
  now: () => number
  /** A number in [0, 1). */
  random: () => number
}

/**
 * The default timer sources.
 */
export const SystemTimers: Timers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => {
    clearTimeout(handle)
  },
  now: () => Date.now(),
  random: () => Math.random(),
}
