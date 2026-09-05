import assert from 'node:assert/strict'
import test from 'node:test'
import * as sidecarModule from '../agents/_dsh-web-sidecar.ts'
import { M08_STOP_EPOCH_KEY, M08_STOP_EPOCH_METADATA_KEY } from '../agents/_sandbox-abort.ts'

const sidecarApi = sidecarModule as typeof sidecarModule & Record<string, any>

function requiredFunction(name: string): (...args: any[]) => any {
  const value = sidecarApi[name]
  assert.equal(typeof value, 'function', `${name} must be exported`)
  return value
}

function fakeSidecar(conversationId: string): any {
  return {
    conversationId,
    home: `/tmp/${conversationId}`,
    port: 12345,
    child: {},
    gateway: { close: async () => {} },
    mcp: { close: async () => {} },
    lastUsedAt: Date.now(),
    context: { conversation_id: conversationId, env: {} },
    async close() {},
  }
}

test('first sidecar admission cannot adopt a Stop already visible on the scoped fast fence', async () => {
  const acquire = requiredFunction('acquireDshWebSidecar')
  const stop = requiredFunction('stopDshWebSidecar')
  const setStarter = requiredFunction('__setSidecarStarterForTests')
  const conversationId = 'conv-round5-fast-fence-admission'
  let stateEpoch: string | null = null
  let starts = 0
  let releaseStateRead!: () => void
  let signalStateReadStarted!: () => void
  let stateReads = 0
  const stateReadGate = new Promise<void>(resolve => { releaseStateRead = resolve })
  const stateReadStarted = new Promise<void>(resolve => { signalStateReadStarted = resolve })

  const context = {
    conversation_id: conversationId,
    env: {},
    store: {
      async getConversation() {
        return { metadata: { [M08_STOP_EPOCH_METADATA_KEY]: 'before-stop' } }
      },
      state: {
        async get(key: string) {
          assert.equal(key, M08_STOP_EPOCH_KEY)
          stateReads += 1
          if (stateReads === 1) {
            signalStateReadStarted()
            await stateReadGate
          }
          return stateEpoch
        },
      },
    },
  }

  setStarter(async (_ctx: any, id: string) => {
    starts += 1
    return fakeSidecar(id)
  })

  try {
    const acquiring = acquire(context).catch((error: unknown) => error)
    await stateReadStarted
    stateEpoch = `stop:${Date.now()}:fast-fence`
    releaseStateRead()

    const result = await acquiring
    if (!(result instanceof Error)) result.release()

    assert.ok(result instanceof Error)
    assert.match(String(result), /SIDE_CAR_STOPPING/)
    assert.equal(starts, 0, 'a pre-Stop first acquire must not adopt the post-Stop scoped-state fence')
  } finally {
    releaseStateRead()
    await stop(conversationId).catch(() => {})
    setStarter(undefined)
  }
})
