import { applyModuleEnabledToLiveSidecars } from '../_dsh-web-sidecar.ts'
import {
  listInstalledModuleStates,
  setInstalledModuleEnabled,
} from '../_module-state.ts'

async function requestJson(context: any): Promise<unknown> {
  const request = context.request
  if (typeof request?.json === 'function') return request.json()
  const body = request?.body
  if (typeof body === 'string') return body ? JSON.parse(body) : undefined
  if (body && typeof body === 'object') return body
  return undefined
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status })
}

export async function onRequest(context: any): Promise<Response> {
  const method = String(context.request?.method || 'GET').toUpperCase()
  if (method === 'GET') {
    return Response.json({ modules: await listInstalledModuleStates(context) })
  }
  if (method !== 'PUT') {
    return errorResponse(405, 'method-not-allowed', 'Method not allowed')
  }

  let body: unknown
  try {
    body = await requestJson(context)
  } catch {
    return errorResponse(400, 'invalid-request', 'Invalid JSON body')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse(400, 'invalid-request', 'Module id and enabled state are required')
  }
  const record = body as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.enabled !== 'boolean') {
    return errorResponse(400, 'invalid-request', 'Module id and enabled state are required')
  }

  try {
    const module = await setInstalledModuleEnabled(context, record.id, record.enabled)
    await applyModuleEnabledToLiveSidecars(module.id, module.enabled)
    return Response.json({ module })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/not installed/i.test(message)) {
      return errorResponse(404, 'module-not-installed', 'Tiện ích không được cài đặt')
    }
    throw error
  }
}
