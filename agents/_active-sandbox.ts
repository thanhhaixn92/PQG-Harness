type SandboxHandle = {
  kill?: () => Promise<unknown> | unknown
}

type ActiveSandboxEntry = {
  token: symbol
  sandbox: SandboxHandle
}

const activeWorkspaceSandboxes = new Map<string, ActiveSandboxEntry[]>()

export function registerActiveWorkspaceSandbox(
  conversationId: string,
  sandbox: SandboxHandle | undefined,
): () => void {
  if (!conversationId || !sandbox) return () => {}

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
