import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { startLocalMcpBridge } from '../agents/_mcp-bridge.ts'

function deferred<T = void>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(promiseResolve => { resolve = promiseResolve })
  return { promise, resolve }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function connectClient(url: string): Promise<Client> {
  const client = new Client({ name: 'm08-final-race-test', version: '1.0.0' }, { capabilities: {} })
  await client.connect(new StreamableHTTPClientTransport(new URL(url)))
  return client
}

async function rawMcpPost(url: string, body: unknown, sessionId?: string): Promise<Response> {
  const headers: Record<string, string> = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
  }
  if (sessionId) {
    headers['mcp-session-id'] = sessionId
    headers['mcp-protocol-version'] = '2025-06-18'
  }
  return fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

test('MCP cancellation remains armed while publish preview waits on metadata', async () => {
  const metadataStarted = deferred()
  const releaseMetadata = deferred()
  let sandboxKills = 0

  const context = {
    tools: { all: () => [] },
    store: {
      async getConversation() { return { metadata: {} } },
      async updateConversation() {
        metadataStarted.resolve(undefined)
        return releaseMetadata.promise
      },
    },
    sandbox: {
      files: {
        async makeDir() {},
        async exists() { return false },
        async write() {},
      },
      async restore() { return { restored: true } },
      commands: {
        async run() { return { stdout: '', stderr: '', exitCode: 0 } },
      },
      async kill() { sandboxKills += 1 },
    },
  }

  const bridge = await startLocalMcpBridge(() => context, 'conv-m08-preview-metadata-cancel')
  const client = await connectClient(bridge.url)
  try {
    const controller = new AbortController()
    const call = client.callTool(
      { name: 'publish_preview', arguments: {} },
      CallToolResultSchema,
      { signal: controller.signal },
    )

    await metadataStarted.promise
    controller.abort(new Error('user stop'))
    await assert.rejects(call)
    await wait(100)

    assert.equal(sandboxKills, 1, 'request cancellation must kill the captured sandbox while metadata is still pending')
  } finally {
    releaseMetadata.resolve(undefined)
    await wait(20)
    await client.close().catch(() => {})
    await bridge.close().catch(() => {})
  }
})

test('a cancellation received before its tool request blocks that late request', async () => {
  let commandRuns = 0
  const context = {
    tools: { all: () => [] },
    sandbox: {
      commands: {
        async run() {
          commandRuns += 1
          return { stdout: 'DSH_MAKERS_SANDBOX_OK', stderr: '', exitCode: 0 }
        },
      },
      async kill() {},
    },
  }

  const bridge = await startLocalMcpBridge(() => context, 'conv-m08-late-tool-after-cancel')
  try {
    const initialize = await rawMcpPost(bridge.url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'm08-late-request-test', version: '1.0.0' },
      },
    })
    const sessionId = initialize.headers.get('mcp-session-id')
    assert.ok(sessionId, 'initialize must establish an MCP session')
    await initialize.text()

    const initialized = await rawMcpPost(bridge.url, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    }, sessionId)
    await initialized.text()

    const cancelled = await rawMcpPost(bridge.url, {
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: { requestId: 41, reason: 'user stop' },
    }, sessionId)
    await cancelled.text()

    const lateCall = await rawMcpPost(bridge.url, {
      jsonrpc: '2.0',
      id: 41,
      method: 'tools/call',
      params: { name: 'sandbox_probe', arguments: {} },
    }, sessionId)
    await lateCall.text()
    await wait(20)

    assert.equal(commandRuns, 0, 'a tool request cancelled before registration must never reach the sandbox')
  } finally {
    await bridge.close().catch(() => {})
  }
})
