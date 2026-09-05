import assert from 'node:assert/strict'
import test from 'node:test'
import { runWorkspaceCommand } from '../agents/_workspace.ts'
import { onRequestPost } from '../agents/stop.ts'

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
}

function readyFiles() {
  return {
    makeDir: async () => {},
    exists: async () => true,
  }
}

test('abort recheck rejects when sandbox kill synchronously settles command success', async () => {
  const controller = new AbortController()
  let resolveRun!: (value: { exitCode: number; stdout: string; stderr: string }) => void
  let persistCalls = 0

  const sandbox = {
    files: readyFiles(),
    commands: {
      run() {
        return new Promise<{ exitCode: number; stdout: string; stderr: string }>(resolve => {
          resolveRun = resolve
        })
      },
    },
    async kill() {
      resolveRun({ exitCode: 0, stdout: 'late-success', stderr: '' })
    },
    async persist() {
      persistCalls += 1
      return { size: 1, sha256: 'x', etag: 'x', persistedAt: 'x' }
    },
  }

  const pending = runWorkspaceCommand({
    sandbox,
    request: { signal: controller.signal },
  }, 'conv-abort-success-race', 'sleep 60')

  await delay(0)
  controller.abort()

  await assert.rejects(
    () => pending,
    error => error instanceof Error
      && error.name === 'AbortError'
      && error.message === 'WORKSPACE_COMMAND_ABORTED',
  )
  assert.equal(persistCalls, 0, 'an observed abort must never reach checkpoint persistence')
})

test('sandbox kill failure retries and surfaces a stable fail-closed error', async () => {
  const controller = new AbortController()
  let killCalls = 0

  const sandbox = {
    files: readyFiles(),
    commands: {
      run() {
        return new Promise(() => {})
      },
    },
    async kill() {
      killCalls += 1
      throw new Error('sensitive provider detail')
    },
    async persist() {
      throw new Error('checkpoint must not run after cancellation')
    },
  }

  const pending = runWorkspaceCommand({
    sandbox,
    request: { signal: controller.signal },
  }, 'conv-kill-failure', 'sleep 60')
  await delay(0)
  controller.abort()

  await assert.rejects(
    () => Promise.race([pending, rejectAfter(750, 'kill failure was swallowed')]),
    error => error instanceof Error
      && error.name === 'SandboxTerminationError'
      && error.message === 'SANDBOX_KILL_FAILED'
      && !error.message.includes('sensitive provider detail'),
  )
  assert.equal(killCalls, 2, 'sandbox termination receives one bounded retry')
})

test('shared stop epoch cancels an MCP-style command even when request signal is not aborted', async () => {
  const controller = new AbortController()
  let epoch = 'before-stop'
  let killCalls = 0
  let rejectRun: ((error: Error) => void) | undefined

  const sandbox = {
    files: readyFiles(),
    commands: {
      run() {
        return new Promise((_resolve, reject) => {
          rejectRun = reject
        })
      },
    },
    async kill() {
      killCalls += 1
      rejectRun?.(new Error('sandbox terminated'))
    },
    async persist() {
      throw new Error('checkpoint must not run after shared Stop')
    },
  }

  const state = {
    async get(key: string) {
      assert.equal(key, 'pqg:m08:stop-epoch')
      return epoch
    },
  }

  const pending = runWorkspaceCommand({
    sandbox,
    store: { state },
    request: { signal: controller.signal },
  }, 'conv-shared-stop', 'sleep 60')

  await delay(25)
  epoch = 'after-stop'

  await assert.rejects(
    () => Promise.race([pending, rejectAfter(750, 'shared Stop epoch did not cancel the command')]),
    error => error instanceof Error
      && error.name === 'AbortError'
      && error.message === 'WORKSPACE_COMMAND_ABORTED',
  )
  assert.equal(controller.signal.aborted, false, 'test proves cancellation does not depend on latest request signal')
  assert.equal(killCalls, 1)
})

test('Stop publishes a conversation-scoped cancellation epoch before reporting success', async () => {
  const writes: Array<{ key: string; value: unknown }> = []
  let abortCalls = 0

  const response = await onRequestPost({
    conversation_id: 'conv-stop-epoch',
    run_id: 'run-stop-epoch',
    request: { body: { conversation_id: 'conv-stop-epoch' } },
    store: {
      state: {
        async set(key: string, value: unknown) {
          writes.push({ key, value })
        },
      },
    },
    utils: {
      async abortActiveRun(conversationId: string) {
        assert.equal(conversationId, 'conv-stop-epoch')
        abortCalls += 1
        return { aborted: true, run_id: 'run-target' }
      },
    },
  })
  const body = await response.json() as any

  assert.equal(response.status, 200)
  assert.equal(abortCalls, 1)
  assert.equal(writes.length, 1)
  assert.equal(writes[0]?.key, 'pqg:m08:stop-epoch')
  assert.equal(typeof writes[0]?.value, 'string')
  assert.ok(String(writes[0]?.value).length > 0)
  assert.equal(body.ok, true)
  assert.deepEqual(body.cancellation, { published: true })
})
