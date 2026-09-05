import { stopDshWebSidecar } from './_dsh-web-sidecar.ts'
import {
  M08_STOP_EPOCH_KEY,
  M08_STOP_EPOCH_METADATA_KEY,
} from './_sandbox-abort.ts'

function newStopEpoch(context: any): string {
  const runId = String(context?.run_id || 'stop').trim() || 'stop'
  return `${runId}:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

async function publishConversationMetadataEpoch(
  context: any,
  conversationId: string,
  epoch: string,
): Promise<boolean> {
  const updateConversation = context?.store?.updateConversation
  if (typeof updateConversation !== 'function') return false
  const metadata = { [M08_STOP_EPOCH_METADATA_KEY]: epoch }
  try {
    await updateConversation.call(context.store, { conversationId, metadata })
    return true
  } catch (firstError) {
    try {
      await updateConversation.call(context.store, conversationId, { metadata })
      return true
    } catch {
      throw firstError
    }
  }
}

async function publishCancellationEpoch(context: any, conversationId: string): Promise<{ published: true }> {
  const epoch = newStopEpoch(context)
  const scopedConversationId = String(context?.conversation_id || '').trim()
  const state = context?.store?.state
  const metadataAvailable = typeof context?.store?.updateConversation === 'function'

  let metadataPublished = false
  let metadataFailed = false
  if (metadataAvailable) {
    try {
      metadataPublished = await publishConversationMetadataEpoch(context, conversationId, epoch)
    } catch {
      metadataFailed = true
    }
  }

  let statePublished = false
  let stateFailed = false
  if (scopedConversationId === conversationId && state && typeof state.set === 'function') {
    try {
      await state.set(M08_STOP_EPOCH_KEY, epoch)
      statePublished = true
    } catch {
      stateFailed = true
    }
  }

  if (metadataPublished || statePublished) return { published: true }

  const error = new Error(
    metadataFailed || stateFailed || scopedConversationId === conversationId
      ? 'CANCELLATION_STATE_UNAVAILABLE'
      : 'CANCELLATION_SCOPE_MISMATCH',
  )
  error.name = 'CancellationStateError'
  throw error
}

export async function onRequestPost(context: any): Promise<Response> {
  const conversationId = String(context.request?.body?.conversation_id || '').trim()
  if (!conversationId) {
    return Response.json({ ok: false, error: 'conversation_id is required' }, { status: 400 })
  }

  // The frontend intentionally sends /stop without makers-conversation-id so it
  // is not sticky-routed to the possibly blocked runner. Conversation metadata
  // therefore provides the explicit cross-process fence; state remains a
  // same-scope fast path when the runtime did inject the matching scope.
  const [cancellationResult, webResult, platformResult] = await Promise.allSettled([
    publishCancellationEpoch(context, conversationId),
    stopDshWebSidecar(conversationId),
    context.utils?.abortActiveRun?.(conversationId),
  ])

  const cancellation = cancellationResult.status === 'fulfilled'
    ? cancellationResult.value
    : {
        published: false,
        error: cancellationResult.reason instanceof Error
          && cancellationResult.reason.message === 'CANCELLATION_STATE_UNAVAILABLE'
          ? 'CANCELLATION_STATE_UNAVAILABLE'
          : cancellationResult.reason instanceof Error
            && cancellationResult.reason.message === 'CANCELLATION_SCOPE_MISMATCH'
            ? 'CANCELLATION_SCOPE_MISMATCH'
            : 'CANCELLATION_PUBLISH_FAILED',
      }
  const sidecar = webResult.status === 'fulfilled'
    ? webResult.value
    : { found: true, closed: false, error: 'SIDE_CAR_STOP_FAILED' }
  const platform = platformResult.status === 'fulfilled'
    ? { aborted: platformResult.value?.aborted === true }
    : { aborted: false, error: 'PLATFORM_ABORT_FAILED' }
  const ok = cancellation.published === true && !sidecar.error && !('error' in platform)

  return Response.json({
    ok,
    conversation_id: conversationId,
    cancellation,
    sidecar,
    platform,
    sandbox: { delegated: true },
  }, {
    headers: { 'cache-control': 'no-store' },
  })
}
