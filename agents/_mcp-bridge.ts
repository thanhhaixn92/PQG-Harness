import {
  captureSharedStopBaseline,
  withRunnerOwnedSandboxCancellation,
  type SharedStopBaseline,
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
 * valid owner for tool cancellation. Capture the explicit conversation Stop
 * fence when this bridge becomes live, then compare every later command to the
 * same fence. A Stop can therefore invalidate an existing bridge even before
 * its first tool command begins.
 *
 * Capability-only MCP probes may exist in test/startup contexts before the
 * Makers cancellation channel is injected. Keep the bridge available in that
 * case, but retain `requireSharedStop: true`: any sandbox command still fails
 * closed unless command-time context exposes the shared cancellation channel.
 */
export async function startLocalMcpBridge(
  getContext: MakersContextProvider,
  conversationId: string,
  capturedStopBaseline?: SharedStopBaseline,
): Promise<LocalMcpBridge> {
  let sharedStopBaseline = capturedStopBaseline
  if (sharedStopBaseline === undefined) {
    sharedStopBaseline = Object.freeze({ value: null })
    try {
      sharedStopBaseline = await captureSharedStopBaseline(getContext(), conversationId)
    } catch (error) {
      if (!(error instanceof Error && error.name === 'CancellationUnavailableError')) throw error
    }
  }

  return startLocalMcpBridgeBase(
    () => withRunnerOwnedSandboxCancellation(getContext(), {
      useRequestSignal: false,
      requireSharedStop: true,
      sharedStopBaseline,
      conversationId,
    }),
    conversationId,
  )
}
