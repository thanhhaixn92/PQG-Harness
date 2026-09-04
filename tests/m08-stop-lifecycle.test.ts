import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { registerActiveWorkspaceSandbox } from '../agents/_active-sandbox.ts'
import { onRequestPost } from '../agents/stop.ts'

test('Stop rejects a workspace sandbox registration that begins after the stop snapshot', async () => {
  const conversationId = 'conv-stop-late-registration'
  let lateRegistrationError = ''
  let lateSandboxKills = 0
  let releaseLate = () => {}

  const releaseFirst = registerActiveWorkspaceSandbox(conversationId, {
    kill() {
      try {
        releaseLate = registerActiveWorkspaceSandbox(conversationId, {
          kill() {
            lateSandboxKills += 1
          },
        })
      } catch (error) {
        lateRegistrationError = error instanceof Error ? error.message : String(error)
      }
    },
  })

  try {
    const response = await onRequestPost({
      request: { body: { conversation_id: conversationId } },
      utils: {
        async abortActiveRun() {
          return { aborted: true }
        },
      },
      sandbox: {
        async kill() {},
      },
    })
    const body = await response.json() as any

    assert.equal(body.ok, true)
    assert.equal(lateRegistrationError, 'WORKSPACE_STOPPING')
    assert.equal(lateSandboxKills, 0, 'a command that registers after Stop begins must never become runnable')
  } finally {
    releaseLate()
    releaseFirst()
  }
})

test('sandbox_wait registers its owning sandbox for Stop for exactly the wait execution', async () => {
  const source = await readFile(new URL('../agents/_mcp-bridge.ts', import.meta.url), 'utf8')
  const start = source.indexOf("register('sandbox_wait'")
  const end = source.indexOf("register('workspace_list_files'", start)
  assert.ok(start >= 0 && end > start, 'sandbox_wait handler must be present')
  const block = source.slice(start, end)
  assert.match(block, /registerActiveWorkspaceSandbox\(conversationId,\s*context\.sandbox\)/)
  assert.match(block, /finally\s*\{\s*releaseActiveSandbox\(\)\s*\}/)
})

test('workspace command sandbox registration ends before checkpoint persistence begins', async () => {
  const workspaceSource = await readFile(new URL('../agents/_workspace.ts', import.meta.url), 'utf8')
  const start = workspaceSource.indexOf('export async function runWorkspaceCommand')
  const end = workspaceSource.indexOf('function normalizePublicUrl', start)
  assert.ok(start >= 0 && end > start, 'runWorkspaceCommand must be present')
  const block = workspaceSource.slice(start, end)

  const registerIndex = block.indexOf('registerActiveWorkspaceSandbox')
  const runIndex = block.indexOf('context.sandbox.commands.run')
  const releaseIndex = block.indexOf('releaseActiveSandbox()')
  const persistIndex = block.indexOf('persistWorkspaceCheckpoint')

  assert.ok(registerIndex >= 0, 'runWorkspaceCommand must register the execution sandbox')
  assert.ok(runIndex > registerIndex, 'sandbox registration must precede command execution')
  assert.ok(releaseIndex > runIndex, 'sandbox registration must remain active while the command executes')
  assert.ok(persistIndex > releaseIndex, 'sandbox must be released before checkpoint persistence begins')

  const bridgeSource = await readFile(new URL('../agents/_mcp-bridge.ts', import.meta.url), 'utf8')
  const bridgeStart = bridgeSource.indexOf("register('workspace_run_command'")
  const bridgeEnd = bridgeSource.indexOf("register('publish_preview'", bridgeStart)
  assert.ok(bridgeStart >= 0 && bridgeEnd > bridgeStart, 'workspace_run_command handler must be present')
  const bridgeBlock = bridgeSource.slice(bridgeStart, bridgeEnd)
  assert.doesNotMatch(bridgeBlock, /registerActiveWorkspaceSandbox/)
})

test('a newly started MCP bridge clears the previous Stop registration barrier', async () => {
  const source = await readFile(new URL('../agents/_mcp-bridge.ts', import.meta.url), 'utf8')
  const start = source.indexOf('export async function startLocalMcpBridge')
  assert.ok(start >= 0, 'startLocalMcpBridge must be present')
  const block = source.slice(start)
  assert.match(block, /resetWorkspaceStop\(conversationId\)/)
})
