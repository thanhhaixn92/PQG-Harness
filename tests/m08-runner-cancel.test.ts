import assert from 'node:assert/strict'
import test from 'node:test'
import { runWorkspaceCommand } from '../agents/_workspace.ts'
import { onRequestPost } from '../agents/stop.ts'

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms)
  })
}

function readyFiles() {
  return {
    makeDir: async () => {},
    exists: async () => true,
  }
}

test('runner abort kills its own in-flight sandbox command exactly once', async () => {
  const controller = new AbortController()
  let killCalls = 0
  let runCalls = 0
  let rejectRun: ((error: Error) => void) | undefined

  const sandbox = {
    files: readyFiles(),
    commands: {
      run() {
        runCalls += 1
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
      throw new Error('checkpoint must not run after an aborted command')
    },
  }

  const pending = runWorkspaceCommand({
    sandbox,
    request: { signal: controller.signal },
  }, 'conv-runner-abort', 'sleep 60')

  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(runCalls, 1, 'the foreground command must be in flight before Stop')

  controller.abort()

  await assert.rejects(
    () => Promise.race([
      pending,
      rejectAfter(250, 'runner-owned cancellation did not settle the command'),
    ]),
    error => error instanceof Error
      && error.name === 'AbortError'
      && error.message === 'WORKSPACE_COMMAND_ABORTED',
  )
  assert.equal(killCalls, 1)
})

test('abort wins the command race even when sandbox kill settles slowly', async () => {
  const controller = new AbortController()
  let resolveRun!: (value: { exitCode: number; stdout: string; stderr: string }) => void
  let releaseKill!: () => void
  const killGate = new Promise<void>(resolve => { releaseKill = resolve })
  let persistCalls = 0
  let settled = 'pending'

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
      await killGate
    },
    async persist() {
      persistCalls += 1
      return { size: 1, sha256: 'x', etag: 'x', persistedAt: 'x' }
    },
  }

  const pending = runWorkspaceCommand({
    sandbox,
    request: { signal: controller.signal },
  }, 'conv-abort-race', 'sleep 60')
  pending.then(
    () => { settled = 'resolved' },
    error => { settled = error instanceof Error ? error.name : 'rejected' },
  )

  await new Promise(resolve => setTimeout(resolve, 0))
  controller.abort()
  resolveRun({ exitCode: 0, stdout: 'late-success', stderr: '' })
  await new Promise(resolve => setTimeout(resolve, 0))

  try {
    assert.notEqual(settled, 'resolved', 'an observed abort must beat a later command settlement')
    assert.equal(persistCalls, 0, 'checkpointing must not begin after the runner observed abort')
  } finally {
    releaseKill()
  }

  await assert.rejects(
    () => pending,
    error => error instanceof Error
      && error.name === 'AbortError'
      && error.message === 'WORKSPACE_COMMAND_ABORTED',
  )
  assert.equal(persistCalls, 0)
})

test('pre-aborted runner does not dispatch a sandbox command', async () => {
  const controller = new AbortController()
  controller.abort()
  let killCalls = 0
  let runCalls = 0
  let persistCalls = 0

  const sandbox = {
    files: readyFiles(),
    commands: {
      async run() {
        runCalls += 1
        return { exitCode: 0, stdout: 'should-not-run', stderr: '' }
      },
    },
    async kill() {
      killCalls += 1
    },
    async persist() {
      persistCalls += 1
      return { size: 1, sha256: 'x', etag: 'x', persistedAt: 'x' }
    },
  }

  await assert.rejects(
    () => runWorkspaceCommand({
      sandbox,
      request: { signal: controller.signal },
    }, 'conv-pre-aborted', 'printf should-not-run'),
    error => error instanceof Error
      && error.name === 'AbortError'
      && error.message === 'WORKSPACE_COMMAND_ABORTED',
  )

  assert.equal(runCalls, 0)
  assert.equal(killCalls, 1)
  assert.equal(persistCalls, 0)
})

test('Stop delegates runner cancellation and never kills the Stop-request sandbox', async () => {
  let stopRequestSandboxKills = 0
  let abortCalls = 0

  const response = await onRequestPost({
    request: { body: { conversation_id: 'conv-stop-delegated' } },
    utils: {
      async abortActiveRun(conversationId: string) {
        assert.equal(conversationId, 'conv-stop-delegated')
        abortCalls += 1
        return { aborted: true }
      },
    },
    sandbox: {
      async kill() {
        stopRequestSandboxKills += 1
      },
    },
  })
  const body = await response.json() as any

  assert.equal(response.status, 200)
  assert.equal(abortCalls, 1)
  assert.equal(stopRequestSandboxKills, 0)
  assert.equal(body.ok, true)
  assert.deepEqual(body.platform, { aborted: true })
  assert.deepEqual(body.sandbox, { delegated: true })
})
