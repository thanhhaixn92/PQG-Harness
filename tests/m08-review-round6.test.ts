import assert from 'node:assert/strict'
import test from 'node:test'
import * as sidecarModule from '../agents/_dsh-web-sidecar.ts'
import {
  M08_STOP_EPOCH_KEY,
  M08_STOP_EPOCH_METADATA_KEY,
  runWithSandboxAbort,
  withRunnerOwnedSandboxCancellation,
} from '../agents/_sandbox-abort.ts'

const sidecarApi = sidecarModule as typeof sidecarModule & Record<string, any>

function requiredFunction(name: string): (...args: any[]) => any {
  const value = sidecarApi[name]
  assert.equal(typeof value, 'function', `${name} must be exported`)
  return value
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => { resolve = res })
  return { promise, resolve }
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

test('scoped state catch-up to the authoritative metadata baseline is not a new Stop', async () => {
  const conversationId = 'conv-round6-state-catchup'
  const authoritativeEpoch = 'run:2000:authoritative'
  const staleStateEpoch = 'run:1000:stale'
  let stateEpoch = staleStateEpoch
  let runCalls = 0
  let killCalls = 0
  const context = {
    conversation_id: conversationId,
    store: {
      async getConversation() {
        return { metadata: { [M08_STOP_EPOCH_METADATA_KEY]: authoritativeEpoch } }
      },
      state: {
        async get(key: string) {
          assert.equal(key, M08_STOP_EPOCH_KEY)
          return stateEpoch
        },
      },
    },
    sandbox: {
      async kill() { killCalls += 1 },
    },
  }

  const result = await runWithSandboxAbort(
    context,
    async () => {
      runCalls += 1
      stateEpoch = authoritativeEpoch
      return 'ok'
    },
    {
      useRequestSignal: false,
      requireSharedStop: true,
      conversationId,
      sharedStopBaseline: Object.freeze({
        value: authoritativeEpoch,
        scopedStateTracked: true,
        scopedStateValue: staleStateEpoch,
      }),
      pollIntervalMs: 1_000,
    },
  ).catch((error: unknown) => error)

  assert.equal(result, 'ok')
  assert.equal(runCalls, 1)
  assert.equal(killCalls, 0, 'state convergence to the authoritative baseline must not cancel the run')
})

test('direct runner keeps request cancellation active while checkpoint persist is pending', async () => {
  const controller = new AbortController()
  const persistStarted = deferred<void>()
  const persistGate = deferred<void>()
  let killCalls = 0
  let persistCalls = 0
  const context = {
    request: { signal: controller.signal },
    sandbox: {
      async kill() { killCalls += 1 },
      commands: {
        async run() {
          return { stdout: '', stderr: '', exitCode: 0 }
        },
      },
      async persist() {
        persistCalls += 1
        persistStarted.resolve()
        await persistGate.promise
        return { checkpointId: 'late-checkpoint' }
      },
    },
  }
  const wrapped = withRunnerOwnedSandboxCancellation(context, { useRequestSignal: true })

  const pending = wrapped.sandbox.persist().catch((error: unknown) => error)
  await persistStarted.promise
  controller.abort()
  persistGate.resolve()
  const result = await pending

  assert.ok(result instanceof Error)
  assert.equal(result.name, 'AbortError')
  assert.match(result.message, /WORKSPACE_COMMAND_ABORTED/)
  assert.equal(persistCalls, 1)
  assert.equal(killCalls, 1, 'abort during persist must terminate the owning sandbox')
})

test('active poll Stop observed during the final fence read wins over command success', async () => {
  const finalRead = deferred<unknown>()
  const finalReadStarted = deferred<void>()
  let reads = 0
  let killCalls = 0
  const context = {
    store: {
      state: {
        get() {
          reads += 1
          if (reads === 1) return Promise.resolve('stable')
          if (reads === 2) {
            finalReadStarted.resolve()
            return finalRead.promise
          }
          return Promise.resolve('after-stop')
        },
      },
    },
    sandbox: {
      async kill() { killCalls += 1 },
    },
  }

  const pending = runWithSandboxAbort(
    context,
    async () => 'late-success',
    { useRequestSignal: false, requireSharedStop: true, pollIntervalMs: 20 },
  ).catch((error: unknown) => error)

  await finalReadStarted.promise
  for (let index = 0; index < 40 && killCalls === 0; index += 1) await delay(5)
  finalRead.resolve('stable')
  const result = await pending

  assert.equal(killCalls, 1, 'the still-owning poll must terminate the sandbox after observing Stop')
  assert.ok(result instanceof Error)
  assert.equal(result.name, 'AbortError')
  assert.match(result.message, /WORKSPACE_COMMAND_ABORTED/)
})

test('active poll outage during the final fence read remains cancellation-unavailable', async () => {
  const finalRead = deferred<unknown>()
  const finalReadStarted = deferred<void>()
  let reads = 0
  let killCalls = 0
  const context = {
    store: {
      state: {
        get() {
          reads += 1
          if (reads === 1) return Promise.resolve('stable')
          if (reads === 2) {
            finalReadStarted.resolve()
            return finalRead.promise
          }
          throw new Error('synthetic state outage')
        },
      },
    },
    sandbox: {
      async kill() { killCalls += 1 },
    },
  }

  const pending = runWithSandboxAbort(
    context,
    async () => 'late-success',
    { useRequestSignal: false, requireSharedStop: true, pollIntervalMs: 20 },
  ).catch((error: unknown) => error)

  await finalReadStarted.promise
  for (let index = 0; index < 40 && killCalls === 0; index += 1) await delay(5)
  finalRead.resolve('stable')
  const result = await pending

  assert.equal(killCalls, 1)
  assert.ok(result instanceof Error)
  assert.equal(result.name, 'CancellationUnavailableError')
  assert.equal(result.message, 'WORKSPACE_CANCELLATION_UNAVAILABLE')
})

test('explicit Stop during the final sidecar fence read cannot return a lease', async () => {
  const acquire = requiredFunction('acquireDshWebSidecar')
  const stop = requiredFunction('stopDshWebSidecar')
  const setStarter = requiredFunction('__setSidecarStarterForTests')
  const conversationId = 'conv-round6-final-sidecar-read'
  let blockNextRead = false
  let closeCalls = 0
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
          if (!blockNextRead) return 'stable'
          blockNextRead = false
          const captured = 'stable'
          signalReadStarted()
          await readGate
          return captured
        },
      },
    },
  }

  setStarter(async (_ctx: any, id: string) => fakeSidecar(id, () => { closeCalls += 1 }))

  try {
    const initial = await acquire(context)
    initial.release()

    blockNextRead = true
    const acquiring = acquire(context).catch((error: unknown) => error)
    await readStarted
    const stopResult = await stop(conversationId)
    releaseRead()
    const result = await acquiring
    if (!(result instanceof Error)) result.release()

    assert.deepEqual(stopResult, { found: true, closed: true })
    assert.equal(closeCalls, 1)
    assert.ok(result instanceof Error)
    assert.match(String(result), /SIDE_CAR_STOPPING/)
  } finally {
    releaseRead()
    await stop(conversationId).catch(() => {})
    setStarter(undefined)
  }
})

test('pre-start Stop rejection is reported as a successful sidecar close', async () => {
  const acquire = requiredFunction('acquireDshWebSidecar')
  const stop = requiredFunction('stopDshWebSidecar')
  const setStarter = requiredFunction('__setSidecarStarterForTests')
  const conversationId = 'conv-round6-prestart-stop'
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
    const stopping = stop(conversationId)
    epoch = `run:${Date.now()}:stop`
    releaseRead()

    const [acquireResult, stopResult] = await Promise.all([acquiring, stopping])
    assert.ok(acquireResult instanceof Error)
    assert.match(String(acquireResult), /SIDE_CAR_STOPPING/)
    assert.deepEqual(stopResult, { found: true, closed: true })
    assert.equal(starts, 0, 'pre-start Stop must reject before any sidecar resource is created')
  } finally {
    releaseRead()
    setStarter(undefined)
  }
})
