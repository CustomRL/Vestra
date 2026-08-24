import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ActivityType, GatewayOpcodes } from '@vestra/types'
import { presencePayload, resolvePresence } from '@vestra/core'

const NOW = 1_700_000_000_000

describe('presence options', () => {
  it('CP1: defaults to online, doing nothing, not away', () => {
    assert.deepEqual(resolvePresence({}, NOW), {
      since: null,
      activities: [],
      status: 'online',
      afk: false,
    })
  })

  it('CP2: defaults an activity to Playing', () => {
    const resolved = resolvePresence({ activities: [{ name: 'Vestra' }] }, NOW)
    assert.deepEqual(resolved.activities, [{ name: 'Vestra', type: ActivityType.Playing }])
  })

  it('CP3: makes a custom status show something', () => {
    // Discord renders a custom status from `state`, not `name`, and requires a `name` anyway
    // that it never displays. `{ name: 'hello', type: Custom }` therefore shows nothing at all,
    // which is a confusing way to fail.
    const resolved = resolvePresence(
      { activities: [{ name: 'building a library', type: ActivityType.Custom }] },
      NOW,
    )

    assert.deepEqual(resolved.activities, [
      {
        name: 'building a library',
        type: ActivityType.Custom,
        state: 'building a library',
      },
    ])
  })

  it('CP4: lets an explicit state win over the fallback', () => {
    // A caller who knows the rule is not second-guessed.
    const resolved = resolvePresence(
      { activities: [{ name: 'Custom Status', type: ActivityType.Custom, state: 'brb' }] },
      NOW,
    )

    assert.equal(resolved.activities[0]?.state, 'brb')
  })

  it('CP5: leaves a non-custom activity without a state', () => {
    const resolved = resolvePresence({ activities: [{ name: 'Vestra' }] }, NOW)
    assert.equal('state' in (resolved.activities[0] ?? {}), false)
  })

  it('CP6: stamps since only when idle', () => {
    // Discord reads it only for an idle status, and renders it as "idle for 20 minutes".
    assert.equal(resolvePresence({ status: 'idle' }, NOW).since, NOW)
    assert.equal(resolvePresence({ status: 'online' }, NOW).since, null)
    assert.equal(resolvePresence({ status: 'dnd' }, NOW).since, null)
  })

  it('CP7: lets a caller supply their own since', () => {
    assert.equal(resolvePresence({ status: 'idle', since: 5 }, NOW).since, 5)
  })

  it('CP8: carries a stream URL through', () => {
    const resolved = resolvePresence(
      {
        activities: [
          { name: 'live', type: ActivityType.Streaming, url: 'https://twitch.tv/example' },
        ],
      },
      NOW,
    )

    assert.equal(resolved.activities[0]?.url, 'https://twitch.tv/example')
  })

  it('CP9: wraps the data in opcode 3', () => {
    const payload = presencePayload({ status: 'dnd' }, NOW)
    assert.equal(payload.op, GatewayOpcodes.PresenceUpdate)
    assert.equal(payload.d.status, 'dnd')
  })
})
