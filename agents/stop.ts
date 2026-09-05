import { stopDshWebSidecar } from './_dsh-web-sidecar.ts'
import { M08_STOP_EPOCH_KEY } from './_sandbox-abort.ts'

function newStopEpoch(context: any): string {
  const runId = String(context?.run_id || 'stop').trim() || 'stop'
  return `${runId}:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

async function publishCancellationEpoch(context: any, conversationId: string): Promise<{ published: true }> {
  const scopedConversationId = String(context?.conversation_id || '').trim()
  if (scopedConversationId && scopedConversationId !== conversationId) {
    const error = new Error('CANCELLATION_SCOPE_MISMATCH')
    error.name = 'CancellationStateError'
    throw error
  }

  const state = context?.store?.state
  if (!state || typeof state.set !== 'function') {
    const error = new Error('CANCELLATION_STATE_UNAVAILABLE')
    error.name = 'CancellationStateError'
    throw error
  }

  await state.set(M08_STOP_EPOCH_KEY, newStopEpoch(context))
  return { published: true }
}

export async function onRequestPost(context: any): Promise<Response> {
  const conversationId = String(context.request?.body?.conversation_id || '').trim()
  if (!conversationId) {
    return Response.json({ ok: false, error: 'conversation_id is required' }, { status: 400 })
  }

  // All three channels start independently. The shared epoch crosses request /
  // process boundaries; platform abort remains the low-latency signal path;
  // sidecar shutdown stops DSH work. The Stop request never kills its own sandbox.
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
