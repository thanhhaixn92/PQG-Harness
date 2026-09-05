import {
  captureSharedStopBaseline,
  withRunnerOwnedSandboxCancellation,
} from './_sandbox-abort.ts'
import {
  startLocalMcpBridge as startLocalMcpBridgeBase,
  type LocalMcpBridge,
  type MakersContextProvider,
} from './_mcp-bridge-base.ts'

export * from './_mcp-bridge-base.ts'

/**
 * The DSH MCP bridge is long-lived and outlives the HTTP request that most
 * recently touched the sidecar. Therefore that request's AbortSignal is not a
 * valid owner for tool cancellation. Capture the conversation-scoped Stop
 * fence when this bridge becomes live, then compare every later command to the
 * same fence. A Stop can therefore invalidate an existing bridge even before
 * its first tool command begins.
 */
export async function startLocalMcpBridge(
  getContext: MakersContextProvider,
  conversationId: string,
): Promise<LocalMcpBridge> {
  const sharedStopBaseline = await captureSharedStopBaseline(getContext())
  return startLocalMcpBridgeBase(
    () => withRunnerOwnedSandboxCancellation(getContext(), {
      useRequestSignal: false,
      requireSharedStop: true,
      sharedStopBaseline,
    }),
    conversationId,
  )
}
