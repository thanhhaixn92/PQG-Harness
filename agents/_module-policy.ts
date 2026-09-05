import type { PqgModuleDefinition } from '../config/modules.mjs'

export const MODULE_POLICY_CONVERSATION_ID = 'pqg-internal-module-policy-v1'
const MODULE_POLICY_METADATA_KEY = 'pqgModulePolicy'

export interface PqgModulePolicy {
  version: 1
  enabled: Record<string, boolean>
}

const EMPTY_POLICY: PqgModulePolicy = { version: 1, enabled: {} }

function isMissingConversation(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : ''
  const message = error instanceof Error ? error.message : String(error)
  return code === 'MemoryNotFoundError' || /Conversation not found/i.test(message)
}

async function getConversation(context: any): Promise<any> {
  try {
    return await context.store.getConversation({ conversationId: MODULE_POLICY_CONVERSATION_ID })
  } catch (firstError) {
    try { return await context.store.getConversation(MODULE_POLICY_CONVERSATION_ID) } catch { throw firstError }
  }
}

function parsePolicy(value: unknown): PqgModulePolicy {
  if (!value || typeof value !== 'object') return EMPTY_POLICY
  const record = value as Record<string, unknown>
  if (record.version !== 1 || !record.enabled || typeof record.enabled !== 'object' || Array.isArray(record.enabled)) {
    return EMPTY_POLICY
  }
  const enabled: Record<string, boolean> = {}
  for (const [id, state] of Object.entries(record.enabled as Record<string, unknown>)) {
    if (typeof state === 'boolean') enabled[id] = state
  }
  return { version: 1, enabled }
}

export async function readModulePolicy(context: any): Promise<PqgModulePolicy> {
  if (!context?.store) return EMPTY_POLICY
  try {
    const conversation = await getConversation(context)
    return parsePolicy(conversation?.metadata?.[MODULE_POLICY_METADATA_KEY])
  } catch (error) {
    if (isMissingConversation(error)) return EMPTY_POLICY
    throw error
  }
}

async function writeModulePolicy(context: any, policy: PqgModulePolicy): Promise<void> {
  if (!context?.store) throw new Error('PQG module policy store is unavailable')
  try {
    await getConversation(context)
  } catch (error) {
    if (!isMissingConversation(error)) throw error
    await context.store.appendMessage({
      conversationId: MODULE_POLICY_CONVERSATION_ID,
      role: 'system',
      content: 'pqg-module-policy',
      metadata: { kind: 'pqg-module-policy-bootstrap' },
    })
  }

  const metadata = { [MODULE_POLICY_METADATA_KEY]: policy }
  try {
    await context.store.updateConversation({ conversationId: MODULE_POLICY_CONVERSATION_ID, metadata })
  } catch (firstError) {
    try {
      await context.store.updateConversation(MODULE_POLICY_CONVERSATION_ID, { metadata })
    } catch {
      throw firstError
    }
  }
}

export async function setModuleEnabled(context: any, moduleId: string, enabled: boolean): Promise<PqgModulePolicy> {
  const id = moduleId.trim()
  if (!id) throw new Error('moduleId is required')
  const current = await readModulePolicy(context)
  const next: PqgModulePolicy = {
    version: 1,
    enabled: { ...current.enabled, [id]: enabled },
  }
  await writeModulePolicy(context, next)
  return next
}

export function effectiveModuleEnabled(module: PqgModuleDefinition, policy: PqgModulePolicy): boolean {
  return policy.enabled[module.id] ?? module.defaultEnabled
}
