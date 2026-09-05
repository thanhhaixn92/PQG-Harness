import { withRunnerOwnedSandboxCancellation } from './_sandbox-abort.ts'
import {
  startLocalMcpBridge as startLocalMcpBridgeBase,
  type LocalMcpBridge,
  type MakersContextProvider,
} from './_mcp-bridge-base.ts'

export * from './_mcp-bridge-base.ts'

/**
 * The DSH MCP bridge is long-lived and outlives the HTTP request that most
 * recently touched the sidecar. Therefore that request's AbortSignal is not a
 * valid owner for tool cancellation. The bridge uses the conversation-scoped
 * shared Stop epoch instead; the context selected at tool dispatch still owns
 * the exact sandbox handle used by commands.run.
 */
export async function startLocalMcpBridge(
  getContext: MakersContextProvider,
  conversationId: string,
): Promise<LocalMcpBridge> {
  return startLocalMcpBridgeBase(
    () => withRunnerOwnedSandboxCancellation(getContext(), {
      useRequestSignal: false,
      requireSharedStop: true,
    }),
    conversationId,
  )
}
