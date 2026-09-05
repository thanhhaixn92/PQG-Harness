import assert from 'node:assert/strict'
import test from 'node:test'
import { onRequestPost as stopRequest } from '../agents/stop.ts'
import {
  M08_STOP_EPOCH_KEY,
  withRunnerOwnedSandboxCancellation,
} from '../agents/_sandbox-abort.ts'

const M08_STOP_EPOCH_METADATA_KEY = 'pqgM08StopEpoch'

test('missing Stop epoch is canonical across undefined fallback and runtime null', async () => {
  let killCalls = 0
  let runCalls = 0
  const context = {
    store: {
      state: {
        async get(key: string) {
          assert.equal(key, M08_STOP_EPOCH_KEY)
          return null
        },
      },
    },
    sandbox: {
      async kill() { killCalls += 1 },
      commands: {
        async run() {
          runCalls += 1
          return { stdout: 'ok', stderr: '', exitCode: 0 }
        },
      },
    },
  }

  const wrapped = withRunnerOwnedSandboxCancellation(context, {
    useRequestSignal: false,
    requireSharedStop: true,
    sharedStopBaseline: Object.freeze({ value: undefined }),
  })

  const result = await wrapped.sandbox.commands.run('printf ok')
  assert.equal(result.stdout, 'ok')
  assert.equal(runCalls, 1)
  assert.equal(killCalls, 0)
})

test('/stop publishes a cross-process fence without makers-conversation-id header scope', async () => {
  const conversationId = 'conv-stop-body-scope'
  let metadataWrite: any
  let stateWrites = 0
  const context = {
    conversation_id: '',
    request: { body: { conversation_id: conversationId } },
    store: {
      state: {
        async set() { stateWrites += 1 },
      },
      async updateConversation(input: any) {
        metadataWrite = input
      },
    },
    utils: {
      async abortActiveRun(id: string) {
        assert.equal(id, conversationId)
        return { aborted: true }
      },
    },
  }

  const response = await stopRequest(context)
  const body = await response.json() as any
  assert.equal(body.cancellation.published, true)
  assert.equal(body.ok, true)
  assert.equal(stateWrites, 0, 'an unscoped /stop request must not write conversation-scoped state')
  assert.equal(metadataWrite?.conversationId, conversationId)
  assert.equal(typeof metadataWrite?.metadata?.[M08_STOP_EPOCH_METADATA_KEY], 'string')
})

test('/stop fails closed when the authoritative explicit fence cannot be written', async () => {
  const conversationId = 'conv-authoritative-outage'
  let stateWrites = 0
  const context = {
    conversation_id: conversationId,
    request: { body: { conversation_id: conversationId } },
    store: {
      state: {
        async set() { stateWrites += 1 },
      },
      async updateConversation() {
        throw new Error('metadata backend unavailable')
      },
    },
    utils: {
      async abortActiveRun() { return { aborted: true } },
    },
  }

  const response = await stopRequest(context)
  const body = await response.json() as any
  assert.equal(stateWrites, 1, 'scoped state remains a low-latency best-effort path')
  assert.equal(body.cancellation.published, false)
  assert.equal(body.cancellation.error, 'CANCELLATION_STATE_UNAVAILABLE')
  assert.equal(body.ok, false)
})

test('checkpoint persist rechecks the command Stop fence at the actual persistence boundary', async () => {
  let epoch: string | null = 'before-stop'
  let persistCalls = 0
  const context = {
    store: {
      state: {
        async get(key: string) {
          assert.equal(key, M08_STOP_EPOCH_KEY)
          return epoch
        },
      },
    },
    sandbox: {
      async kill() {},
      commands: {
        async run() {
          return { stdout: 'done', stderr: '', exitCode: 0 }
        },
      },
      async persist() {
        persistCalls += 1
        return { checkpointId: 'should-not-persist' }
      },
    },
  }

  const wrapped = withRunnerOwnedSandboxCancellation(context, {
    useRequestSignal: false,
    requireSharedStop: true,
    sharedStopBaseline: Object.freeze({ value: 'before-stop' }),
  })

  await wrapped.sandbox.commands.run('true')
  epoch = 'after-stop'

  await assert.rejects(
    () => wrapped.sandbox.persist(),
    /WORKSPACE_COMMAND_ABORTED/,
  )
  assert.equal(persistCalls, 0)
})
