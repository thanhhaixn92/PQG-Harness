type SandboxHandle = {
  kill?: () => Promise<unknown> | unknown
}

type ActiveSandboxEntry = {
  token: symbol
  sandbox: SandboxHandle
}

const activeWorkspaceSandboxes = new Map<string, ActiveSandboxEntry[]>()
const stoppingWorkspaceConversations = new Set<string>()

export function registerActiveWorkspaceSandbox(
  conversationId: string,
  sandbox: SandboxHandle | undefined,
): () => void {
  if (!conversationId || !sandbox) return () => {}
  if (stoppingWorkspaceConversations.has(conversationId)) {
    throw new Error('WORKSPACE_STOPPING')
  }

  const entry: ActiveSandboxEntry = { token: Symbol(conversationId), sandbox }
  const entries = activeWorkspaceSandboxes.get(conversationId) ?? []
  entries.push(entry)
  activeWorkspaceSandboxes.set(conversationId, entries)

  let released = false
  return () => {
    if (released) return
    released = true
    const current = activeWorkspaceSandboxes.get(conversationId)
    if (!current) return
    const next = current.filter(candidate => candidate.token !== entry.token)
    if (next.length === 0) activeWorkspaceSandboxes.delete(conversationId)
    else activeWorkspaceSandboxes.set(conversationId, next)
  }
}

export function activeWorkspaceSandboxHandles(conversationId: string): SandboxHandle[] {
  const entries = activeWorkspaceSandboxes.get(conversationId)
  if (!entries?.length) return []
  return [...new Set(entries.map(entry => entry.sandbox))]
}

export function beginWorkspaceStop(conversationId: string): SandboxHandle[] {
  if (!conversationId) return []
  stoppingWorkspaceConversations.add(conversationId)
  return activeWorkspaceSandboxHandles(conversationId)
}

export function resetWorkspaceStop(conversationId: string): void {
  if (!conversationId) return
  stoppingWorkspaceConversations.delete(conversationId)
}
