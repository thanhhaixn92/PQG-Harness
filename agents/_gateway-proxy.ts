import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface LocalGatewayProxy {
  baseUrl: string
  close(): Promise<void>
}

export type MakersContextProvider = () => any

const GATEWAY_RESPONSE_HEADERS = new Set([
  'content-type',
  'cache-control',
  'retry-after',
  'x-request-id',
])

export function publicError(code: string): { error: string } {
  return { error: code }
}

export function gatewayResponseHeaders(headers: Headers): Headers {
  const filtered = new Headers()
  for (const [name, value] of headers.entries()) {
    if (GATEWAY_RESPONSE_HEADERS.has(name.toLowerCase())) filtered.append(name, value)
  }
  return filtered
}

function envValue(context: any, key: string): string {
  const value = context.env?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) as Record<string, unknown> : {}
}

export function normalizeGatewayRequest(body: Record<string, unknown>): Record<string, unknown> {
  const messages = Array.isArray(body.messages)
    ? body.messages.map(message => {
        if (!message || typeof message !== 'object') return message
        const record = message as Record<string, unknown>
        return record.role === 'developer' ? { ...record, role: 'system' } : record
      })
    : body.messages
  return {
    ...body,
    ...(messages === undefined ? {} : { messages }),
  }
}

async function proxyGatewayRequest(
  getContext: MakersContextProvider,
  conversationId: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
    response.writeHead(404).end('not found')
    return
  }

  const context = getContext()
  const upstreamBaseUrl = envValue(context, 'AI_GATEWAY_BASE_URL').replace(/\/+$/, '')
  const apiKey = envValue(context, 'AI_GATEWAY_API_KEY')
  if (!upstreamBaseUrl || !apiKey) {
    response.writeHead(500, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'AI Gateway environment is incomplete' }))
    return
  }

  const controller = new AbortController()
  response.on('close', () => {
    if (!response.writableEnded) controller.abort()
  })
  const body = normalizeGatewayRequest(await readJsonBody(request))
  if (typeof body.model !== 'string' || !body.model.trim()) {
    body.model = envValue(context, 'AI_GATEWAY_MODEL') || '@makers/deepseek-v4-flash'
  }
  const upstream = await fetch(`${upstreamBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      accept: 'text/event-stream',
      // Compatibility behavior inherited from the EdgeOne adapter. Their public
      // semantics are not documented by the currently reviewed Makers docs.
      'x-gateway-quota-bypass': 'true',
      'x-prompt-log': 'true',
      'makers-conversation-id': conversationId,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  })

  const headers = gatewayResponseHeaders(upstream.headers)
  response.writeHead(upstream.status, Object.fromEntries(headers.entries()))
  if (!upstream.body) {
    response.end()
    return
  }
  for await (const chunk of upstream.body) {
    if (!response.write(chunk)) {
      await new Promise<void>(resolve => response.once('drain', resolve))
    }
  }
  response.end()
}

export async function startLocalGatewayProxy(
  getContext: MakersContextProvider,
  conversationId: string,
): Promise<LocalGatewayProxy> {
  const server = createServer((request, response) => {
    void proxyGatewayRequest(getContext, conversationId, request, response).catch(error => {
      console.warn('[gateway] request failed:', error instanceof Error ? error.name : 'unknown')
      if (!response.headersSent) {
        response.writeHead(502, { 'content-type': 'application/json' })
        response.end(JSON.stringify(publicError('AI_GATEWAY_PROXY_FAILED')))
        return
      }
      response.destroy()
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Gateway proxy did not receive a TCP address')
  }

  return {
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}/v1`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
      server.closeAllConnections?.()
    }),
  }
}
