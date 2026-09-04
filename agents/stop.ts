import { stopDshWebSidecar } from './_dsh-web-sidecar.ts'

export async function onRequestPost(context: any): Promise<Response> {
  const conversationId = String(context.request?.body?.conversation_id || '').trim()
  if (!conversationId) {
    return Response.json({ ok: false, error: 'conversation_id is required' }, { status: 400 })
  }

  const webAborted = await stopDshWebSidecar(conversationId)
  const platformResult = await context.utils?.abortActiveRun?.(conversationId)
  return Response.json({
    ok: true,
    conversation_id: conversationId,
    web_aborted: webAborted,
    aborted: platformResult?.aborted === true,
  }, {
    headers: { 'cache-control': 'no-store' },
  })
}
