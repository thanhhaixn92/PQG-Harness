import assert from 'node:assert/strict'
import test from 'node:test'
import { registerActiveWorkspaceSandbox } from '../agents/_active-sandbox.ts'
import {
  __setSidecarStarterForTests,
  acquireDshWebSidecar,
  stopDshWebSidecar,
} from '../agents/_dsh-web-sidecar.ts'
import { onRequestPost } from '../agents/stop.ts'

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

test('platform abort and sandbox kill start even while sidecar shutdown is waiting for startup', async () => {
  let releaseStart!: () => void
  const startGate = new Promise<void>(resolve => { releaseStart = resolve })
  let abortCalls = 0
  let killCalls = 0
  let closeCalls = 0

  __setSidecarStarterForTests(async (_context: any, conversationId: string) => {
    await startGate
    return fakeSidecar(conversationId, async () => { closeCalls += 1 })
  })

  const firstAcquire = acquireDshWebSidecar({ conversation_id: 'conv-stop-order' })
    .catch((error: unknown) => error)
  await new Promise(resolve => setTimeout(resolve, 0))

  const responsePending = onRequestPost({
    request: { body: { conversation_id: 'conv-stop-order' } },
    utils: {
      async abortActiveRun(conversationId: string) {
        assert.equal(conversationId, 'conv-stop-order')
        abortCalls += 1
        return { aborted: true }
      },
    },
    sandbox: {
      async kill() {
        killCalls += 1
      },
    },
  })

  try {
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(abortCalls, 1, 'platform abort must start without waiting for sidecar close')
    assert.equal(killCalls, 1, 'sandbox kill must start without waiting for sidecar close')
  } finally {
    releaseStart()
  }

  await firstAcquire
  const response = await responsePending
  const body = await response.json() as any
  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.deepEqual(body.sidecar, { found: true, closed: true })
  assert.deepEqual(body.platform, { aborted: true })
  assert.deepEqual(body.sandbox, { killed: true })
  assert.equal(closeCalls, 1)
  __setSidecarStarterForTests(undefined)
})

test('Stop kills the sandbox registered by an active workspace command instead of a different request sandbox', async () => {
  let activeSandboxKills = 0
  let stopRequestSandboxKills = 0
  const releaseActiveSandbox = registerActiveWorkspaceSandbox('conv-stop-active-sandbox', {
    async kill() {
      activeSandboxKills += 1
    },
  })

  try {
    const response = await onRequestPost({
      request: { body: { conversation_id: 'conv-stop-active-sandbox' } },
      utils: {
        async abortActiveRun() {
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

    assert.equal(body.ok, true)
    assert.deepEqual(body.sandbox, { killed: true })
    assert.equal(activeSandboxKills, 1, 'the in-flight workspace command sandbox must be terminated')
    assert.equal(stopRequestSandboxKills, 0, 'a different Stop request sandbox must not be mistaken for the active command sandbox')
  } finally {
    releaseActiveSandbox()
  }
})

test('Stop returns stable non-secret outcomes when sidecar, platform abort, and sandbox kill fail', async () => {
  __setSidecarStarterForTests(async (_context: any, conversationId: string) =>
    fakeSidecar(conversationId, async () => {
      throw new Error('sensitive sidecar close detail')
    }))

  const lease = await acquireDshWebSidecar({ conversation_id: 'conv-stop-errors' })
  lease.release()

  try {
    const response = await onRequestPost({
      request: { body: { conversation_id: 'conv-stop-errors' } },
      utils: {
        async abortActiveRun() {
          throw new Error('sensitive platform abort detail')
        },
      },
      sandbox: {
        async kill() {
          throw new Error('sensitive sandbox kill detail')
        },
      },
    })
    const body = await response.json() as any
    const serialized = JSON.stringify(body)

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
    assert.deepEqual(body.sandbox, {
      killed: false,
      error: 'SANDBOX_KILL_FAILED',
    })
    assert.equal(serialized.includes('sensitive sidecar close detail'), false)
    assert.equal(serialized.includes('sensitive platform abort detail'), false)
    assert.equal(serialized.includes('sensitive sandbox kill detail'), false)
  } finally {
    __setSidecarStarterForTests(undefined)
    await stopDshWebSidecar('conv-stop-errors')
  }
})

test('Stop fails closed when sandbox kill is unavailable', async () => {
  const response = await onRequestPost({
    request: { body: { conversation_id: 'conv-stop-no-kill' } },
    utils: {
      async abortActiveRun() {
        return { aborted: true }
      },
    },
  })
  const body = await response.json() as any

  assert.equal(response.status, 200)
  assert.equal(body.ok, false)
  assert.deepEqual(body.sandbox, {
    killed: false,
    error: 'SANDBOX_KILL_UNAVAILABLE',
  })
})