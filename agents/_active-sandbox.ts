type SandboxHandle = {
  kill?: () => Promise<unknown> | unknown
}

/**
 * Compatibility shim for the PR #57 workspace implementation now vendored as
 * `_workspace-base.ts` / `_mcp-bridge-base.ts`.
 *
 * Runner-owned cancellation no longer coordinates sandbox handles through
 * process-local state. These functions intentionally retain the old call
 * signatures while holding no Map/Set and performing no cross-request work.
 */
export function registerActiveWorkspaceSandbox(
  _conversationId: string,
  _sandbox: SandboxHandle | undefined,
): () => void {
  return () => {}
}

export function activeWorkspaceSandboxHandles(_conversationId: string): SandboxHandle[] {
  return []
}

export function beginWorkspaceStop(_conversationId: string): SandboxHandle[] {
  return []
}

export function resetWorkspaceStop(_conversationId: string): void {}
