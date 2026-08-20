/**
 * Serialises access to a resource, in the order callers arrived.
 *
 * @remarks
 * This is the primitive underneath every rate-limit bucket. The queue is a promise chain
 * rather than an array plus a drain loop: each caller awaits its predecessor, so waiting
 * costs one promise and no polling. A `setInterval` drain would burn a timer per bucket
 * and add latency averaging half a tick to every request.
 *
 * `acquire` hands back the release function rather than exposing a separate `shift`.
 * That makes the pairing impossible to get wrong by identity — there is no way to release
 * a slot that is not yours — and it is what keeps cancellation correct: an aborted caller
 * must not release the queue out from under whoever currently holds it.
 */
export class AsyncQueue {
  /**
   * Resolves when the most recently queued caller releases.
   *
   * @remarks
   * Each `acquire` awaits the current tail and installs its own promise as the new one,
   * which is the entire queue: no array, no scanning, no index arithmetic.
   */
  #tail: Promise<void> = Promise.resolve()

  /** How many callers hold or are waiting for the queue. */
  #size = 0

  /**
   * How many callers hold or are waiting for the queue.
   */
  get remaining(): number {
    return this.#size
  }

  /**
   * Waits for every earlier caller to release, then takes the queue.
   *
   * @param signal - Aborts the wait.
   * @returns A release function. Call it exactly once, from a `finally`; extra calls are
   *          ignored so a double release cannot corrupt the chain.
   * @throws The signal's reason if it aborts before the caller reaches the head. In that
   *         case no release function is returned and none is needed.
   */
  async acquire(signal?: AbortSignal): Promise<() => void> {
    this.#size += 1

    const previous = this.#tail
    let release!: () => void
    this.#tail = new Promise<void>((resolve) => {
      release = resolve
    })

    try {
      await (signal ? waitWithAbort(previous, signal) : previous)
    } catch (error) {
      // The queue was never acquired, so this caller must not release it now — the
      // predecessor is still inside its critical section. Instead the slot is released
      // once the predecessor finishes, which preserves ordering for everyone behind.
      this.#size -= 1
      void previous.then(release, release)
      throw error
    }

    let released = false
    return () => {
      if (released) return
      released = true
      this.#size -= 1
      release()
    }
  }
}

/**
 * Awaits a promise, rejecting early if a signal aborts.
 *
 * @param promise - The promise to await.
 * @param signal - The signal to watch.
 * @returns A promise settling on whichever happens first.
 */
async function waitWithAbort(promise: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw signal.reason
  const controller = new AbortController()
  try {
    await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            reject(signal.reason as Error)
          },
          { once: true, signal: controller.signal },
        )
      }),
    ])
  } finally {
    // Detach the listener whichever way the race went, or a long-lived signal
    // accumulates one listener per request and leaks.
    controller.abort()
  }
}
