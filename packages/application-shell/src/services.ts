import type { ConversationSnapshot, ISessions, PendingInteraction, PendingWait, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
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
    const settled = await Promise.allSettled(
      providers.map(provider => Promise.resolve().then(() => provider.search(normalized))),
    )
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

  const supportSession = () => {
    const id = (sessions as Partial<ISessions>).list?.getSnapshot().current
    return id === undefined ? undefined : sessions.binding(id)?.session
  }

  const supportSnapshot = (): ConversationSnapshot | undefined => supportSession()?.getSnapshot()

  const subscribeSupport = (listener: () => void): (() => void) => {
    let disposeSession: (() => void) | undefined
    const bind = () => {
      disposeSession?.()
      disposeSession = supportSession()?.subscribe(listener)
      listener()
    }
    const disposeList = sessions.list.subscribe(bind)
    bind()
    return () => {
      disposeList()
      disposeSession?.()
    }
  }

  const promptSupport = async (value: string): Promise<void> => {
    const text = value.trim()
    if (!text) throw new Error('Support prompt is required')
    const session = supportSession()
    if (session === undefined) throw new Error('No active session is available')
    const receipt = await session.prompt([{ type: 'text', text }], 'queue')
    if (!receipt.ok) throw new Error(receipt.error.message)
  }

  const stopSupport = async (): Promise<void> => {
    const session = supportSession()
    if (session === undefined) throw new Error('No active session is available')
    const receipt = await session.cancel()
    if (!receipt.ok) throw new Error(receipt.error.message)
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

  const approvalWait = (sessionId?: SessionId, key?: string): PendingWait<'approval'> | undefined => {
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
    supportSnapshot,
    subscribeSupport,
    promptSupport,
    stopSupport,
    subscribe,
    notify,
    subscribeNotifications,
    currentApproval,
    answerApproval,
  }
}
