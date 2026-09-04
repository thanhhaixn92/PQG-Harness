import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  ALL_MAKERS_TOOLS,
  apply as applyMakersMcpPermission,
  makersAskReason,
  makersAutoAllowTools,
  makersMcpPermissionSource,
  makersRawToolName,
  makersToolAllowed,
  makersToolGate,
} from '../agents/_makers-mcp-permission.mjs'

test('generated sidecar plugin is self-contained and importable', async () => {
  const source = makersMcpPermissionSource()
  assert.doesNotMatch(source, /_makers-mcp-permission\.mjs/)
  const generated = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  assert.equal(generated.name, 'makers-mcp-permission')
  assert.equal(generated.makersToolGate('read-only', 'workspace_write_file'), 'ask')
  assert.equal(generated.makersToolGate('danger-full-access', 'publish_preview'), 'allow')
  assert.equal(generated.makersToolGate(undefined, 'workspace_write_file'), 'ask')
})

test('every Makers tool stays visible; permission only decides allow vs ask', () => {
  assert.deepEqual([...ALL_MAKERS_TOOLS], [
    'makers_context_probe',
    'workspace_list_files',
    'workspace_read_file',
    'workspace_write_file',
    'workspace_run_command',
    'publish_preview',
    'sandbox_probe',
    'sandbox_wait',
  ])
  assert.equal(makersToolGate('read-only', 'workspace_read_file'), 'allow')
  assert.equal(makersToolGate('read-only', 'workspace_write_file'), 'ask')
  assert.equal(makersToolGate('read-only', 'workspace_run_command'), 'ask')
  assert.equal(makersToolGate('read-only', 'publish_preview'), 'ask')
})

test('workspace-write auto-allows writes and asks for commands and preview', () => {
  assert.equal(makersToolAllowed('workspace-write', 'workspace_write_file'), true)
  assert.equal(makersToolGate('workspace-write', 'workspace_run_command'), 'ask')
  assert.equal(makersToolGate('workspace-write', 'publish_preview'), 'ask')
  assert.deepEqual([...makersAutoAllowTools('workspace-write')], [
    'makers_context_probe',
    'workspace_list_files',
    'workspace_read_file',
    'workspace_write_file',
  ])
})

test('full access auto-allows commands and preview without asking', () => {
  assert.equal(makersToolGate('danger-full-access', 'workspace_run_command'), 'allow')
  assert.equal(makersToolGate('danger-full-access', 'publish_preview'), 'allow')
  assert.equal(makersToolGate('danger-full-access', 'sandbox_probe'), 'allow')
  assert.deepEqual([...makersAutoAllowTools('danger-full-access')], [...ALL_MAKERS_TOOLS])
})

test('invalid or missing runtime permission fails closed to read-only behavior', () => {
  assert.equal(makersToolGate(undefined as any, 'workspace_write_file'), 'ask')
  assert.equal(makersToolGate('broken-mode', 'workspace_write_file'), 'ask')
  assert.equal(makersToolGate(undefined as any, 'workspace_read_file'), 'allow')
  assert.equal(makersToolGate('workspace-write', 'workspace_write_file'), 'allow')
  assert.ok(!makersAutoAllowTools(undefined as any).includes('workspace_write_file'))
})

test('ask copy tells the user which mode the call needs', () => {
  assert.match(makersAskReason('read-only', 'workspace_write_file'), /Workspace Write/)
  assert.match(makersAskReason('workspace-write', 'publish_preview'), /Full access/)
  assert.equal(makersRawToolName('mcp__edgeone__workspace_write_file'), 'workspace_write_file')
  assert.equal(makersRawToolName('bash'), null)
})

test('pre-execute asks the user instead of hiding the tool', () => {
  const decisions: unknown[] = []
  const ctx = {
    get: () => ({ resolve: () => ({ mode: 'read-only' }) }),
    on(_event: string, handler: (exec: { name: string; agent?: { session?: object } }, next: () => { kind: 'allow' }) => unknown) {
      const next = () => ({ kind: 'allow' as const })
      decisions.push(handler({ name: 'mcp__edgeone__workspace_write_file', agent: { session: {} } }, next))
      decisions.push(handler({ name: 'mcp__edgeone__workspace_read_file', agent: { session: {} } }, next))
      decisions.push(handler({ name: 'bash', agent: { session: {} } }, next))
    },
  }
  applyMakersMcpPermission(ctx)
  assert.equal((decisions[0] as { kind: string }).kind, 'ask')
  assert.equal((decisions[1] as { kind: string }).kind, 'allow')
  assert.equal((decisions[2] as { kind: string }).kind, 'allow')
})

test('pre-execute fails closed when sandbox policy is missing or throws', () => {
  const decisionKinds: string[] = []
  const run = (get: () => unknown) => {
    const ctx = {
      get,
      on(_event: string, handler: (exec: { name: string; agent?: { session?: object } }, next: () => { kind: 'allow' }) => unknown) {
        const result = handler({ name: 'mcp__edgeone__workspace_write_file', agent: { session: {} } }, () => ({ kind: 'allow' as const })) as { kind: string }
        decisionKinds.push(result.kind)
      },
    }
    applyMakersMcpPermission(ctx)
  }

  run(() => undefined)
  run(() => ({ resolve: () => { throw new Error('policy unavailable') } }))
  run(() => ({ resolve: () => ({ mode: 'broken-mode' }) }))

  assert.deepEqual(decisionKinds, ['ask', 'ask', 'ask'])
})

test('MCP bridge registers every tool instead of filtering by mode', async () => {
  const source = await readFile(new URL('../agents/_mcp-bridge.ts', import.meta.url), 'utf8')
  assert.match(source, /server\.registerTool\(name/)
  assert.doesNotMatch(source, /if \(!allowed\.has/)
  assert.doesNotMatch(source, /permissionDeniedMessage/)
})
