import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, it } from 'node:test'
import { AsyncQueue } from '@vestra/rest'

describe('AsyncQueue', () => {
  it('runs callers strictly in arrival order', async () => {
    const queue = new AsyncQueue()
    const order: number[] = []

    const task = async (id: number, delay: number) => {
      const release = await queue.acquire()
      try {
        await sleep(delay)
        order.push(id)
      } finally {
        release()
      }
    }

    // Descending delays: if the queue were not serialising, the fastest would finish first.
    await Promise.all([task(1, 30), task(2, 20), task(3, 10)])

    assert.deepEqual(order, [1, 2, 3])
  })

  it('grants exclusive access, never overlapping critical sections', async () => {
    const queue = new AsyncQueue()
    let active = 0
    let maxActive = 0

    await Promise.all(
      Array.from({ length: 10 }, async () => {
        const release = await queue.acquire()
        try {
          active += 1
          maxActive = Math.max(maxActive, active)
          await sleep(1)
          active -= 1
        } finally {
          release()
        }
      }),
    )

    assert.equal(maxActive, 1, 'more than one caller held the queue at once')
  })

  it('rejects an aborted waiter without stranding the queue', async () => {
    const queue = new AsyncQueue()
    const controller = new AbortController()

    const first = await queue.acquire()

    const aborted = queue.acquire(controller.signal)
    const behind = queue.acquire()

    controller.abort(new Error('cancelled'))
    await assert.rejects(aborted, /cancelled/)

    // The queue must still drain: the caller behind the aborted one is not stranded.
    first()
    const release = await behind
    release()
    assert.equal(queue.remaining, 0)
  })

  it('does not let a later caller overtake the holder when one aborts', async () => {
    // This is the specific race that a naive "remove and resolve" abort implementation
    // introduces: resolving the cancelled waiter's promise immediately releases whoever
    // was queued behind it, while the original holder is still inside its critical section.
    const queue = new AsyncQueue()
    const controller = new AbortController()
    const order: string[] = []

    const holderRelease = await queue.acquire()
    order.push('holder-acquired')

    const aborted = queue.acquire(controller.signal)

    let behindAcquired = false
    const behind = queue.acquire().then((release) => {
      behindAcquired = true
      order.push('behind-acquired')
      return release
    })

    controller.abort(new Error('cancelled'))
    await assert.rejects(aborted, /cancelled/)

    // Give the microtask queue every chance to (incorrectly) release the next caller.
    await sleep(20)
    assert.equal(behindAcquired, false, 'a queued caller overtook the current holder')

    order.push('holder-released')
    holderRelease()

    const release = await behind
    release()

    assert.deepEqual(order, ['holder-acquired', 'holder-released', 'behind-acquired'])
  })

  it('rejects immediately when handed an already-aborted signal', async () => {
    const queue = new AsyncQueue()
    await assert.rejects(
      queue.acquire(AbortSignal.abort(new Error('already gone'))),
      /already gone/,
    )

    // ...and the queue is still usable afterwards.
    const release = await queue.acquire()
    release()
    assert.equal(queue.remaining, 0)
  })

  it('ignores a double release rather than corrupting the chain', async () => {
    const queue = new AsyncQueue()
    const release = await queue.acquire()
    release()
    release()
    assert.equal(queue.remaining, 0)

    const second = await queue.acquire()
    second()
    assert.equal(queue.remaining, 0)
  })
})
