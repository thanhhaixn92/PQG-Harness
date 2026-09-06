import type { PqgModuleDefinition } from '../config/modules.mjs'

export const MODULE_POLICY_CONVERSATION_ID = 'pqg-internal-module-policy-v1'
const MODULE_POLICY_METADATA_KEY = 'pqgModulePolicy'
const MODULE_OVERRIDE_PREFIX = 'pqgModuleEnabled:'

export interface PqgModulePolicy {
  version: 1
  enabled: Record<string, boolean>
}

const EMPTY_POLICY: PqgModulePolicy = { version: 1, enabled: {} }

function moduleOverrideKey(moduleId: string): string {
  return `${MODULE_OVERRIDE_PREFIX}${moduleId}`
}

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
    try {
      return await context.store.getConversation(MODULE_POLICY_CONVERSATION_ID)
    } catch {
      throw firstError
    }
  }
}

function parsePolicy(value: unknown): PqgModulePolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('PQG module policy is corrupt')
  }
  const record = value as Record<string, unknown>
  if (record.version !== 1 || !record.enabled || typeof record.enabled !== 'object' || Array.isArray(record.enabled)) {
    throw new Error('PQG module policy is corrupt')
  }
  const enabled: Record<string, boolean> = {}
  for (const [id, state] of Object.entries(record.enabled as Record<string, unknown>)) {
    if (typeof state !== 'boolean') throw new Error('PQG module policy is corrupt')
    enabled[id] = state
  }
  return { version: 1, enabled }
}

export async function readModulePolicy(context: any): Promise<PqgModulePolicy> {
  if (!context?.store) return EMPTY_POLICY
  try {
    const conversation = await getConversation(context)
    const metadata = conversation?.metadata
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return EMPTY_POLICY

    const enabled: Record<string, boolean> = {}
    if (Object.prototype.hasOwnProperty.call(metadata, MODULE_POLICY_METADATA_KEY)) {
      Object.assign(enabled, parsePolicy(metadata[MODULE_POLICY_METADATA_KEY]).enabled)
    }
    for (const [key, state] of Object.entries(metadata as Record<string, unknown>)) {
      if (!key.startsWith(MODULE_OVERRIDE_PREFIX)) continue
      if (typeof state !== 'boolean') throw new Error('PQG module policy is corrupt')
      enabled[key.slice(MODULE_OVERRIDE_PREFIX.length)] = state
    }
    return { version: 1, enabled }
  } catch (error) {
    if (isMissingConversation(error)) return EMPTY_POLICY
    throw error
  }
}

async function writeModuleOverride(context: any, moduleId: string, enabled: boolean): Promise<any> {
  if (!context?.store) throw new Error('PQG module policy store is unavailable')
  try {
    await getConversation(context)
  } catch (error) {
    if (!isMissingConversation(error)) throw error
    const payload = {
      conversationId: MODULE_POLICY_CONVERSATION_ID,
      role: 'system' as const,
      content: 'pqg-module-policy',
      metadata: { kind: 'pqg-module-policy-bootstrap' },
    }
    try {
      await context.store.appendMessage(payload)
    } catch (firstError) {
      try {
        await context.store.appendMessage(MODULE_POLICY_CONVERSATION_ID, payload)
      } catch {
        throw firstError
      }
    }
  }

  const metadata = { [moduleOverrideKey(moduleId)]: enabled }
  try {
    return await context.store.updateConversation({ conversationId: MODULE_POLICY_CONVERSATION_ID, metadata })
  } catch (firstError) {
    try {
      return await context.store.updateConversation(MODULE_POLICY_CONVERSATION_ID, { metadata })
    } catch {
      throw firstError
    }
  }
}

export async function setModuleEnabled(
  context: any,
  moduleId: string,
  enabled: boolean,
): Promise<PqgModulePolicy> {
  const id = moduleId.trim()
  if (!id) throw new Error('moduleId is required')
  const updated = await writeModuleOverride(context, id, enabled)
  const metadata = updated?.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { version: 1, enabled: { [id]: enabled } }
  }

  const states: Record<string, boolean> = {}
  if (Object.prototype.hasOwnProperty.call(metadata, MODULE_POLICY_METADATA_KEY)) {
    Object.assign(states, parsePolicy(metadata[MODULE_POLICY_METADATA_KEY]).enabled)
  }
  for (const [key, state] of Object.entries(metadata as Record<string, unknown>)) {
    if (!key.startsWith(MODULE_OVERRIDE_PREFIX)) continue
    if (typeof state !== 'boolean') throw new Error('PQG module policy is corrupt')
    states[key.slice(MODULE_OVERRIDE_PREFIX.length)] = state
  }
  states[id] = enabled
  return { version: 1, enabled: states }
}

export function effectiveModuleEnabled(module: PqgModuleDefinition, policy: PqgModulePolicy): boolean {
  return policy.enabled[module.id] ?? module.defaultEnabled
}
