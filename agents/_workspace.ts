import { withRunnerOwnedSandboxCancellation } from './_sandbox-abort.ts'
import { runWorkspaceCommand as runWorkspaceCommandBase } from './_workspace-base.ts'

export * from './_workspace-base.ts'

/**
 * Preserve the reviewed workspace/persistence implementation and adapt only
 * its sandbox command seam to the active runner's cancellation signal.
 */
export async function runWorkspaceCommand(
  context: any,
  conversationId: string,
  command: string,
  timeout = 120,
): ReturnType<typeof runWorkspaceCommandBase> {
  return runWorkspaceCommandBase(
    withRunnerOwnedSandboxCancellation(context),
    conversationId,
    command,
    timeout,
  )
}
