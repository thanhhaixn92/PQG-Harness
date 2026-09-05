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
          conversations.set(conversationId, { metadata })
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

test('invalid stored module policy fails closed to package defaults', async () => {
  const { MODULE_POLICY_CONVERSATION_ID, readModulePolicy } = await import(policyModule.href)
  const { context, conversations } = fakeContext()
  conversations.set(MODULE_POLICY_CONVERSATION_ID, {
    metadata: { pqgModulePolicy: { version: 99, enabled: { task: true } } },
  })

  assert.deepEqual(await readModulePolicy(context), { version: 1, enabled: {} })
})
