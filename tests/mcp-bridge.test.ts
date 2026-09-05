import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { appendMcpRequestMetadata, startLocalMcpBridge } from '../agents/_mcp-bridge.ts'

test('MCP request diagnostics retain only bounded metadata', () => {
  const initial: Array<{ method: string; url: string; bodyBytes: number }> = []
  let next = appendMcpRequestMetadata(initial, {
    method: 'POST',
    url: '/mcp',
    bodyBytes: 120,
  })

  assert.equal(initial.length, 0)
  assert.equal(next.length, 1)

  for (let index = 0; index < 80; index += 1) {
    next = appendMcpRequestMetadata(next, {
      method: 'POST',
      url: '/mcp',
      bodyBytes: index,
    })
  }

  assert.equal(next.length, 64)
  assert.equal(next[0]?.bodyBytes, 16)
  assert.equal(next.at(-1)?.bodyBytes, 79)
  assert.ok(next.every(entry => !Object.hasOwn(entry, 'body')))
  assert.ok(next.every(entry => Object.keys(entry).sort().join(',') === 'bodyBytes,method,url'))
})

test('workspace command MCP result treats durability failure as a tool error', async () => {
  const source = await readFile(new URL('../agents/_mcp-bridge.ts', import.meta.url), 'utf8')
  assert.match(
    source,
    /result\.exitCode\s*!==\s*0\s*\|\|\s*result\.persistence\.persisted\s*!==\s*true/,
  )
})

test('workspace command MCP wrapper delegates cancellation scope to the workspace execution layer', async () => {
  const source = await readFile(new URL('../agents/_mcp-bridge.ts', import.meta.url), 'utf8')
  const start = source.indexOf("register('workspace_run_command'")
  const end = source.indexOf("register('publish_preview'", start)
  assert.ok(start >= 0 && end > start)
  const block = source.slice(start, end)
  assert.doesNotMatch(block, /registerActiveWorkspaceSandbox/)
  assert.match(block, /runWorkspaceCommand\(context,\s*conversationId,\s*command,\s*timeout\)/)
})

test('module tools toggle on the existing MCP bridge without affecting Makers core tools', async () => {
  const bridge = await startLocalMcpBridge(
    () => ({ tools: { all: () => [] } }),
    'conv-module-lifecycle',
  )
  const moduleBridge = bridge as typeof bridge & {
    registerModuleTool(
      moduleId: string,
      name: string,
      def: { description: string; inputSchema?: Record<string, unknown> },
      handler: () => Promise<{ content: Array<{ type: 'text'; text: string }> }>,
    ): void
    setModuleEnabled(moduleId: string, enabled: boolean): void
    removeModule(moduleId: string): void
  }
  const client = new Client({ name: 'module-lifecycle-test', version: '1.0.0' }, { capabilities: {} })
  await client.connect(new StreamableHTTPClientTransport(new URL(bridge.url)))

  try {
    const initial = (await client.listTools()).tools.map(tool => tool.name)
    assert.ok(initial.includes('makers_context_probe'))
    assert.equal(initial.includes('future_probe'), false)

    moduleBridge.setModuleEnabled('future', true)
    moduleBridge.registerModuleTool(
      'future',
      'future_probe',
      { description: 'Future PQG module probe', inputSchema: {} },
      async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    )

    const enabled = (await client.listTools()).tools.map(tool => tool.name)
    assert.ok(enabled.includes('future_probe'))
    assert.ok(enabled.includes('makers_context_probe'))

    moduleBridge.setModuleEnabled('future', false)
    const disabled = (await client.listTools()).tools.map(tool => tool.name)
    assert.equal(disabled.includes('future_probe'), false)
    assert.ok(disabled.includes('makers_context_probe'))

    moduleBridge.setModuleEnabled('future', true)
    assert.ok((await client.listTools()).tools.some(tool => tool.name === 'future_probe'))

    moduleBridge.removeModule('future')
    const removed = (await client.listTools()).tools.map(tool => tool.name)
    assert.equal(removed.includes('future_probe'), false)
    assert.ok(removed.includes('makers_context_probe'))
  } finally {
    await client.close().catch(() => {})
    await bridge.close().catch(() => {})
  }
})

test('a failing module tool returns an MCP error without taking down Makers core tools', async () => {
  const bridge = await startLocalMcpBridge(
    () => ({ tools: { all: () => [] } }),
    'conv-module-failure',
  )
  const moduleBridge = bridge as typeof bridge & {
    registerModuleTool(
      moduleId: string,
      name: string,
      def: { description: string; inputSchema?: Record<string, unknown> },
      handler: () => Promise<{ content: Array<{ type: 'text'; text: string }> }>,
    ): void
    setModuleEnabled(moduleId: string, enabled: boolean): void
  }
  const client = new Client({ name: 'module-failure-test', version: '1.0.0' }, { capabilities: {} })
  await client.connect(new StreamableHTTPClientTransport(new URL(bridge.url)))

  try {
    moduleBridge.setModuleEnabled('future', true)
    moduleBridge.registerModuleTool(
      'future',
      'future_fail',
      { description: 'Failing future module probe', inputSchema: {} },
      async () => { throw new Error('reference module failure') },
    )

    const failed = await client.callTool({ name: 'future_fail', arguments: {} }) as any
    assert.equal(failed.isError, true)

    const afterFailure = (await client.listTools()).tools.map(tool => tool.name)
    assert.ok(afterFailure.includes('makers_context_probe'))
    assert.ok(afterFailure.includes('future_fail'))

    const coreProbe = await client.callTool({ name: 'makers_context_probe', arguments: {} }) as any
    assert.notEqual(coreProbe.isError, true)
    assert.match(String(coreProbe.content?.[0]?.text || ''), /"ok":true/)
  } finally {
    await client.close().catch(() => {})
    await bridge.close().catch(() => {})
  }
})

test('installed reference Makers adapter toggles one probe tool on the existing bridge', async () => {
  const adaptersPath = new URL('../agents/_module-adapters.ts', import.meta.url)
  assert.equal(existsSync(adaptersPath), true, 'agents/_module-adapters.ts must load installed Makers adapters')
  const { applyInstalledMakersModules } = await import(adaptersPath.href)
  const root = fileURLToPath(new URL('../', import.meta.url))
  const bridge = await startLocalMcpBridge(
    () => ({ tools: { all: () => [] } }),
    'conv-reference-module',
  )
  bridge.setModuleEnabled('reference', false)
  await applyInstalledMakersModules({}, bridge, root)
  const client = new Client({ name: 'reference-module-test', version: '1.0.0' }, { capabilities: {} })
  await client.connect(new StreamableHTTPClientTransport(new URL(bridge.url)))

  try {
    const initial = (await client.listTools()).tools.map(tool => tool.name)
    assert.ok(initial.includes('makers_context_probe'))
    assert.equal(initial.includes('pqg_reference_probe'), false)

    bridge.setModuleEnabled('reference', true)
    const enabled = (await client.listTools()).tools.map(tool => tool.name)
    assert.ok(enabled.includes('pqg_reference_probe'))
    assert.ok(enabled.includes('makers_context_probe'))

    const probe = await client.callTool({ name: 'pqg_reference_probe', arguments: {} }) as any
    assert.notEqual(probe.isError, true)
    assert.match(String(probe.content?.[0]?.text || ''), /"moduleId":"reference"/)

    bridge.setModuleEnabled('reference', false)
    const disabled = (await client.listTools()).tools.map(tool => tool.name)
    assert.equal(disabled.includes('pqg_reference_probe'), false)
    assert.ok(disabled.includes('makers_context_probe'))
  } finally {
    await client.close().catch(() => {})
    await bridge.close().catch(() => {})
  }
})
