import assert from 'node:assert/strict'
import test from 'node:test'
import * as sidecarModule from '../agents/_dsh-web-sidecar.ts'
import {
  M08_STOP_EPOCH_KEY,
  M08_STOP_EPOCH_METADATA_KEY,
  withRunnerOwnedSandboxCancellation,
} from '../agents/_sandbox-abort.ts'

const sidecarApi = sidecarModule as typeof sidecarModule & Record<string, any>

function requiredFunction(name: string): (...args: any[]) => any {
  const value = sidecarApi[name]
  assert.equal(typeof value, 'function', `${name} must be exported`)
  return value
}

function fakeSidecar(conversationId: string, close: () => Promise<void> | void): any {
  return {
    conversationId,
    home: `/tmp/${conversationId}`,
    port: 12345,
    child: {},
    gateway: { close: async () => {} },
    mcp: { close: async () => {} },
    lastUsedAt: Date.now(),
    context: { conversation_id: conversationId, env: {} },
    async close() { await close() },
  }
}

test('scoped state fast fence aborts while authoritative metadata is still stale', async () => {
  const conversationId = 'conv-round4-fast-reader'
  let runCalls = 0
  let killCalls = 0
  const context = {
    conversation_id: conversationId,
    store: {
      async getConversation() {
        return { metadata: { [M08_STOP_EPOCH_METADATA_KEY]: 'before-stop' } }
      },
      state: {
        async get(key: string) {
          assert.equal(key, M08_STOP_EPOCH_KEY)
          return 'after-stop'
        },
      },
    },
    sandbox: {
      async kill() { killCalls += 1 },
      commands: {
        async run() {
          runCalls += 1
          return { stdout: 'unexpected', stderr: '', exitCode: 0 }
        },
      },
    },
  }

  const wrapped = withRunnerOwnedSandboxCancellation(context, {
    useRequestSignal: false,
    requireSharedStop: true,
    conversationId,
    sharedStopBaseline: Object.freeze({ value: 'before-stop' }),
  })

  await assert.rejects(
    () => wrapped.sandbox.commands.run('true'),
    /WORKSPACE_COMMAND_ABORTED/,
  )
  assert.equal(runCalls, 0, 'the fast scoped fence must stop dispatch before stale metadata catches up')
  assert.equal(killCalls, 1)
})

test('direct runner rechecks its owning request signal at the actual persist boundary', async () => {
  const controller = new AbortController()
  let persistCalls = 0
  const context = {
    request: { signal: controller.signal },
    sandbox: {
      async kill() {},
      commands: {
        async run() {
          return { stdout: 'done', stderr: '', exitCode: 0 }
        },
      },
      async persist() {
        persistCalls += 1
        return { checkpointId: 'must-not-persist' }
      },
    },
  }

  const wrapped = withRunnerOwnedSandboxCancellation(context, {
    useRequestSignal: true,
  })

  await wrapped.sandbox.commands.run('true')
  controller.abort()

  await assert.rejects(
    () => wrapped.sandbox.persist(),
    /WORKSPACE_COMMAND_ABORTED/,
  )
  assert.equal(persistCalls, 0)
})

test('first sidecar acquire overtaken by a cross-process Stop cannot adopt the new epoch', async () => {
  const acquire = requiredFunction('acquireDshWebSidecar')
  const setStarter = requiredFunction('__setSidecarStarterForTests')
  const conversationId = 'conv-round4-first-acquire'
  let epoch: string | null = null
  let starts = 0
  let releaseRead!: () => void
  let signalReadStarted!: () => void
  const readGate = new Promise<void>(resolve => { releaseRead = resolve })
  const readStarted = new Promise<void>(resolve => { signalReadStarted = resolve })

  const context = {
    conversation_id: conversationId,
    env: {},
    store: {
      state: {
        async get(key: string) {
          assert.equal(key, M08_STOP_EPOCH_KEY)
          signalReadStarted()
          await readGate
          return epoch
        },
      },
    },
  }

  setStarter(async (_ctx: any, id: string) => {
    starts += 1
    return fakeSidecar(id, () => {})
  })

  try {
    const acquiring = acquire(context).catch((error: unknown) => error)
    await readStarted
    epoch = `stop:${Date.now()}:cross-process`
    releaseRead()

    const result = await acquiring
    assert.ok(result instanceof Error)
    assert.match(String(result), /SIDE_CAR_STOPPING/)
    assert.equal(starts, 0, 'a pre-Stop first acquire must not start a sidecar under the post-Stop fence')
  } finally {
    releaseRead()
    setStarter(undefined)
  }
})

test('explicit Stop overtakes acquires waiting for epoch retirement', async () => {
  const acquire = requiredFunction('acquireDshWebSidecar')
  const stop = requiredFunction('stopDshWebSidecar')
  const setStarter = requiredFunction('__setSidecarStarterForTests')
  const conversationId = 'conv-round4-explicit-stop-overtakes-retirement'
  let epoch = 'before-stop'
  let starts = 0
  let releaseClose!: () => void
  let signalCloseStarted!: () => void
  const closeGate = new Promise<void>(resolve => { releaseClose = resolve })
  const closeStarted = new Promise<void>(resolve => { signalCloseStarted = resolve })

  const context = {
    conversation_id: conversationId,
    env: {},
    store: {
      state: {
        async get(key: string) {
          assert.equal(key, M08_STOP_EPOCH_KEY)
          return epoch
        },
      },
    },
  }

  setStarter(async (_ctx: any, id: string) => {
    starts += 1
    const generation = starts
    return fakeSidecar(id, async () => {
      if (generation === 1) {
        signalCloseStarted()
        await closeGate
      }
    })
  })

  try {
    const initial = await acquire(context)
    initial.release()
    epoch = 'after-stop'

    const retirementOwner = acquire(context).catch((error: unknown) => error)
    await closeStarted
    const retirementJoiner = acquire(context).catch((error: unknown) => error)
    const explicitStop = stop(conversationId)
    releaseClose()

    const [ownerResult, joinerResult, stopResult] = await Promise.all([
      retirementOwner,
      retirementJoiner,
      explicitStop,
    ])

    assert.ok(ownerResult instanceof Error)
    assert.match(String(ownerResult), /SIDE_CAR_STOPPING/)
    assert.ok(joinerResult instanceof Error)
    assert.match(String(joinerResult), /SIDE_CAR_STOPPING/)
    assert.deepEqual(stopResult, { found: true, closed: true })
    assert.equal(starts, 1, 'no acquire admitted before explicit Stop may create a replacement')
  } finally {
    releaseClose()
    setStarter(undefined)
  }
})
