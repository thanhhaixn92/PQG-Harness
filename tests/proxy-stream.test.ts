import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { WebSocketServer } from 'ws'
import { startLocalGatewayProxy } from '../agents/_gateway-proxy.ts'
import { startLocalMcpBridge } from '../agents/_mcp-bridge.ts'
import {
  __setSidecarStarterForTests,
  stopDshWebSidecar,
} from '../agents/_dsh-web-sidecar.ts'
import { onRequest } from '../agents/api/_proxy.ts'

async function closeHttpServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeAllConnections?.()
  })
}

function toolProbe(result: any): any {
  const text = Array.isArray(result?.content)
    ? result.content.find((entry: any) => entry?.type === 'text')?.text
    : undefined
  assert.equal(typeof text, 'string')
  return JSON.parse(text)
}

test('Gateway resolves the latest Makers context for each request', async () => {
  const authorizations: string[] = []
  const upstream = createServer(async (request, response) => {
    authorizations.push(String(request.headers.authorization || ''))
    for await (const _chunk of request) { /* drain */ }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true }))
  })
  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject)
    upstream.listen(0, '127.0.0.1', resolve)
  })
  const upstreamAddress = upstream.address() as AddressInfo
  const upstreamBaseUrl = `http://127.0.0.1:${upstreamAddress.port}/v1`

  let current = {
    env: {
      AI_GATEWAY_BASE_URL: upstreamBaseUrl,
      AI_GATEWAY_API_KEY: 'key-a',
      AI_GATEWAY_MODEL: 'model-a',
    },
  }
  const proxy = await startLocalGatewayProxy(() => current, 'conv-gateway-context')

  try {
    const first = await fetch(`${proxy.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    })
    assert.equal(first.status, 200)
    await first.text()

    current = {
      env: {
        AI_GATEWAY_BASE_URL: upstreamBaseUrl,
        AI_GATEWAY_API_KEY: 'key-b',
        AI_GATEWAY_MODEL: 'model-b',
      },
    }
    const second = await fetch(`${proxy.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    })
    assert.equal(second.status, 200)
    await second.text()

    assert.deepEqual(authorizations, ['Bearer key-a', 'Bearer key-b'])
  } finally {
    await proxy.close()
    await closeHttpServer(upstream)
  }
})

test('MCP resolves the latest Makers context for each tool request', async () => {
  let current: any = {
    tools: { all: () => [{ name: 'tool-a' }] },
    sandbox: {},
    store: {},
  }
  const bridge = await startLocalMcpBridge(() => current, 'conv-mcp-context')
  const client = new Client({ name: 'pqg-wp3-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(bridge.url))

  try {
    await client.connect(transport)
    const first = toolProbe(await client.callTool({
      name: 'makers_context_probe',
      arguments: {},
    }))
    assert.equal(first.hasSandbox, true)
    assert.deepEqual(first.platformTools, ['tool-a'])

    current = {
      tools: { all: () => [{ name: 'tool-b' }] },
      sandbox: {},
      store: {},
    }
    const second = toolProbe(await client.callTool({
      name: 'makers_context_probe',
      arguments: {},
    }))
    assert.equal(second.hasSandbox, true)
    assert.deepEqual(second.platformTools, ['tool-b'])
  } finally {
    await client.close().catch(() => {})
    await bridge.close()
  }
})

test('SSE abort before sidecar readiness never opens a late WebSocket', async () => {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await once(wss, 'listening')
  const address = wss.address() as AddressInfo
  let connections = 0
  wss.on('connection', socket => {
    connections += 1
    socket.close()
  })

  let releaseStart!: () => void
  const startGate = new Promise<void>(resolve => { releaseStart = resolve })
  __setSidecarStarterForTests(async (_context: any, conversationId: string) => {
    await startGate
    return {
      conversationId,
      home: `/tmp/${conversationId}`,
      port: address.port,
      child: {} as any,
      gateway: { baseUrl: '', close: async () => {} },
      mcp: { url: '', requestCount: () => 0, requestLog: () => [], close: async () => {} },
      lastUsedAt: Date.now(),
      context: {},
      close: async () => {},
    }
  })

  const abortController = new AbortController()
  let response: Response | undefined
  try {
    response = await onRequest({
      conversation_id: 'conv-sse-early-abort',
      request: {
        url: '/api/events.mux',
        method: 'GET',
        headers: {},
        signal: abortController.signal,
      },
    })
    abortController.abort()
    releaseStart()
    await new Promise(resolve => setTimeout(resolve, 80))
    assert.equal(connections, 0)
  } finally {
    releaseStart()
    try { await response?.body?.cancel() } catch { /* stream may already be closed */ }
    await stopDshWebSidecar('conv-sse-early-abort')
    __setSidecarStarterForTests(undefined)
    await new Promise<void>(resolve => wss.close(() => resolve()))
  }
})
