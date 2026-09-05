import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('legacy active-sandbox compatibility shim holds no process-local coordination state', async () => {
  const source = await readFile(new URL('../agents/_active-sandbox.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /new\s+Map\s*</)
  assert.doesNotMatch(source, /new\s+Set\s*</)
  assert.match(source, /return \[\]/)
})

test('workspace command adapts the existing persistence implementation at the command seam', async () => {
  const adapter = await readFile(new URL('../agents/_workspace.ts', import.meta.url), 'utf8')
  assert.match(adapter, /withRunnerOwnedSandboxCancellation\(context\)/)
  assert.match(adapter, /runWorkspaceCommandBase\(/)

  const base = await readFile(new URL('../agents/_workspace-base.ts', import.meta.url), 'utf8')
  const start = base.indexOf('export async function runWorkspaceCommand')
  const end = base.indexOf('function normalizePublicUrl', start)
  assert.ok(start >= 0 && end > start, 'vendored runWorkspaceCommand must be present')
  const block = base.slice(start, end)
  const runIndex = block.indexOf('context.sandbox.commands.run')
  const persistIndex = block.indexOf('persistWorkspaceCheckpoint')
  assert.ok(runIndex >= 0 && persistIndex > runIndex, 'checkpoint persistence must remain after command settlement')
})

test('MCP bridge uses shared Stop state instead of latest-request AbortSignal or a Stop registry', async () => {
  const adapter = await readFile(new URL('../agents/_mcp-bridge.ts', import.meta.url), 'utf8')
  assert.match(adapter, /withRunnerOwnedSandboxCancellation\(getContext\(\),\s*\{/)
  assert.match(adapter, /useRequestSignal:\s*false/)
  assert.match(adapter, /requireSharedStop:\s*true/)
  assert.doesNotMatch(adapter, /registerActiveWorkspaceSandbox|resetWorkspaceStop|beginWorkspaceStop/)

  const base = await readFile(new URL('../agents/_mcp-bridge-base.ts', import.meta.url), 'utf8')
  const start = base.indexOf("register('sandbox_wait'")
  const end = base.indexOf("register('workspace_list_files'", start)
  assert.ok(start >= 0 && end > start, 'sandbox_wait must remain in the reused MCP implementation')
  assert.match(base.slice(start, end), /context\.sandbox\.commands\.run/)
})
