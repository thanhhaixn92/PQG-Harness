import assert from 'node:assert/strict'
import test from 'node:test'
import * as sidecarModule from '../agents/_dsh-web-sidecar.ts'

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
