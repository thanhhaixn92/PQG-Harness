import { withRunnerOwnedSandboxCancellation } from './_sandbox-abort.ts'
import {
  startLocalMcpBridge as startLocalMcpBridgeBase,
  type LocalMcpBridge,
  type MakersContextProvider,
} from './_mcp-bridge-base.ts'

export * from './_mcp-bridge-base.ts'

/**
 * Reuse the reviewed MCP bridge unchanged while presenting it a runner context
 * whose sandbox command seam cooperates with the platform AbortSignal.
 */
export async function startLocalMcpBridge(
  getContext: MakersContextProvider,
  conversationId: string,
): Promise<LocalMcpBridge> {
  return startLocalMcpBridgeBase(
    () => withRunnerOwnedSandboxCancellation(getContext()),
    conversationId,
  )
}
