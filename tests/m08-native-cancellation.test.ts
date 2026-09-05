import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { startLocalMcpBridge } from '../agents/_mcp-bridge.ts'
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

test('cancellation while waiting for the checkpoint queue prevents a later persist dispatch', async () => {
  const conversationId = 'conv-m08-native-persist-queue'
  const root = workspaceRoot(conversationId)
  const firstPersistStarted = deferred()
  const releaseFirstPersist = deferred<typeof checkpoint>()
  const commandRan = deferred()
  let persistCalls = 0

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
      async kill() {},
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
    controller.abort(new Error('user stop'))
    await assert.rejects(call)

    releaseFirstPersist.resolve(checkpoint)
    await blockingPersist
    await wait(80)

    assert.equal(persistCalls, 1, 'an already-cancelled queued checkpoint must not call sandbox.persist')
  } finally {
    releaseFirstPersist.resolve(checkpoint)
    await blockingPersist.catch(() => {})
    await client.close().catch(() => {})
    await bridge.close().catch(() => {})
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
