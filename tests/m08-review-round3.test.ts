import assert from 'node:assert/strict'
import test from 'node:test'
import * as sidecarModule from '../agents/_dsh-web-sidecar.ts'
import { startLocalMcpBridge } from '../agents/_mcp-bridge.ts'
import { M08_STOP_EPOCH_KEY } from '../agents/_sandbox-abort.ts'

const sidecarApi = sidecarModule as typeof sidecarModule & Record<string, any>

function requiredFunction(name: string): (...args: any[]) => any {
  const value = sidecarApi[name]
  assert.equal(typeof value, 'function', `${name} must be exported`)
  return value
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

function stateContext(conversationId: string, readEpoch: () => unknown): any {
  return {
    conversation_id: conversationId,
    env: {},
    store: {
      state: {
        async get(key: string) {
          assert.equal(key, M08_STOP_EPOCH_KEY)
          return readEpoch()
        },
      },
    },
  }
}

test('first state-capable acquire retires a sidecar created before shared state was injected', async () => {
  const acquire = requiredFunction('acquireDshWebSidecar')
  const stop = requiredFunction('stopDshWebSidecar')
  const setStarter = requiredFunction('__setSidecarStarterForTests')
  const conversationId = 'conv-round3-untracked'
  let starts = 0
  let closeCalls = 0

  setStarter(async (_ctx: any, id: string) => {
    starts += 1
    return fakeSidecar(id, () => { closeCalls += 1 })
  })

  try {
    const first = await acquire({ conversation_id: conversationId, env: {} })
    first.release()

    const second = await acquire(stateContext(conversationId, () => 'after-stop'))
    assert.notEqual(second.sidecar, first.sidecar)
    assert.equal(starts, 2)
    assert.equal(closeCalls, 1)
    second.release()
    await stop(conversationId)
  } finally {
    setStarter(undefined)
  }
})

test('concurrent post-Stop acquires join one stale-sidecar retirement and share its replacement', async () => {
  const acquire = requiredFunction('acquireDshWebSidecar')
  const stop = requiredFunction('stopDshWebSidecar')
  const setStarter = requiredFunction('__setSidecarStarterForTests')
  const conversationId = 'conv-round3-retire-join'
  let epoch = 'before-stop'
  let starts = 0
  let closeCalls = 0
  let releaseClose!: () => void
  let signalCloseStarted!: () => void
  const closeGate = new Promise<void>(resolve => { releaseClose = resolve })
  const closeStarted = new Promise<void>(resolve => { signalCloseStarted = resolve })

  setStarter(async (_ctx: any, id: string) => {
    starts += 1
    const generation = starts
    return fakeSidecar(id, async () => {
      closeCalls += 1
      if (generation === 1) {
        signalCloseStarted()
        await closeGate
      }
    })
  })

  const makersContext = stateContext(conversationId, () => epoch)

  try {
    const initial = await acquire(makersContext)
    initial.release()
    epoch = 'after-stop'

    const firstReplacement = acquire(makersContext)
    await closeStarted
    const secondReplacement = acquire(makersContext)
    releaseClose()

    const [first, second] = await Promise.all([firstReplacement, secondReplacement])
    assert.equal(first.sidecar, second.sidecar)
    assert.notEqual(first.sidecar, initial.sidecar)
    assert.equal(starts, 2)
    assert.equal(closeCalls, 1)
    first.release()
    second.release()
    await stop(conversationId)
  } finally {
    releaseClose()
    setStarter(undefined)
  }
})

test('Stop reports a successful close when the epoch changes during sidecar startup', async () => {
  const acquire = requiredFunction('acquireDshWebSidecar')
  const stop = requiredFunction('stopDshWebSidecar')
  const setStarter = requiredFunction('__setSidecarStarterForTests')
  const conversationId = 'conv-round3-stop-during-start'
  let epoch = 'before-stop'
  let closeCalls = 0
  let releaseStarter!: () => void
  let signalStarterEntered!: () => void
  const starterGate = new Promise<void>(resolve => { releaseStarter = resolve })
  const starterEntered = new Promise<void>(resolve => { signalStarterEntered = resolve })
  const makersContext = stateContext(conversationId, () => epoch)

  setStarter(async (_ctx: any, id: string) => {
    signalStarterEntered()
    await starterGate
    return fakeSidecar(id, () => { closeCalls += 1 })
  })

  try {
    const acquiring = acquire(makersContext).catch((error: unknown) => error)
    await starterEntered
    epoch = 'after-stop'
    const stopping = stop(conversationId)
    releaseStarter()

    const [acquireResult, stopResult] = await Promise.all([acquiring, stopping])
    assert.match(String(acquireResult), /SIDE_CAR_STOPPED_DURING_START/)
    assert.deepEqual(stopResult, { found: true, closed: true })
    assert.equal(closeCalls, 1)
  } finally {
    releaseStarter()
    setStarter(undefined)
  }
})

test('MCP bridge accepts the sidecar-captured Stop fence without a second startup state read', async () => {
  let stateReads = 0
  const context = {
    store: {
      state: {
        async get(key: string) {
          assert.equal(key, M08_STOP_EPOCH_KEY)
          stateReads += 1
          throw new Error('synthetic transient state read failure')
        },
      },
    },
  }

  const bridge = await (startLocalMcpBridge as any)(
    () => context,
    'conv-round3-shared-fence',
    Object.freeze({ value: 'stable-epoch' }),
  )
  try {
    assert.equal(stateReads, 0, 'the bridge must use the sidecar-owned fence instead of recapturing it')
  } finally {
    await bridge.close()
  }
})
