import assert from 'node:assert/strict'
import test from 'node:test'
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

function cancellationStore(writes: Array<{ key: string; value: unknown }> = []) {
  return {
    writes,
    store: {
      state: {
        async set(key: string, value: unknown) {
          writes.push({ key, value })
        },
      },
    },
  }
}

test('platform abort and shared cancellation start without waiting for sidecar startup or shutdown', async () => {
  let releaseStart!: () => void
  const startGate = new Promise<void>(resolve => { releaseStart = resolve })
  let abortCalls = 0
  let closeCalls = 0
  const cancellation = cancellationStore()

  __setSidecarStarterForTests(async (_context: any, conversationId: string) => {
    await startGate
    return fakeSidecar(conversationId, async () => { closeCalls += 1 })
  })

  const firstAcquire = acquireDshWebSidecar({ conversation_id: 'conv-stop-order' })
    .catch((error: unknown) => error)
  await new Promise(resolve => setTimeout(resolve, 0))

  const responsePending = onRequestPost({
    conversation_id: 'conv-stop-order',
    run_id: 'run-stop-order',
    store: cancellation.store,
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
        assert.fail('Stop request must never kill its own sandbox')
      },
    },
  })

  try {
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(abortCalls, 1, 'platform abort must start without waiting for sidecar close')
    assert.equal(cancellation.writes.length, 1, 'shared cancellation must publish without waiting for sidecar close')
  } finally {
    releaseStart()
  }

  const acquired = await firstAcquire as any
  acquired?.release?.()
  const response = await responsePending
  const body = await response.json() as any
  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.deepEqual(body.cancellation, { published: true })
  assert.deepEqual(body.sidecar, { found: true, closed: true })
  assert.deepEqual(body.platform, { aborted: true })
  assert.deepEqual(body.sandbox, { delegated: true })
  assert.equal(closeCalls, 1)
  __setSidecarStarterForTests(undefined)
})

test('Stop returns stable non-secret outcomes when sidecar and platform abort fail', async () => {
  __setSidecarStarterForTests(async (_context: any, conversationId: string) =>
    fakeSidecar(conversationId, async () => {
      throw new Error('sensitive sidecar close detail')
    }))

  const lease = await acquireDshWebSidecar({ conversation_id: 'conv-stop-errors' })
  lease.release()
  const cancellation = cancellationStore()

  try {
    const response = await onRequestPost({
      conversation_id: 'conv-stop-errors',
      run_id: 'run-stop-errors',
      store: cancellation.store,
      request: { body: { conversation_id: 'conv-stop-errors' } },
      utils: {
        async abortActiveRun() {
          throw new Error('sensitive platform abort detail')
        },
      },
      sandbox: {
        async kill() {
          assert.fail('Stop request sandbox must not participate in cancellation')
        },
      },
    })
    const body = await response.json() as any
    const serialized = JSON.stringify(body)

    assert.equal(response.status, 200)
    assert.equal(body.ok, false)
    assert.deepEqual(body.cancellation, { published: true })
    assert.deepEqual(body.sidecar, {
      found: true,
      closed: false,
      error: 'SIDE_CAR_CLOSE_FAILED',
    })
    assert.deepEqual(body.platform, {
      aborted: false,
      error: 'PLATFORM_ABORT_FAILED',
    })
    assert.deepEqual(body.sandbox, { delegated: true })
    assert.equal(serialized.includes('sensitive sidecar close detail'), false)
    assert.equal(serialized.includes('sensitive platform abort detail'), false)
  } finally {
    __setSidecarStarterForTests(undefined)
    await stopDshWebSidecar('conv-stop-errors')
  }
})

test('Stop treats an idle target as a successful delegated no-op after publishing shared cancellation', async () => {
  const cancellation = cancellationStore()
  const response = await onRequestPost({
    conversation_id: 'conv-stop-idle-delegated',
    run_id: 'run-stop-idle',
    store: cancellation.store,
    request: { body: { conversation_id: 'conv-stop-idle-delegated' } },
    utils: {
      async abortActiveRun() {
        return { aborted: false }
      },
    },
    sandbox: {
      async kill() {
        assert.fail('Stop request sandbox must not be used as fallback')
      },
    },
  })
  const body = await response.json() as any

  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.deepEqual(body.cancellation, { published: true })
  assert.deepEqual(body.sidecar, { found: false, closed: false })
  assert.deepEqual(body.platform, { aborted: false })
  assert.deepEqual(body.sandbox, { delegated: true })
  assert.equal(cancellation.writes.length, 1)
})
