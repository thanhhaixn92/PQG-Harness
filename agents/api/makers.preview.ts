import { currentPreview } from '../_workspace.ts'

export async function onRequest(context: any): Promise<Response> {
  const conversationId = String(context.conversation_id || '').trim()
  if (!conversationId) {
    return Response.json(
      { published: false, error: 'makers-conversation-id is required' },
      { status: 400, headers: { 'cache-control': 'no-store' } },
    )
  }

  const preview = await currentPreview(context, conversationId)
  return Response.json(preview, {
    headers: { 'cache-control': 'no-store' },
  })
}
