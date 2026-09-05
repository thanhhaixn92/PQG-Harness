import assert from 'node:assert/strict'
import test from 'node:test'
import * as sidecarModule from '../agents/_dsh-web-sidecar.ts'
import { M08_STOP_EPOCH_KEY } from '../agents/_sandbox-abort.ts'

const sidecarApi = sidecarModule as typeof sidecarModule & Record<string, any>

function requiredFunction(name: string): (...args: any[]) => any {
  const value = sidecarApi[name]
  assert.equal(typeof value, 'function', `${name} must be exported`)
  return value
}

function context(conversationId: string): any {
  return { conversation_id: conversationId, env: {} }
}

function fakeSidecar(conversationId: string, onClose: () => void): any {
  return {
    conversationId,
    home: `/tmp/${conversationId}`,
    port: 12345,
    child: {},
    gateway: { close: async () => {} },
    mcp: { close: async () => {} },
    lastUsedAt: Date.now(),
    context: context(conversationId),
    async close() { onClose() },
  }
}

test('WP3 lifecycle API exposes acquire lease and starter seam', () => {
  requiredFunction('acquireDshWebSidecar')
  requiredFunction('__setSidecarStarterForTests')
})

test('two concurrent acquires share one startup and leases release safely', async () => {
  const acquire = requiredFunction('acquireDshWebSidecar')
  const setStarter = requiredFunction('__setSidecarStarterForTests')
  let starts = 0
  let closeCalls = 0
  let releaseStart!: () => void
  const startGate = new Promise<void>(resolve => { releaseStart = resolve })

  setStarter(async (_ctx: any, conversationId: string) => {
    starts += 1
    await startGate
    return fakeSidecar(conversationId, () => { closeCalls += 1 })
  })

  try {
    const firstPending = acquire(context('conv-shared'))
    const secondPending = acquire(context('conv-shared'))
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(starts, 1)

    releaseStart()
    const [first, second] = await Promise.all([firstPending, secondPending])
    assert.equal(first.sidecar, second.sidecar)

    first.release()
    first.release()
    second.release()
    assert.equal(closeCalls, 0)
  } finally {
    setStarter(undefined)
  }
})

test('stop marks a starting conversation as stopping and blocks replacement acquire', async () => {
  const acquire = requiredFunction('acquireDshWebSidecar')
  const stop = requiredFunction('stopDshWebSidecar')
  const setStarter = requiredFunction('__setSidecarStarterForTests')
  let closeCalls = 0
  let releaseStart!: () => void
  const startGate = new Promise<void>(resolve => { releaseStart = resolve })

  setStarter(async (_ctx: any, conversationId: string) => {
    await startGate
    return fakeSidecar(conversationId, () => { closeCalls += 1 })
  })

  try {
    const firstAcquire = acquire(context('conv-stopping')).catch((error: unknown) => error)
    await new Promise(resolve => setTimeout(resolve, 0))

    const stopping = stop('conv-stopping')
    await assert.rejects(
      () => acquire(context('conv-stopping')),
      /SIDE_CAR_STOPPING/,
    )

    releaseStart()
    await firstAcquire
    const result = await stopping
    assert.equal(result.found, true)
    assert.equal(closeCalls, 1)
  } finally {
    setStarter(undefined)
  }
})

test('concurrent stop calls do not clean the same sidecar twice', async () => {
  const acquire = requiredFunction('acquireDshWebSidecar')
  const stop = requiredFunction('stopDshWebSidecar')
  const setStarter = requiredFunction('__setSidecarStarterForTests')
  let closeCalls = 0

  setStarter(async (_ctx: any, conversationId: string) =>
    fakeSidecar(conversationId, () => { closeCalls += 1 }))

  try {
    const lease = await acquire(context('conv-close-once'))
    lease.release()
    const [first, second] = await Promise.all([
      stop('conv-close-once'),
      stop('conv-close-once'),
    ])
    assert.equal(first.found || second.found, true)
    assert.equal(closeCalls, 1)
  } finally {
    setStarter(undefined)
  }
})

test('startup retries are bounded to three attempts', async () => {
  const acquire = requiredFunction('acquireDshWebSidecar')
  const setStarter = requiredFunction('__setSidecarStarterForTests')
  let starts = 0

  setStarter(async () => {
    starts += 1
    throw new Error('synthetic startup failure')
  })

  try {
    await assert.rejects(
      () => acquire(context('conv-retry')),
      /synthetic startup failure/,
    )
    assert.equal(starts, 3)
  } finally {
    setStarter(undefined)
  }
})

test('an active lease prevents idle reap until the lease is released', async () => {
  const acquire = requiredFunction('acquireDshWebSidecar')
  const stop = requiredFunction('stopDshWebSidecar')
  const setStarter = requiredFunction('__setSidecarStarterForTests')
  const originalNow = Date.now
  let now = 1_000
  let activeCloseCalls = 0

  ;(Date as any).now = () => now
  setStarter(async (_ctx: any, conversationId: string) =>
    fakeSidecar(conversationId, () => {
      if (conversationId === 'conv-active-lease') activeCloseCalls += 1
    }))

  try {
    const active = await acquire(context('conv-active-lease'))
    now += 26 * 60_000
    const trigger = await acquire(context('conv-sweep-trigger'))
    trigger.release()
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(activeCloseCalls, 0)

    active.release()
    now += 26 * 60_000
    const secondTrigger = await acquire(context('conv-sweep-trigger-2'))
    secondTrigger.release()
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(activeCloseCalls, 1)

    await Promise.all([
      stop('conv-sweep-trigger'),
      stop('conv-sweep-trigger-2'),
    ])
  } finally {
    ;(Date as any).now = originalNow
    setStarter(undefined)
  }
})

test('later acquire refreshes the sidecar to the latest Makers context', async () => {
  const acquire = requiredFunction('acquireDshWebSidecar')
  const stop = requiredFunction('stopDshWebSidecar')
  const setStarter = requiredFunction('__setSidecarStarterForTests')
  let starts = 0

  setStarter(async (_ctx: any, conversationId: string) => {
    starts += 1
    return fakeSidecar(conversationId, () => {})
  })

  const contextA = { conversation_id: 'conv-context-refresh', env: { marker: 'A' } }
  const contextB = { conversation_id: 'conv-context-refresh', env: { marker: 'B' } }

  try {
    const first = await acquire(contextA)
    assert.equal(first.sidecar.context, contextA)
    first.release()

    const second = await acquire(contextB)
    assert.equal(second.sidecar, first.sidecar)
    assert.equal(second.sidecar.context, contextB)
    assert.equal(starts, 1)
    second.release()
    await stop('conv-context-refresh')
  } finally {
    setStarter(undefined)
  }
})

test('later acquire retires a stale sidecar after a cross-process Stop epoch change', async () => {
  const acquire = requiredFunction('acquireDshWebSidecar')
  const stop = requiredFunction('stopDshWebSidecar')
  const setStarter = requiredFunction('__setSidecarStarterForTests')
  let epoch = 'before-stop'
  let starts = 0
  let closeCalls = 0

  const makersContext = {
    conversation_id: 'conv-post-stop-refresh',
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

  setStarter(async (ctx: any, conversationId: string) => {
    starts += 1
    const sidecar = fakeSidecar(conversationId, () => { closeCalls += 1 })
    sidecar.context = ctx
    sidecar.mcp.stopEpochBaseline = Object.freeze({
      value: await ctx.store.state.get(M08_STOP_EPOCH_KEY),
    })
    return sidecar
  })

  try {
    const first = await acquire(makersContext)
    assert.deepEqual(first.sidecar.mcp.stopEpochBaseline, { value: 'before-stop' })
    first.release()

    // Simulate Stop being published by another runtime process. The local
    // sidecar registry is untouched, but the shared conversation epoch moves.
    epoch = 'after-stop'

    const second = await acquire(makersContext)
    assert.notEqual(second.sidecar, first.sidecar, 'a post-Stop request must not reuse the stale bridge')
    assert.equal(starts, 2)
    assert.equal(closeCalls, 1, 'the stale DSH/MCP process must be retired before reuse')
    assert.deepEqual(second.sidecar.mcp.stopEpochBaseline, { value: 'after-stop' })
    second.release()
    await stop('conv-post-stop-refresh')
  } finally {
    setStarter(undefined)
  }
})
