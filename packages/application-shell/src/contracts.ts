export type SupportPanelState = 'collapsed' | 'compact' | 'expanded'

export interface ShellNavigationOwner {
  activeId: string
  navigate(targetId: string): void
}

export interface ShellWorkspaceOwner {
  activeId: string
}

export interface ShellSupportOwner {
  activeId: string
}

export interface ShellSearchResult {
  id: string
  label: string
  description?: string
  keywords?: readonly string[]
  targetId?: string
}

export interface ShellSearchMatch extends ShellSearchResult {
  providerId: string
  providerLabel: string
}

export interface ShellSearchProvider {
  id: string
  label: string
  search(query: string): Promise<readonly ShellSearchResult[]>
}

export interface ShellSupportSuggestion {
  id: string
  label: string
  prompt?: string
}

export interface ShellSupportContext {
  title?: string
  summary?: string
  suggestions?: readonly ShellSupportSuggestion[]
}

export interface ShellSupportProvider {
  id: string
  supportFor(activeId: string): ShellSupportContext | undefined
}

export type ShellNotificationKind = 'info' | 'success' | 'warning' | 'error'

export interface ShellNotification {
  id?: string
  title?: string
  message: string
  kind?: ShellNotificationKind
}

export type ShellApprovalOutcome = 'allowed-once' | 'rejected'

export interface ShellApprovalRequest {
  key: string
  sessionId: string
  toolName: string
  reason?: string
  callId?: string
  risk: 'requires-confirmation'
}

export interface ShellSystemServices {
  registerSearchProvider(provider: ShellSearchProvider): () => void
  search(query: string): Promise<readonly ShellSearchMatch[]>
  registerSupportProvider(provider: ShellSupportProvider): () => void
  supportFor(activeId: string): ShellSupportContext | undefined
  subscribe(listener: () => void): () => void
  notify(notification: ShellNotification): void
  subscribeNotifications(listener: (notification: ShellNotification) => void): () => void
  currentApproval(): ShellApprovalRequest | undefined
  answerApproval(approval: ShellApprovalRequest, outcome: ShellApprovalOutcome): Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    pqgShell: ShellSystemServices
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'pqg.shell.navigation': {
      kind: 'list'
      scope: 'root'
      owner: ShellNavigationOwner
    }
    'pqg.shell.workspace': {
      kind: 'chain'
      scope: 'root'
      owner: ShellWorkspaceOwner
    }
    'pqg.shell.home.widget': {
      kind: 'list'
      scope: 'root'
    }
    'pqg.shell.support.context': {
      kind: 'list'
      scope: 'root'
      owner: ShellSupportOwner
    }
    'pqg.shell.support.suggestion': {
      kind: 'list'
      scope: 'root'
      owner: ShellSupportOwner
    }
  }
}
