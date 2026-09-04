import { stopDshWebSidecar } from './_dsh-web-sidecar.ts'

type SandboxStopResult =
  | { killed: true }
  | { killed: false; error: 'SANDBOX_KILL_FAILED' | 'SANDBOX_KILL_UNAVAILABLE' }

async function killSandboxForStop(context: any): Promise<SandboxStopResult> {
  if (typeof context.sandbox?.kill !== 'function') {
    return { killed: false, error: 'SANDBOX_KILL_UNAVAILABLE' }
  }

  try {
    await context.sandbox.kill()
    return { killed: true }
  } catch {
    return { killed: false, error: 'SANDBOX_KILL_FAILED' }
  }
}

export async function onRequestPost(context: any): Promise<Response> {
  const conversationId = String(context.request?.body?.conversation_id || '').trim()
  if (!conversationId) {
    return Response.json({ ok: false, error: 'conversation_id is required' }, { status: 400 })
  }

  const [webResult, platformResult, sandboxResult] = await Promise.allSettled([
    stopDshWebSidecar(conversationId),
    context.utils?.abortActiveRun?.(conversationId),
    killSandboxForStop(context),
  ])

  const sidecar = webResult.status === 'fulfilled'
    ? webResult.value
    : { found: true, closed: false, error: 'SIDE_CAR_STOP_FAILED' }
  const platform = platformResult.status === 'fulfilled'
    ? { aborted: platformResult.value?.aborted === true }
    : { aborted: false, error: 'PLATFORM_ABORT_FAILED' }
  const sandbox: SandboxStopResult = sandboxResult.status === 'fulfilled'
    ? sandboxResult.value
    : { killed: false, error: 'SANDBOX_KILL_FAILED' }
  const ok = !sidecar.error && !('error' in platform) && sandbox.killed === true

  return Response.json({
    ok,
    conversation_id: conversationId,
    sidecar,
    platform,
    sandbox,
  }, {
    headers: { 'cache-control': 'no-store' },
  })
}
