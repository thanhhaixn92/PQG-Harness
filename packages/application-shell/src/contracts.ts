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

export interface ShellSearchProvider<TResult = unknown> {
  id: string
  label: string
  search(query: string): Promise<readonly TResult[]>
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
