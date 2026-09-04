import { stopDshWebSidecar } from './_dsh-web-sidecar.ts'

export async function onRequestPost(context: any): Promise<Response> {
  const conversationId = String(context.request?.body?.conversation_id || '').trim()
  if (!conversationId) {
    return Response.json({ ok: false, error: 'conversation_id is required' }, { status: 400 })
  }

  const [webResult, platformResult] = await Promise.allSettled([
    stopDshWebSidecar(conversationId),
    context.utils?.abortActiveRun?.(conversationId),
  ])

  const sidecar = webResult.status === 'fulfilled'
    ? webResult.value
    : { found: true, closed: false, error: 'SIDE_CAR_STOP_FAILED' }
  const platform = platformResult.status === 'fulfilled'
    ? { aborted: platformResult.value?.aborted === true }
    : { aborted: false, error: 'PLATFORM_ABORT_FAILED' }
  const ok = !sidecar.error && !('error' in platform)

  return Response.json({
    ok,
    conversation_id: conversationId,
    sidecar,
    platform,
    sandbox: { delegated: true },
  }, {
    headers: { 'cache-control': 'no-store' },
  })
}
