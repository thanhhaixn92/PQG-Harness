import assert from 'node:assert/strict'
import test from 'node:test'
import type { PqgModuleDefinition } from '../config/modules.mjs'

const policyModule = new URL('../agents/_module-policy.ts', import.meta.url)

function fakeContext() {
  const conversations = new Map<string, { metadata: Record<string, unknown> }>()
  return {
    conversations,
    context: {
      store: {
        async getConversation({ conversationId }: { conversationId: string }) {
          const conversation = conversations.get(conversationId)
          if (conversation) return conversation
          const error = new Error('Conversation not found') as Error & { code?: string }
          error.code = 'MemoryNotFoundError'
          throw error
        },
        async appendMessage({ conversationId }: { conversationId: string }) {
          conversations.set(conversationId, { metadata: {} })
        },
        async updateConversation({ conversationId, metadata }: { conversationId: string; metadata: Record<string, unknown> }) {
          const current = conversations.get(conversationId)
          conversations.set(conversationId, {
            metadata: { ...current?.metadata, ...metadata },
          })
        },
      },
    },
  }
}

test('module policy defaults to package metadata and persists explicit overrides', async () => {
  const {
    MODULE_POLICY_CONVERSATION_ID,
    effectiveModuleEnabled,
    readModulePolicy,
    setModuleEnabled,
  } = await import(policyModule.href)
  const { context } = fakeContext()
  const task: PqgModuleDefinition = {
    id: 'task',
    label: 'Công việc',
    packageName: '@pqg/plugin-task',
    defaultEnabled: true,
    client: true,
    makers: true,
  }

  const initial = await readModulePolicy(context)
  assert.deepEqual(initial, { version: 1, enabled: {} })
  assert.equal(effectiveModuleEnabled(task, initial), true)

  await setModuleEnabled(context, 'task', false)
  const stored = await readModulePolicy(context)
  assert.equal(effectiveModuleEnabled(task, stored), false)
  assert.deepEqual(stored, { version: 1, enabled: { task: false } })
  assert.equal(MODULE_POLICY_CONVERSATION_ID, 'pqg-internal-module-policy-v1')
})

test('concurrent writes for different modules preserve both overrides', async () => {
  const {
    MODULE_POLICY_CONVERSATION_ID,
    readModulePolicy,
    setModuleEnabled,
  } = await import(policyModule.href)
  const { context, conversations } = fakeContext()
  conversations.set(MODULE_POLICY_CONVERSATION_ID, { metadata: {} })

  await Promise.all([
    setModuleEnabled(context, 'task', false),
    setModuleEnabled(context, 'reference', true),
  ])

  assert.deepEqual(await readModulePolicy(context), {
    version: 1,
    enabled: { task: false, reference: true },
  })
})

test('reads legacy pqgModulePolicy metadata', async () => {
  const { MODULE_POLICY_CONVERSATION_ID, readModulePolicy } = await import(policyModule.href)
  const { context, conversations } = fakeContext()
  conversations.set(MODULE_POLICY_CONVERSATION_ID, {
    metadata: { pqgModulePolicy: { version: 1, enabled: { task: true } } },
  })

  assert.deepEqual(await readModulePolicy(context), {
    version: 1,
    enabled: { task: true },
  })
})

test('per-module metadata override wins over legacy policy', async () => {
  const { MODULE_POLICY_CONVERSATION_ID, readModulePolicy } = await import(policyModule.href)
  const { context, conversations } = fakeContext()
  conversations.set(MODULE_POLICY_CONVERSATION_ID, {
    metadata: {
      pqgModulePolicy: { version: 1, enabled: { task: true } },
      'pqgModuleEnabled:task': false,
    },
  })

  assert.deepEqual(await readModulePolicy(context), {
    version: 1,
    enabled: { task: false },
  })
})

test('rejects unsupported legacy policy versions', async () => {
  const { MODULE_POLICY_CONVERSATION_ID, readModulePolicy } = await import(policyModule.href)
  const { context, conversations } = fakeContext()
  conversations.set(MODULE_POLICY_CONVERSATION_ID, {
    metadata: { pqgModulePolicy: { version: 99, enabled: { task: true } } },
  })

  await assert.rejects(readModulePolicy(context), /module policy/i)
})

test('rejects non-boolean per-module metadata overrides', async () => {
  const { MODULE_POLICY_CONVERSATION_ID, readModulePolicy } = await import(policyModule.href)
  const { context, conversations } = fakeContext()
  conversations.set(MODULE_POLICY_CONVERSATION_ID, {
    metadata: { 'pqgModuleEnabled:task': 'false' },
  })

  await assert.rejects(readModulePolicy(context), /module policy/i)
})

test('setModuleEnabled returns the persisted override without a post-write read', async () => {
  const { MODULE_POLICY_CONVERSATION_ID, setModuleEnabled } = await import(policyModule.href)
  let reads = 0
  const context = {
    store: {
      async getConversation() {
        reads += 1
        if (reads === 1) return { metadata: {} }
        throw new Error('transient post-write read failure')
      },
      async updateConversation({ metadata }: { metadata: Record<string, unknown> }) {
        return {
          conversationId: MODULE_POLICY_CONVERSATION_ID,
          metadata,
        }
      },
    },
  }

  assert.deepEqual(await setModuleEnabled(context, 'task', false), {
    version: 1,
    enabled: { task: false },
  })
  assert.equal(reads, 1)
})
