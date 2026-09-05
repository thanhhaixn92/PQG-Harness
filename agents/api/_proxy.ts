import WebSocket from 'ws'
import { publicError } from '../_gateway-proxy.ts'
import {
  acquireDshWebSidecar,
  snapshotDshSettingsYaml,
  type DshWebSidecar,
  type DshWebSidecarLease,
} from '../_dsh-web-sidecar.ts'

function requestPath(context: any): string {
  const value = typeof context.request?.url === 'string' ? context.request.url : '/api'
  try { return new URL(value, 'http://local').pathname } catch { return '/api' }
}

function requestSearch(context: any, incomingUrl: URL): string {
  if (incomingUrl.search) return incomingUrl.search
  const query = context.request?.query
  if (!query || typeof query !== 'object' || Array.isArray(query)) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item))
    } else {
      params.set(key, String(value))
    }
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

function eventStream(context: any, kind: 'mux' | 'host'): Response {
  const encoder = new TextEncoder()
  let socket: WebSocket | undefined
  let lease: DshWebSidecarLease | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let leaseReleased = false
  const signal = context.request?.signal as AbortSignal | undefined
  let cancelled = signal?.aborted === true

  const releaseLease = (): void => {
    if (leaseReleased || !lease) return
    leaseReleased = true
    lease.release()
  }
  const stopHeartbeat = (): void => {
    if (!heartbeat) return
    clearInterval(heartbeat)
    heartbeat = undefined
  }
  const closeSocket = (): void => {
    if (socket?.readyState === WebSocket.CONNECTING || socket?.readyState === WebSocket.OPEN) socket.close()
  }
  const abort = (): void => {
    cancelled = true
    stopHeartbeat()
    closeSocket()
    releaseLease()
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const cleanup = (): void => {
        signal?.removeEventListener('abort', abort)
        stopHeartbeat()
        releaseLease()
      }
      const streamError = (error: unknown): void => {
        cleanup()
        console.warn('[dsh-web] event stream failed:', error instanceof Error ? error.name : 'unknown')
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'server-request',
            rpcId: crypto.randomUUID(),
            method: 'stream/error',
            payload: {
              type: 'stream/error',
              error: { code: 'internal', message: 'DSH_WEB_STREAM_FAILED', details: {} },
            },
          })}\n\n`))
        } catch {
          // The browser already disconnected.
        }
        try { controller.close() } catch { /* already cancelled */ }
      }

      signal?.addEventListener('abort', abort, { once: true })
      if (cancelled) {
        cleanup()
        try { controller.close() } catch { /* already cancelled */ }
        return
      }

      try {
        lease = await acquireDshWebSidecar(context)
        if (cancelled) {
          cleanup()
          try { controller.close() } catch { /* already cancelled */ }
          return
        }

        const sidecar = lease.sidecar
        const path = kind === 'mux' ? '/api/events.mux' : '/api/events.host'
        socket = new WebSocket(`ws://127.0.0.1:${String(sidecar.port)}${path}`, {
          headers: { origin: `http://127.0.0.1:${String(sidecar.port)}` },
        })
        socket.once('open', () => {
          try {
            controller.enqueue(encoder.encode(': connected\n\n'))
            heartbeat = setInterval(() => {
              try { controller.enqueue(encoder.encode(': ping\n\n')) } catch {
                stopHeartbeat()
                closeSocket()
              }
            }, 5000)
          } catch {
            closeSocket()
          }
        })
        socket.on('message', data => {
          try { controller.enqueue(encoder.encode(`data: ${data.toString()}\n\n`)) } catch { closeSocket() }
        })
        socket.once('error', streamError)
        socket.once('close', () => {
          cleanup()
          try { controller.close() } catch { /* already cancelled */ }
        })
      } catch (error) {
        streamError(error)
      }
    },
    cancel() {
      cancelled = true
      signal?.removeEventListener('abort', abort)
      stopHeartbeat()
      closeSocket()
      releaseLease()
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}

const LOCKED_BUILT_IN_PRESETS = new Set(['standard', 'code', 'minimal', 'cordis'])

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function requestedLockedPreset(body: unknown): string | undefined {
  const envelope = asRecord(body)
  const method = typeof envelope?.method === 'string' ? envelope.method : ''
  const payload = asRecord(envelope?.payload) ?? {}
  if (method === 'agentPreset.select') {
    const id = String(payload.agentPreset || '')
    return LOCKED_BUILT_IN_PRESETS.has(id) ? id : undefined
  }
  if (payload.ns !== 'agent-presets') return undefined
  if (method === 'settings.update') {
    const id = String(asRecord(payload.patch)?.default || '')
    return LOCKED_BUILT_IN_PRESETS.has(id) ? id : undefined
  }
  if (method === 'settings.replace') {
    const id = String(asRecord(payload.section)?.default || '')
    return LOCKED_BUILT_IN_PRESETS.has(id) ? id : undefined
  }
  if (method === 'settings.mutate' && Array.isArray(payload.ops)) {
    for (const op of payload.ops) {
      const edit = asRecord(op)
      const path = Array.isArray(edit?.path) ? edit.path : []
      if (edit?.op === 'set' && path.length === 1 && path[0] === 'default') {
        const id = String(edit.value || '')
        if (LOCKED_BUILT_IN_PRESETS.has(id)) return id
      }
    }
  }
  return undefined
}

function rejectLockedPreset(rpcId: unknown, agentPreset: string): Response {
  return Response.json({
    type: 'server-response',
    rpcId: typeof rpcId === 'string' && rpcId.length > 0 ? rpcId : crypto.randomUUID(),
    result: {
      ok: false,
      error: {
        code: 'agent-preset-read-only',
        message: `Built-in agent preset "${agentPreset}" is not selectable on EdgeOne Makers.`,
        details: {
          agentPreset,
          reason: 'locked on EdgeOne Makers',
        },
      },
    },
  })
}

const SETTINGS_WRITE_PATHS = new Set([
  '/api/settings.update',
  '/api/settings.replace',
  '/api/settings.mutate',
])

function settingsWriteSucceeded(bytes: Uint8Array): boolean {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { result?: { ok?: boolean } }
    return parsed.result?.ok === true
  } catch {
    return false
  }
}

async function snapshotSettingsAfterWrite(
  context: any,
  sidecar: DshWebSidecar,
  path: string,
  upstream: Response,
  headers: Headers,
): Promise<Response | undefined> {
  if (!SETTINGS_WRITE_PATHS.has(path)) return undefined
  const bytes = new Uint8Array(await upstream.arrayBuffer())
  headers.set('content-length', String(bytes.byteLength))
  if (upstream.ok && settingsWriteSucceeded(bytes)) {
    try {
      await snapshotDshSettingsYaml(context, sidecar.conversationId, sidecar.home)
    } catch (error) {
      console.warn('[dsh-web] settings snapshot failed:', error instanceof Error ? error.name : 'unknown')
    }
  }
  return new Response(bytes, { status: upstream.status, headers })
}

function leaseBoundBody(
  body: ReadableStream<Uint8Array> | null,
  lease: DshWebSidecarLease,
): ReadableStream<Uint8Array> | null {
  if (!body) {
    lease.release()
    return null
  }
  const reader = body.getReader()
  let released = false
  const release = (): void => {
    if (released) return
    released = true
    lease.release()
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read()
        if (result.done) {
          release()
          controller.close()
          return
        }
        controller.enqueue(result.value)
      } catch (error) {
        release()
        controller.error(error)
      }
    },
    async cancel(reason) {
      release()
      try { await reader.cancel(reason) } catch { /* upstream may already be closed */ }
    },
  })
}

async function proxy(context: any): Promise<Response> {
  const path = requestPath(context)
  if (path === '/api/events.mux') return eventStream(context, 'mux')
  if (path === '/api/events.host') return eventStream(context, 'host')

  const incomingBody = context.request?.body
  const lockedPreset = requestedLockedPreset(incomingBody)
  if (lockedPreset) return rejectLockedPreset(asRecord(incomingBody)?.rpcId, lockedPreset)

  const lease = await acquireDshWebSidecar(context)
  let releaseOnReturn = true
  try {
    const sidecar = lease.sidecar
    const incomingUrl = new URL(typeof context.request?.url === 'string' ? context.request.url : path, 'http://local')
    const upstreamUrl = new URL(`${incomingUrl.pathname}${requestSearch(context, incomingUrl)}`, `http://127.0.0.1:${String(sidecar.port)}`)
    const method = String(context.request?.method || 'POST').toUpperCase()
    const body = method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(context.request?.body ?? {})
    const upstream = await fetch(upstreamUrl, {
      method,
      headers: {
        accept: context.request?.headers?.accept || '*/*',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body }),
      signal: context.request?.signal,
    })
    const headers = new Headers(upstream.headers)
    headers.delete('content-length')
    headers.delete('transfer-encoding')
    if (path === '/api/session.export' && method === 'GET') {
      const bytes = new Uint8Array(await upstream.arrayBuffer())
      if (!headers.has('content-type')) headers.set('content-type', 'application/zip')
      // Makers' strict stream detector only treats SSE / chunked / this flag as binary.
      // Without it the runtime UTF-8-decodes the ZIP and the local proxy then writes
      // leftover bytes into an already-ended response (ERR_STREAM_WRITE_AFTER_END).
      headers.set('x-content-type-stream', 'true')
      headers.set('cache-control', 'no-store')
      return new Response(bytes, { status: upstream.status, headers })
    }
    const settingsResponse = await snapshotSettingsAfterWrite(context, sidecar, path, upstream, headers)
    if (settingsResponse) return settingsResponse
    const streamedBody = leaseBoundBody(upstream.body, lease)
    releaseOnReturn = false
    return new Response(streamedBody, { status: upstream.status, headers })
  } finally {
    if (releaseOnReturn) lease.release()
  }
}

export async function onRequest(context: any): Promise<Response> {
  try {
    return await proxy(context)
  } catch (error) {
    console.warn('[dsh-web] proxy failed:', error instanceof Error ? error.name : 'unknown')
    return Response.json(publicError('DSH_WEB_PROXY_FAILED'), { status: 502 })
  }
}
