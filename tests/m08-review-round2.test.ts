import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { startLocalMcpBridge } from '../agents/_mcp-bridge.ts'
import {
  runWithSandboxAbort,
  withRunnerOwnedSandboxCancellation,
} from '../agents/_sandbox-abort.ts'
import { onRequestPost } from '../agents/stop.ts'

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function timeoutAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function textOf(result: any): string {
  const text = Array.isArray(result?.content)
    ? result.content.find((entry: any) => entry?.type === 'text')?.text
    : undefined
  assert.equal(typeof text, 'string')
  return text
}

test('MCP bridge created before Stop is fenced before its first later command dispatch', async () => {
  let epoch = 'before-stop'
  let runCalls = 0
  let killCalls = 0
  const context = {
    store: {
      state: {
        async get(key: string) {
          assert.equal(key, 'pqg:m08:stop-epoch')
          return epoch
        },
      },
    },
    sandbox: {
      commands: {
        async run() {
          runCalls += 1
          return { exitCode: 0, stdout: 'DSH_MAKERS_SANDBOX_OK', stderr: '' }
        },
      },
      async kill() {
        killCalls += 1
      },
    },
    tools: { all: () => [] },
  }

  const bridge = await startLocalMcpBridge(() => context, 'conv-mcp-stop-fence')
  const client = new Client({ name: 'pqg-m08-review2', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(bridge.url))

  try {
    await client.connect(transport)
    epoch = 'after-stop'
    const result = await client.callTool({ name: 'sandbox_probe', arguments: {} })

    assert.equal(result.isError, true)
    assert.equal(textOf(result), 'WORKSPACE_COMMAND_ABORTED')
    assert.equal(runCalls, 0, 'a pre-Stop bridge must not dispatch a command after the Stop fence')
    assert.equal(killCalls, 1)
  } finally {
    await client.close().catch(() => {})
    await bridge.close()
  }
})

test('expired shared-state poll cannot kill sandbox work after wrapper completion', async () => {
  const finalRead = deferred<unknown>()
  const stalePollRead = deferred<unknown>()
  let reads = 0
  let killCalls = 0

  const context = {
    store: {
      state: {
        get() {
          reads += 1
          if (reads === 1) return Promise.resolve('stable')
          if (reads === 2) return finalRead.promise
          if (reads === 3) return stalePollRead.promise
          return Promise.resolve('stable')
        },
      },
    },
    sandbox: {
      async kill() {
        killCalls += 1
      },
    },
  }

  const pending = runWithSandboxAbort(
    context,
    async () => 'done',
    { useRequestSignal: false, requireSharedStop: true, pollIntervalMs: 20 },
  )

  for (let index = 0; index < 20 && reads < 3; index += 1) await delay(5)
  assert.equal(reads, 3, 'the poll read must be in flight before completion')

  finalRead.resolve('stable')
  assert.equal(await pending, 'done')

  stalePollRead.resolve('after-stop')
  await delay(25)
  assert.equal(killCalls, 0, 'an expired poll must not kill after ownership has ended')
})

test('termination uses the exact sandbox captured for command dispatch', async () => {
  const controller = new AbortController()
  let firstSandboxReads = 0
  let killA = 0
  let killB = 0
  let rejectRun: ((error: Error) => void) | undefined

  const sandboxA = {
    commands: {
      run() {
        return new Promise((_resolve, reject) => {
          rejectRun = reject
        })
      },
    },
    async kill() {
      killA += 1
      rejectRun?.(new Error('sandbox A terminated'))
    },
  }
  const sandboxB = {
    commands: { async run() { return { exitCode: 0, stdout: '', stderr: '' } } },
    async kill() {
      killB += 1
    },
  }
  const context = {
    request: { signal: controller.signal },
    get sandbox() {
      firstSandboxReads += 1
      return firstSandboxReads === 1 ? sandboxA : sandboxB
    },
  }

  const wrapped = withRunnerOwnedSandboxCancellation(context)
  const pending = wrapped.sandbox.commands.run('sleep 60')
  await delay(0)
  controller.abort()

  await assert.rejects(
    () => Promise.race([pending, timeoutAfter(500, 'captured sandbox was not cancelled')]),
    error => error instanceof Error
      && error.name === 'AbortError'
      && error.message === 'WORKSPACE_COMMAND_ABORTED',
  )
  assert.equal(killA, 1, 'the sandbox whose commands.run was dispatched must be terminated')
  assert.equal(killB, 0, 'a refreshed context sandbox must never be terminated for the older command')
})

test('request abort during the final shared-state read cannot return command success', async () => {
  const controller = new AbortController()
  const finalRead = deferred<unknown>()
  let reads = 0
  let killCalls = 0

  const context = {
    request: { signal: controller.signal },
    store: {
      state: {
        get() {
          reads += 1
          if (reads === 1) return Promise.resolve('stable')
          if (reads === 2) return finalRead.promise
          return Promise.resolve('stable')
        },
      },
    },
    sandbox: {
      async kill() {
        killCalls += 1
      },
    },
  }

  const pending = runWithSandboxAbort(context, async () => 'late-success')
  for (let index = 0; index < 20 && reads < 2; index += 1) await delay(0)
  assert.equal(reads, 2, 'the final epoch read must be pending before abort')

  controller.abort()
  finalRead.resolve('stable')

  await assert.rejects(
    () => pending,
    error => error instanceof Error
      && error.name === 'AbortError'
      && error.message === 'WORKSPACE_COMMAND_ABORTED',
  )
  assert.equal(killCalls, 1)
})

test('shared-state outage remains a cancellation-unavailable failure while failing closed', async () => {
  let reads = 0
  let killCalls = 0
  let rejectRun: ((error: Error) => void) | undefined
  const context = {
    store: {
      state: {
        async get() {
          reads += 1
          if (reads === 1) return 'stable'
          throw new Error('transient state backend detail')
        },
      },
    },
    sandbox: {
      async kill() {
        killCalls += 1
        rejectRun?.(new Error('sandbox terminated'))
      },
    },
  }

  const pending = runWithSandboxAbort(
    context,
    () => new Promise((_resolve, reject) => { rejectRun = reject }),
    { useRequestSignal: false, requireSharedStop: true, pollIntervalMs: 20 },
  )

  await assert.rejects(
    () => Promise.race([pending, timeoutAfter(500, 'shared-state outage did not fail closed')]),
    error => error instanceof Error
      && error.name === 'CancellationUnavailableError'
      && error.message === 'WORKSPACE_CANCELLATION_UNAVAILABLE'
      && !error.message.includes('backend detail'),
  )
  assert.equal(killCalls, 1, 'loss of required cancellation state must terminate the command sandbox')
})

test('request abort during initial shared-state read prevents command dispatch', async () => {
  const controller = new AbortController()
  const initialRead = deferred<unknown>()
  let runCalls = 0
  let killCalls = 0
  const context = {
    request: { signal: controller.signal },
    store: { state: { get: () => initialRead.promise } },
    sandbox: {
      async kill() {
        killCalls += 1
      },
    },
  }

  const pending = runWithSandboxAbort(context, async () => {
    runCalls += 1
    return 'should-not-run'
  })
  await delay(0)
  controller.abort()
  initialRead.resolve('stable')

  await assert.rejects(
    () => pending,
    error => error instanceof Error
      && error.name === 'AbortError'
      && error.message === 'WORKSPACE_COMMAND_ABORTED',
  )
  assert.equal(runCalls, 0, 'an abort observed before dispatch must suppress the operation entirely')
  assert.equal(killCalls, 1)
})

test('Stop refuses to publish cancellation without a verified conversation scope', async () => {
  const writes: Array<{ key: string; value: unknown }> = []
  let abortCalls = 0
  const response = await onRequestPost({
    request: { body: { conversation_id: 'conv-target' } },
    store: {
      state: {
        async set(key: string, value: unknown) {
          writes.push({ key, value })
        },
      },
    },
    utils: {
      async abortActiveRun() {
        abortCalls += 1
        return { aborted: false }
      },
    },
  })
  const body = await response.json() as any

  assert.equal(response.status, 200)
  assert.equal(writes.length, 0, 'an unscoped Stop request must not write through an unknown store scope')
  assert.equal(abortCalls, 1, 'platform abort may still be attempted independently')
  assert.equal(body.ok, false)
  assert.deepEqual(body.cancellation, {
    published: false,
    error: 'CANCELLATION_SCOPE_MISMATCH',
  })
})
