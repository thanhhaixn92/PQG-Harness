import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import {
  __setSidecarStarterForTests,
  acquireDshWebSidecar,
  stopDshWebSidecar,
} from '../agents/_dsh-web-sidecar.ts'
import { startLocalMcpBridge } from '../agents/_mcp-bridge.ts'
import { withSandboxCancellation } from '../agents/_sandbox-abort.ts'
import { persistWorkspaceCheckpoint, workspaceRoot } from '../agents/_workspace.ts'
import { onRequestPost } from '../agents/stop.ts'

const checkpoint = {
  size: 1,
  sha256: 'sha256',
  etag: 'etag',
  persistedAt: '2026-09-05T00:00:00.000Z',
}

function deferred<T = void>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function fakeSidecar(conversationId: string, close: () => Promise<void>): any {
  return {
    conversationId,
    home: `/tmp/${conversationId}`,
    port: 12345,
    child: {},
    gateway: { baseUrl: '', close: async () => {} },
    mcp: { url: '', requestCount: () => 0, requestLog: () => [], close: async () => {} },
    lastUsedAt: Date.now(),
    context: {},
    close,
  }
}

async function waitForRequestMetadata(bridge: { requestLog(): unknown[] }, previousLength: number): Promise<void> {
  const deadline = Date.now() + 500
  while (bridge.requestLog().length <= previousLength) {
    if (Date.now() >= deadline) throw new Error('MCP cancellation request was not delivered')
    await wait(5)
  }
  await new Promise(resolve => setImmediate(resolve))
}

async function connectClient(url: string): Promise<Client> {
  const client = new Client({ name: 'm08-test-client', version: '1.0.0' }, { capabilities: {} })
  await client.connect(new StreamableHTTPClientTransport(new URL(url)))
  return client
}

test('MCP cancellation terminates the exact sandbox owned by the in-flight tool call', async () => {
  const started = deferred()
  let currentContext: any
  let killedA = 0
  let killedB = 0
  let completedA = false
  let rejectA: ((error: Error) => void) | undefined
  let timerA: NodeJS.Timeout | undefined

  const sandboxA = {
    commands: {
      run() {
        started.resolve()
        return new Promise((resolve, reject) => {
          rejectA = reject
          timerA = setTimeout(() => {
            completedA = true
            resolve({ stdout: 'WAIT_FINISHED', stderr: '', exitCode: 0 })
          }, 120)
        })
      },
    },
    async kill() {
      killedA += 1
      if (timerA) clearTimeout(timerA)
      rejectA?.(new Error('sandbox A killed'))
    },
  }
  const sandboxB = {
    commands: { async run() { return { stdout: '', stderr: '', exitCode: 0 } } },
    async kill() { killedB += 1 },
  }
  currentContext = { sandbox: sandboxA, tools: { all: () => [] } }

  const bridge = await startLocalMcpBridge(() => currentContext, 'conv-m08-native-exact-owner')
  const client = await connectClient(bridge.url)
  try {
    const controller = new AbortController()
    const call = client.callTool(
      { name: 'sandbox_wait', arguments: { seconds: 1 } },
      CallToolResultSchema,
      { signal: controller.signal },
    )
    await started.promise
    currentContext = { sandbox: sandboxB, tools: { all: () => [] } }
    controller.abort(new Error('user stop'))

    await assert.rejects(call)
    await wait(160)

    assert.equal(killedA, 1, 'cancellation must kill the sandbox captured by the running tool')
    assert.equal(killedB, 0, 'cancellation must not re-read and kill a later request sandbox')
    assert.equal(completedA, false, 'cancelled sandbox work must not complete after Stop')
  } finally {
    await client.close().catch(() => {})
    await bridge.close().catch(() => {})
  }
})

test('cancellation while waiting for the checkpoint queue terminates the sandbox and prevents persist dispatch', async () => {
  const conversationId = 'conv-m08-native-persist-queue'
  const root = workspaceRoot(conversationId)
  const firstPersistStarted = deferred()
  const releaseFirstPersist = deferred<typeof checkpoint>()
  const commandRan = deferred()
  let persistCalls = 0
  let sandboxKills = 0

  const context = {
    tools: { all: () => [] },
    sandbox: {
      files: {
        async makeDir() {},
        async exists() { return true },
      },
      commands: {
        async run() {
          commandRan.resolve()
          return { stdout: 'OK', stderr: '', exitCode: 0 }
        },
      },
      async persist() {
        persistCalls += 1
        if (persistCalls === 1) {
          firstPersistStarted.resolve()
          return releaseFirstPersist.promise
        }
        return checkpoint
      },
      async kill() { sandboxKills += 1 },
    },
  }

  const blockingPersist = persistWorkspaceCheckpoint(context, conversationId, root)
  await firstPersistStarted.promise

  const bridge = await startLocalMcpBridge(() => context, conversationId)
  const client = await connectClient(bridge.url)
  try {
    const controller = new AbortController()
    const call = client.callTool(
      { name: 'workspace_run_command', arguments: { command: "printf 'OK'" } },
      CallToolResultSchema,
      { signal: controller.signal },
    )
    await commandRan.promise
    await new Promise(resolve => setImmediate(resolve))
    const requestLogLengthBeforeCancel = bridge.requestLog().length
    controller.abort(new Error('user stop'))
    await assert.rejects(call)
    await waitForRequestMetadata(bridge, requestLogLengthBeforeCancel)

    releaseFirstPersist.resolve(checkpoint)
    await blockingPersist
    await wait(80)

    assert.equal(persistCalls, 1, 'an already-cancelled queued checkpoint must not call sandbox.persist')
    assert.equal(sandboxKills, 1, 'an already-cancelled queued operation must still terminate its captured sandbox')
  } finally {
    releaseFirstPersist.resolve(checkpoint)
    await blockingPersist.catch(() => {})
    await client.close().catch(() => {})
    await bridge.close().catch(() => {})
  }
})

test('sandbox termination attempts are individually bounded', async () => {
  const controller = new AbortController()
  const commandStarted = deferred()
  const releaseCommand = deferred<any>()
  const killGates: Array<ReturnType<typeof deferred>> = []

  const context = {
    sandbox: {
      commands: {
        run() {
          commandStarted.resolve()
          return releaseCommand.promise
        },
      },
      kill() {
        const gate = deferred()
        killGates.push(gate)
        return gate.promise
      },
    },
  }

  const wrapped = withSandboxCancellation(context, controller.signal)
  const operation = wrapped.sandbox.commands.run('sleep 30')
  await commandStarted.promise
  controller.abort(new Error('user stop'))

  const settled = await Promise.race([
    operation.then(
      () => ({ settled: true, error: undefined as Error | undefined }),
      (error: unknown) => ({ settled: true, error: error instanceof Error ? error : new Error(String(error)) }),
    ),
    wait(2_300).then(() => ({ settled: false, error: undefined as Error | undefined })),
  ])

  for (const gate of killGates) gate.resolve()
  releaseCommand.resolve({ stdout: '', stderr: '', exitCode: 0 })
  await operation.catch(() => {})

  assert.equal(settled.settled, true, 'a stuck sandbox.kill promise must not block cancellation forever')
  assert.equal(settled.error?.name, 'SandboxTerminationError')
  assert.equal(settled.error?.message, 'SANDBOX_KILL_FAILED')
})

test('Stop starts platform abort before sidecar shutdown settles', async () => {
  const conversationId = 'conv-m08-native-stop-order'
  const closeGate = deferred()
  const abortStarted = deferred()
  let response: Response | undefined

  __setSidecarStarterForTests(async () => fakeSidecar(conversationId, async () => {
    await closeGate.promise
  }))

  try {
    const lease = await acquireDshWebSidecar({ conversation_id: conversationId })
    lease.release()

    const stopPending = onRequestPost({
      request: { body: { conversation_id: conversationId } },
      utils: {
        async abortActiveRun() {
          abortStarted.resolve()
          return { aborted: true }
        },
      },
    })

    const abortBeganBeforeClose = await Promise.race([
      abortStarted.promise.then(() => true),
      wait(100).then(() => false),
    ])
    closeGate.resolve()
    response = await stopPending

    assert.equal(abortBeganBeforeClose, true, 'platform abort must start without waiting for sidecar shutdown')
    assert.equal(response.status, 200)
  } finally {
    closeGate.resolve()
    __setSidecarStarterForTests(undefined)
    await stopDshWebSidecar(conversationId).catch(() => {})
  }
})

test('Stop reports stable per-phase failures and aggregate failure', async () => {
  const conversationId = 'conv-m08-native-stop-failure'
  __setSidecarStarterForTests(async () => fakeSidecar(conversationId, async () => {
    throw new Error('sensitive sidecar close detail')
  }))

  try {
    const lease = await acquireDshWebSidecar({ conversation_id: conversationId })
    lease.release()

    const response = await onRequestPost({
      request: { body: { conversation_id: conversationId } },
      utils: {
        async abortActiveRun() { return { aborted: false } },
      },
    })
    const body = await response.json() as any

    assert.equal(response.status, 200)
    assert.equal(body.ok, false)
    assert.deepEqual(body.sidecar, {
      found: true,
      closed: false,
      error: 'SIDE_CAR_CLOSE_FAILED',
    })
    assert.deepEqual(body.platform, {
      aborted: false,
      error: 'PLATFORM_ABORT_FAILED',
    })
    assert.equal(JSON.stringify(body).includes('sensitive sidecar close detail'), false)
  } finally {
    __setSidecarStarterForTests(undefined)
    await stopDshWebSidecar(conversationId).catch(() => {})
  }
})

test('/stop delegates to sidecar/platform cancellation without killing the Stop request sandbox', async () => {
  let stopRequestSandboxKills = 0
  const response = await onRequestPost({
    request: { body: { conversation_id: 'conv-m08-native-stop-endpoint' } },
    utils: {
      async abortActiveRun() { return { aborted: true } },
    },
    sandbox: {
      async kill() { stopRequestSandboxKills += 1 },
    },
  })
  const body = await response.json() as any

  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.aborted ?? body.platform?.aborted, true)
  assert.equal(stopRequestSandboxKills, 0, 'the /stop request does not own the in-flight tool sandbox')
})
