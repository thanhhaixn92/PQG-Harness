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
  acquireDshWebSidecar,
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

test('unary streaming response holds its lease until the body finishes', async () => {
  let releaseBody!: () => void
  const bodyGate = new Promise<void>(resolve => { releaseBody = resolve })
  const sidecarServer = createServer(async (_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.write('{"part":1')
    await bodyGate
    response.end(',"done":true}')
  })
  await new Promise<void>((resolve, reject) => {
    sidecarServer.once('error', reject)
    sidecarServer.listen(0, '127.0.0.1', resolve)
  })
  const address = sidecarServer.address() as AddressInfo
  let streamedCloseCalls = 0
  const realNow = Date.now

  __setSidecarStarterForTests(async (_context: any, conversationId: string) => ({
    conversationId,
    home: `/tmp/${conversationId}`,
    port: address.port,
    child: {} as any,
    gateway: { baseUrl: '', close: async () => {} },
    mcp: { url: '', requestCount: () => 0, requestLog: () => [], close: async () => {} },
    lastUsedAt: Date.now(),
    context: {},
    close: async () => { if (conversationId === 'conv-unary-stream') streamedCloseCalls += 1 },
  }))

  let response: Response | undefined
  let sweepLease: Awaited<ReturnType<typeof acquireDshWebSidecar>> | undefined
  try {
    response = await onRequest({
      conversation_id: 'conv-unary-stream',
      request: {
        url: '/api/ping',
        method: 'GET',
        headers: {},
      },
    })
    assert.equal(response.status, 200)

    Date.now = () => realNow() + 60 * 60_000
    sweepLease = await acquireDshWebSidecar({ conversation_id: 'conv-sweep-trigger' })
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(streamedCloseCalls, 0, 'active response body must prevent idle reap')

    releaseBody()
    assert.equal(await response.text(), '{"part":1,"done":true}')
  } finally {
    Date.now = realNow
    releaseBody()
    sweepLease?.release()
    try { await response?.body?.cancel() } catch { /* body may already be consumed */ }
    await stopDshWebSidecar('conv-unary-stream')
    await stopDshWebSidecar('conv-sweep-trigger')
    __setSidecarStarterForTests(undefined)
    await closeHttpServer(sidecarServer)
  }
})

test('SSE keeps an idle downlink alive and forwards WebSocket frames unchanged', async () => {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await once(wss, 'listening')
  const address = wss.address() as AddressInfo
  let upstreamSocket: any
  const connected = new Promise<void>(resolve => {
    wss.once('connection', socket => {
      upstreamSocket = socket
      resolve()
    })
  })

  __setSidecarStarterForTests(async (_context: any, conversationId: string) => ({
    conversationId,
    home: `/tmp/${conversationId}`,
    port: address.port,
    child: {} as any,
    gateway: { baseUrl: '', close: async () => {} },
    mcp: { url: '', requestCount: () => 0, requestLog: () => [], close: async () => {} },
    lastUsedAt: Date.now(),
    context: {},
    close: async () => {},
  }))

  let response: Response | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    response = await onRequest({
      conversation_id: 'conv-sse-heartbeat',
      request: {
        url: '/api/events.mux',
        method: 'GET',
        headers: {},
      },
    })
    await connected
    reader = response.body!.getReader()
    const decoder = new TextDecoder()

    const initial = await reader.read()
    assert.equal(initial.done, false)
    assert.equal(decoder.decode(initial.value), ': connected\n\n')

    const heartbeat = await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('SSE heartbeat not received within 6.5s')), 6500)
      }),
    ])
    assert.equal(heartbeat.done, false)
    assert.equal(decoder.decode(heartbeat.value), ': ping\n\n')

    const frame = JSON.stringify({ type: 'approval/requested', rpcId: 'rpc-heartbeat-test' })
    upstreamSocket.send(frame)
    const forwarded = await reader.read()
    assert.equal(forwarded.done, false)
    assert.equal(decoder.decode(forwarded.value), `data: ${frame}\n\n`)
  } finally {
    try { await reader?.cancel() } catch { /* stream may already be closed */ }
    await stopDshWebSidecar('conv-sse-heartbeat')
    __setSidecarStarterForTests(undefined)
    await new Promise<void>(resolve => wss.close(() => resolve()))
  }
})
