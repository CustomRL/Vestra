import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShardState } from '@vestra/gateway'
import { GatewayError } from '@vestra/gateway'
import { GatewayOpcodes, type GatewayDispatchPayload } from '@vestra/types'
import {
  CacheRegistry,
  ClientError,
  ClientErrorCode,
  CoreError,
  EventHandlerError,
  EventRouter,
  defineHandler,
  type DispatchShard,
  type EventContext,
} from '@vestra/core'

const shard: DispatchShard = { id: 0, state: ShardState.Ready, guildsPending: false }

function dispatch(t: string, d: unknown): GatewayDispatchPayload {
  return { op: GatewayOpcodes.Dispatch, t, s: 1, d } as GatewayDispatchPayload
}

describe('the error hierarchy', () => {
  it('ER1: gives every core error one base to catch', () => {
    // Naming each concrete class instead compiles today and quietly stops matching the day a
    // fourth is added.
    assert.ok(new ClientError(ClientErrorCode.Destroyed, 'x') instanceof CoreError)
    assert.ok(new EventHandlerError('MESSAGE_CREATE', new Error('x')) instanceof CoreError)
    assert.ok(new CoreError('x') instanceof Error)
  })

  it('ER2: keeps the core and gateway hierarchies apart', () => {
    // A consumer catching GatewayError is asking about the connection. A mistyped option is
    // not about the connection, and folding them together would make that check answer `true`
    // for it.
    assert.equal(new ClientError(ClientErrorCode.Destroyed, 'x') instanceof GatewayError, false)
  })

  it('ER3: carries a code rather than making callers match on message text', () => {
    // A consumer deciding whether to retry has to tell "that shard is reconnecting" from "this
    // client is finished", and matching on wording stops working when somebody improves it.
    const error = new ClientError(ClientErrorCode.ShardUnavailable, 'shard 3 is not connected')

    assert.equal(error.code, ClientErrorCode.ShardUnavailable)
    assert.equal(error.name, 'ClientError')
  })

  it('ER4: keeps the original failure as the cause', () => {
    const cause = new TypeError('cannot read properties of undefined')
    const error = new EventHandlerError('MESSAGE_CREATE', cause)

    assert.equal(error.cause, cause)
    assert.equal(error.event, 'MESSAGE_CREATE')
    // The event name is in the message, because a stack from inside a handler says almost
    // nothing on its own — every handler is reached through the same two lines of the router.
    assert.ok(error.message.includes('MESSAGE_CREATE'))
    assert.ok(error.message.includes(cause.message))
  })

  it('ER5: survives a cause that is not an Error', () => {
    // Handlers call consumer code, and consumer code throws strings.
    const error = new EventHandlerError('READY', 'something went wrong')

    assert.equal(error.cause, 'something went wrong')
    assert.ok(error.message.includes('something went wrong'))
  })
})

describe('containing a handler failure', () => {
  function harness(withListener: boolean): {
    router: EventRouter
    errors: unknown[]
  } {
    const errors: unknown[] = []
    const context: EventContext = {
      cache: new CacheRegistry(),
      rest: undefined as never,
      user: undefined,
      emit: (event: string, ...args: unknown[]) => {
        if (event === 'error') errors.push(args[0])
        return true
      },
      listenerCount: () => (withListener ? 1 : 0),
    } as EventContext

    const exploding = defineHandler('MESSAGE_CREATE', () => {
      throw new Error('handler exploded')
    })

    return { router: new EventRouter(context, [exploding]), errors }
  }

  it('ER6: reports a handler throw as an EventHandlerError naming the dispatch', () => {
    const { router, errors } = harness(true)
    router.route(dispatch('MESSAGE_CREATE', { id: '1' }), shard, false)

    assert.equal(errors.length, 1)
    assert.ok(errors[0] instanceof EventHandlerError)
    assert.equal(errors[0].event, 'MESSAGE_CREATE')
  })

  it('ER8: does not let a throwing error listener reach the socket either', async () => {
    // Also out of process: containing it means rethrowing on a clean tick, which lands after
    // an in-process test has finished and gets attributed to whichever test is running then.
    const script = [
      "import { CacheRegistry, EventRouter, defineHandler } from 'file:///D:/Projects/Vestra/packages/core/dist/index.js'",
      'const context = { cache: new CacheRegistry(), rest: undefined, user: undefined,',
      "  emit: () => { throw new Error('the error listener also exploded') }, listenerCount: () => 1 }",
      "const boom = defineHandler('MESSAGE_CREATE', () => { throw new Error('handler exploded') })",
      'const router = new EventRouter(context, [boom])',
      "router.route({ op: 0, t: 'MESSAGE_CREATE', s: 1, d: { id: '1' } }, { id: 0, state: 3, guildsPending: false }, false)",
      "console.log('SURVIVED THE SYNCHRONOUS CALL')",
    ].join(String.fromCharCode(10))

    const { stdout, stderr } = await run(script)

    assert.ok(
      stdout.includes('SURVIVED THE SYNCHRONOUS CALL'),
      'the listener throw reached the caller',
    )
    assert.ok(
      stderr.includes('the error listener also exploded'),
      `the listener failure was swallowed: ${stderr}`,
    )
  })
})

describe('reporting a contained failure', () => {
  it('ER9: survives the synchronous call and still reports the failure', async () => {
    // **The reason the containment exists, and both halves of it.** Node's `EventEmitter`
    // throws an unhandled `'error'` *synchronously into whoever called `emit`* — measured, not
    // assumed. That caller is the router, called by the shard bridge, called from the shard's
    // dispatch emit, called from the socket read. So one throw in one handler used to unwind
    // all the way into the read path: a consumer-side bug becoming a disconnect.
    //
    // Containing it must not mean swallowing it either. Node's own treatment of an unhandled
    // `'error'` is to crash with a stack, and that is kept — only moved off the socket path.
    //
    // Out of process because `node:test` installs its own `uncaughtException` handler, and a
    // throw scheduled on a clean tick lands after the test that caused it has finished. An
    // in-process version of this passed while failing the file.
    const script = [
      "import { CacheRegistry, EventRouter, defineHandler } from 'file:///D:/Projects/Vestra/packages/core/dist/index.js'",
      'const context = { cache: new CacheRegistry(), rest: undefined, user: undefined,',
      '  emit: () => true, listenerCount: () => 0 }',
      "const boom = defineHandler('MESSAGE_CREATE', () => { throw new Error('handler exploded') })",
      'const router = new EventRouter(context, [boom])',
      "router.route({ op: 0, t: 'MESSAGE_CREATE', s: 1, d: { id: '1' } }, { id: 0, state: 3, guildsPending: false }, false)",
      "console.log('SURVIVED THE SYNCHRONOUS CALL')",
    ].join(String.fromCharCode(10))

    const { stdout, stderr, code } = await run(script)

    assert.ok(stdout.includes('SURVIVED THE SYNCHRONOUS CALL'), 'the call threw synchronously')
    assert.notEqual(code, 0, 'the failure was swallowed — the process exited cleanly')
    assert.ok(stderr.includes('EventHandlerError'), `expected an EventHandlerError, got: ${stderr}`)
    assert.ok(stderr.includes('MESSAGE_CREATE'), 'the report did not name the dispatch')
  })
})

/** Runs a snippet in a child process and collects what it said. */
async function run(source: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const { spawn } = await import('node:child_process')

  return await new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 0 })
    })
  })
}
