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
    ? webResult.value.found === false || webResult.value.closed === true
      ? webResult.value
      : {
          ...webResult.value,
          error: webResult.value.error || 'SIDE_CAR_CLOSE_FAILED',
        }
    : { found: true, closed: false, error: 'SIDE_CAR_STOP_FAILED' }

  const platform = platformResult.status === 'fulfilled' && platformResult.value?.aborted === true
    ? { aborted: true }
    : { aborted: false, error: 'PLATFORM_ABORT_FAILED' }

  const ok = !sidecar.error && platform.aborted === true

  return Response.json({
    ok,
    conversation_id: conversationId,
    web_aborted: sidecar,
    aborted: platform.aborted,
    sidecar,
    platform,
  }, {
    headers: { 'cache-control': 'no-store' },
  })
}
