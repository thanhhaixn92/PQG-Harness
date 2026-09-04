import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeWorkspacePath, workspaceRoot, writeWorkspaceFile } from '../agents/_workspace.ts'

test('workspace paths stay relative and traversal-free', () => {
  assert.equal(normalizeWorkspacePath('src/App.tsx'), 'src/App.tsx')
  assert.equal(normalizeWorkspacePath('./src/main.ts'), 'src/main.ts')
  assert.equal(normalizeWorkspacePath('../secret'), null)
  assert.equal(normalizeWorkspacePath('/tmp/file'), null)
  assert.equal(normalizeWorkspacePath('src//file.ts'), null)
})

test('workspace root sanitizes the conversation id', () => {
  assert.equal(
    workspaceRoot('abc/../unsafe'),
    'projects/abc____unsafe/workspace',
  )
})

function missingConversation(action: string) {
  return Object.assign(new Error(`Conversation not found by ${action}.`), {
    code: 'MemoryNotFoundError',
  })
}

function createSandbox(written = new Map<string, string>()) {
  return {
    files: {
      makeDir: async () => {},
      write: async (path: string, content: string) => { written.set(path, content) },
    },
    commands: {
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    },
  }
}

test('writeWorkspaceFile bootstraps a missing conversation before snapshotting', async () => {
  const written = new Map<string, string>()
  const conversations = new Map<string, { metadata: Record<string, unknown> }>()
  const store = {
    async getConversation({ conversationId }: { conversationId: string }) {
      const row = conversations.get(conversationId)
      if (!row) throw missingConversation('getConversation')
      return row
    },
    async appendMessage({ conversationId }: { conversationId: string }) {
      if (!conversations.has(conversationId)) {
        conversations.set(conversationId, { metadata: {} })
      }
    },
    async updateConversation({
      conversationId,
      metadata,
    }: {
      conversationId: string
      metadata: Record<string, unknown>
    }) {
      const row = conversations.get(conversationId)
      if (!row) throw missingConversation('updateConversation')
      row.metadata = { ...row.metadata, ...metadata }
      return row
    },
  }

  const result = await writeWorkspaceFile(
    { store, sandbox: createSandbox(written) },
    'conv-1',
    'index.html',
    '<html></html>',
  )

  assert.equal(result.path, 'index.html')
  assert.ok([...written.keys()].some(path => path.endsWith('/index.html')))
  const snapshot = conversations.get('conv-1')?.metadata?.workspaceSnapshot as Record<string, { content: string }>
  assert.equal(snapshot['index.html']?.content, '<html></html>')
})

test('writeWorkspaceFile still succeeds when snapshot persistence fails', async () => {
  const written = new Map<string, string>()
  const store = {
    async getConversation() {
      throw missingConversation('getConversation')
    },
    async appendMessage() {
      throw new Error('store unavailable')
    },
    async updateConversation() {
      throw missingConversation('updateConversation')
    },
  }

  const result = await writeWorkspaceFile(
    { store, sandbox: createSandbox(written) },
    'conv-1',
    'index.html',
    '<html></html>',
  )

  assert.equal(result.path, 'index.html')
  assert.ok([...written.keys()].some(path => path.endsWith('/index.html')))
})
