import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { startLocalMcpBridge } from '../agents/_mcp-bridge.ts'

function textOf(result: any): string {
  const text = Array.isArray(result?.content)
    ? result.content.find((entry: any) => entry?.type === 'text')?.text
    : undefined
  assert.equal(typeof text, 'string')
  return text
}

function timeoutAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
}

test('MCP command ignores an unrelated latest-request AbortSignal and uses shared state', async () => {
  const controller = new AbortController()
  controller.abort()
  let killCalls = 0
  let runCalls = 0
  const context = {
    request: { signal: controller.signal },
    store: {
      state: {
        async get(key: string) {
          assert.equal(key, 'pqg:m08:stop-epoch')
          return 'stable-epoch'
        },
      },
    },
    sandbox: {
      commands: {
        async run(command: string) {
          runCalls += 1
          assert.match(command, /DSH_MAKERS_SANDBOX_OK/)
          return { exitCode: 0, stdout: 'DSH_MAKERS_SANDBOX_OK', stderr: '' }
        },
      },
      async kill() {
        killCalls += 1
      },
    },
    tools: { all: () => [] },
  }

  const bridge = await startLocalMcpBridge(() => context, 'conv-mcp-unrelated-signal')
  const client = new Client({ name: 'pqg-m08-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(bridge.url))

  try {
    await client.connect(transport)
    const result = await client.callTool({ name: 'sandbox_probe', arguments: {} })
    const payload = JSON.parse(textOf(result))
    assert.equal(payload.ok, true)
    assert.equal(runCalls, 1)
    assert.equal(killCalls, 0, 'latest-request AbortSignal must not own long-lived MCP cancellation')
  } finally {
    await client.close().catch(() => {})
    await bridge.close()
  }
})

test('MCP shared Stop epoch kills the exact sandbox used by an in-flight command', async () => {
  const controller = new AbortController()
  let epoch = 'before-stop'
  let killCalls = 0
  let runCalls = 0
  let rejectRun: ((error: Error) => void) | undefined

  const context = {
    request: { signal: controller.signal },
    store: {
      state: {
        async get(key: string) {
          assert.equal(key, 'pqg:m08:stop-epoch')
          return epoch
        },
      },
    },
    sandbox: {
      commands: {
        run() {
          runCalls += 1
          return new Promise((_resolve, reject) => {
            rejectRun = reject
          })
        },
      },
      async kill() {
        killCalls += 1
        rejectRun?.(new Error('sandbox terminated'))
      },
    },
    tools: { all: () => [] },
  }

  const bridge = await startLocalMcpBridge(() => context, 'conv-mcp-shared-stop')
  const client = new Client({ name: 'pqg-m08-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(bridge.url))

  try {
    await client.connect(transport)
    const pending = client.callTool({ name: 'sandbox_wait', arguments: { seconds: 30 } })

    for (let index = 0; index < 20 && runCalls === 0; index += 1) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    assert.equal(runCalls, 1, 'sandbox command must be in flight before Stop epoch changes')

    epoch = 'after-stop'
    const result = await Promise.race([
      pending,
      timeoutAfter(750, 'MCP shared Stop epoch did not settle the command'),
    ])

    assert.equal(result.isError, true)
    assert.equal(textOf(result), 'WORKSPACE_COMMAND_ABORTED')
    assert.equal(controller.signal.aborted, false)
    assert.equal(killCalls, 1, 'the wrapper must kill the same sandbox handle used for dispatch')
  } finally {
    rejectRun?.(new Error('test cleanup'))
    await client.close().catch(() => {})
    await bridge.close()
  }
})
