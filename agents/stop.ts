import { beginWorkspaceStop } from './_active-sandbox.ts'
import { stopDshWebSidecar } from './_dsh-web-sidecar.ts'

type SandboxStopResult =
  | { killed: true }
  | { killed: false; error: 'SANDBOX_KILL_FAILED' | 'SANDBOX_KILL_UNAVAILABLE' }

async function killSandboxesForStop(sandboxes: any[]): Promise<SandboxStopResult> {
  const killable = sandboxes.filter(sandbox => typeof sandbox?.kill === 'function')
  const hasUnavailable = killable.length !== sandboxes.length

  const results = await Promise.allSettled(
    killable.map(sandbox => Promise.resolve().then(() => sandbox.kill())),
  )

  if (hasUnavailable) {
    return { killed: false, error: 'SANDBOX_KILL_UNAVAILABLE' }
  }
  if (results.some(result => result.status === 'rejected')) {
    return { killed: false, error: 'SANDBOX_KILL_FAILED' }
  }
  if (results.length === 0) {
    return { killed: false, error: 'SANDBOX_KILL_UNAVAILABLE' }
  }
  return { killed: true }
}

export async function onRequestPost(context: any): Promise<Response> {
  const conversationId = String(context.request?.body?.conversation_id || '').trim()
  if (!conversationId) {
    return Response.json({ ok: false, error: 'conversation_id is required' }, { status: 400 })
  }

  const activeSandboxes = beginWorkspaceStop(conversationId)
  const sandboxes = activeSandboxes.length > 0 ? activeSandboxes : [context.sandbox]
  const [webResult, platformResult, sandboxResult] = await Promise.allSettled([
    stopDshWebSidecar(conversationId),
    context.utils?.abortActiveRun?.(conversationId),
    killSandboxesForStop(sandboxes),
  ])

  const sidecar = webResult.status === 'fulfilled'
    ? webResult.value
    : { found: true, closed: false, error: 'SIDE_CAR_STOP_FAILED' }
  const platform = platformResult.status === 'fulfilled'
    ? { aborted: platformResult.value?.aborted === true }
    : { aborted: false, error: 'PLATFORM_ABORT_FAILED' }
  const sandboxResultValue: SandboxStopResult = sandboxResult.status === 'fulfilled'
    ? sandboxResult.value
    : { killed: false, error: 'SANDBOX_KILL_FAILED' }
  const ok = !sidecar.error && !('error' in platform) && sandboxResultValue.killed === true

  return Response.json({
    ok,
    conversation_id: conversationId,
    sidecar,
    platform,
    sandbox: sandboxResultValue,
  }, {
    headers: { 'cache-control': 'no-store' },
  })
}
