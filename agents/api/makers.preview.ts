import { currentPreview } from '../_workspace.ts'

const NO_STORE_HEADERS = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
}

export async function onRequest(context: any): Promise<Response> {
  const conversationId = String(context.conversation_id || '').trim()
  if (!conversationId) {
    return Response.json(
      { published: false, error: 'makers-conversation-id is required' },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  let preview: Awaited<ReturnType<typeof currentPreview>>
  try {
    preview = await currentPreview(context, conversationId)
  } catch {
    return Response.json(
      { published: false, error: 'PREVIEW_STATUS_UNAVAILABLE' },
      { status: 503, headers: NO_STORE_HEADERS },
    )
  }

  if (!preview.previewUrl) {
    return Response.json(preview, {
      status: preview.published ? 503 : 404,
      headers: NO_STORE_HEADERS,
    })
  }

  return new Response(null, {
    status: 302,
    headers: {
      ...NO_STORE_HEADERS,
      location: preview.previewUrl,
    },
  })
}
