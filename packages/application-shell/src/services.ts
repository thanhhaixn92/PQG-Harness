import type { ISessions, PendingInteraction, PendingWait } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ShellApprovalOutcome,
  ShellApprovalRequest,
  ShellNotification,
  ShellSearchMatch,
  ShellSearchProvider,
  ShellSupportContext,
  ShellSupportProvider,
  ShellSystemServices,
} from './contracts.ts'

function removeExact<T>(map: Map<string, T>, id: string, value: T, changed: () => void): void {
  if (map.get(id) !== value) return
  map.delete(id)
  changed()
}

export function createShellSystemServices(sessions: ISessions): ShellSystemServices {
  const searchProviders = new Map<string, ShellSearchProvider>()
  const supportProviders = new Map<string, ShellSupportProvider>()
  const listeners = new Set<() => void>()
  const notificationListeners = new Set<(notification: ShellNotification) => void>()

  const changed = () => {
    for (const listener of listeners) listener()
  }

  const registerSearchProvider = (provider: ShellSearchProvider): (() => void) => {
    if (searchProviders.has(provider.id)) throw new Error(`duplicate PQG search provider: ${provider.id}`)
    searchProviders.set(provider.id, provider)
    changed()
    return () => removeExact(searchProviders, provider.id, provider, changed)
  }

  const registerSupportProvider = (provider: ShellSupportProvider): (() => void) => {
    if (supportProviders.has(provider.id)) throw new Error(`duplicate PQG support provider: ${provider.id}`)
    supportProviders.set(provider.id, provider)
    changed()
    return () => removeExact(supportProviders, provider.id, provider, changed)
  }

  const search = async (query: string): Promise<readonly ShellSearchMatch[]> => {
    const normalized = query.trim()
    if (normalized === '') return []
    const providers = [...searchProviders.values()]
    const settled = await Promise.allSettled(providers.map(provider => provider.search(normalized)))
    const matches: ShellSearchMatch[] = []
    settled.forEach((result, index) => {
      if (result.status !== 'fulfilled') return
      const provider = providers[index]
      if (provider === undefined) return
      for (const item of result.value) {
        matches.push({ ...item, providerId: provider.id, providerLabel: provider.label })
      }
    })
    return matches
  }

  const supportFor = (activeId: string): ShellSupportContext | undefined => {
    for (const provider of supportProviders.values()) {
      try {
        const support = provider.supportFor(activeId)
        if (support !== undefined) return support
      } catch {
        continue
      }
    }
    return undefined
  }

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  const notify = (notification: ShellNotification): void => {
    for (const listener of notificationListeners) listener(notification)
  }

  const subscribeNotifications = (
    listener: (notification: ShellNotification) => void,
  ): (() => void) => {
    notificationListeners.add(listener)
    return () => { notificationListeners.delete(listener) }
  }

  const approvalWait = (sessionId?: string, key?: string): PendingWait<'approval'> | undefined => {
    const id = sessionId ?? sessions.list.getSnapshot().current
    if (id === undefined) return undefined
    const snapshot = sessions.binding(id)?.session.getSnapshot()
    const pending = snapshot?.pending ?? []
    return pending.find((item: PendingInteraction): item is PendingWait<'approval'> =>
      item.kind === 'approval' && (key === undefined || item.key === key))
  }

  const currentApproval = (): ShellApprovalRequest | undefined => {
    const wait = approvalWait()
    if (wait === undefined) return undefined
    return {
      key: wait.key,
      sessionId: wait.sessionId,
      toolName: wait.payload.toolName,
      reason: wait.payload.reason,
      callId: wait.payload.callId,
      risk: 'requires-confirmation',
    }
  }

  const answerApproval = async (
    approval: ShellApprovalRequest,
    outcome: ShellApprovalOutcome,
  ): Promise<void> => {
    const wait = approvalWait(approval.sessionId, approval.key)
    if (wait === undefined) throw new Error('approval is no longer pending')
    const receipt = await wait.respond({
      ok: true,
      value: {
        sessionId: wait.sessionId,
        approvalId: wait.payload.approvalId,
        outcome,
      },
    })
    if (!receipt.accepted) throw new Error(`approval response rejected: ${receipt.reason}`)
  }

  return {
    registerSearchProvider,
    search,
    registerSupportProvider,
    supportFor,
    subscribe,
    notify,
    subscribeNotifications,
    currentApproval,
    answerApproval,
  }
}
