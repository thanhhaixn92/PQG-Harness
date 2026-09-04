import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isSensitiveWorkspacePath,
  listWorkspace,
  normalizeWorkspacePath,
  persistWorkspaceCheckpoint,
  publishWorkspacePreview,
  readWorkspaceFile,
  workspaceRoot,
  writeWorkspaceFile,
} from '../agents/_workspace.ts'

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

test('common secret paths are sensitive while documentation templates remain visible', () => {
  assert.equal(isSensitiveWorkspacePath('.env'), true)
  assert.equal(isSensitiveWorkspacePath('.env.local'), true)
  assert.equal(isSensitiveWorkspacePath('.npmrc'), true)
  assert.equal(isSensitiveWorkspacePath('keys/id_ed25519'), true)
  assert.equal(isSensitiveWorkspacePath('certs/private.key'), true)
  assert.equal(isSensitiveWorkspacePath('service-account.json'), true)
  assert.equal(isSensitiveWorkspacePath('.env.example'), false)
  assert.equal(isSensitiveWorkspacePath('.env.sample'), false)
  assert.equal(isSensitiveWorkspacePath('.env.template'), false)
  assert.equal(isSensitiveWorkspacePath('src/app.ts'), false)
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
      read: async () => '',
      write: async (path: string, content: string) => { written.set(path, content) },
    },
    commands: {
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    },
  }
}

test('native workspace checkpoints serialize per conversation', async () => {
  let active = 0
  let maxActive = 0
  let calls = 0
  let releaseFirst!: () => void
  const firstGate = new Promise<void>(resolve => { releaseFirst = resolve })

  const context = {
    sandbox: {
      async persist({ path, timeout }: { path: string; timeout: number }) {
        assert.equal(path, 'projects/conv-1/workspace')
        assert.equal(timeout, 180)
        calls += 1
        const call = calls
        active += 1
        maxActive = Math.max(maxActive, active)
        if (call === 1) await firstGate
        active -= 1
        return {
          size: call,
          sha256: `sha-${call}`,
          etag: `etag-${call}`,
          persistedAt: `2026-09-04T00:00:0${call}Z`,
        }
      },
    },
  }

  const first = persistWorkspaceCheckpoint(context, 'conv-1', 'projects/conv-1/workspace')
  const second = persistWorkspaceCheckpoint(context, 'conv-1', 'projects/conv-1/workspace')

  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(calls, 1)
  assert.equal(maxActive, 1)

  releaseFirst()
  const [firstCheckpoint, secondCheckpoint] = await Promise.all([first, second])
  assert.equal(calls, 2)
  assert.equal(maxActive, 1)
  assert.equal(firstCheckpoint.sha256, 'sha-1')
  assert.equal(secondCheckpoint.sha256, 'sha-2')
})

test('automatic workspace read and write tools reject sensitive paths before file I/O', async () => {
  let reads = 0
  let writes = 0
  const sandbox = {
    files: {
      makeDir: async () => {},
      read: async () => { reads += 1; return 'SECRET' },
      write: async () => { writes += 1 },
    },
    commands: {
      run: async () => ({ exitCode: 0, stdout: './src\n', stderr: '' }),
    },
  }
  const context = { sandbox }

  await assert.rejects(
    () => readWorkspaceFile(context, 'conv-1', '.env'),
    /Sensitive workspace files/,
  )
  await assert.rejects(
    () => writeWorkspaceFile(context, 'conv-1', 'certs/private.key', 'SECRET'),
    /Sensitive workspace files/,
  )

  assert.equal(reads, 0)
  assert.equal(writes, 0)
})

test('workspace listing hides sensitive files but keeps safe templates', async () => {
  const sandbox = {
    files: { makeDir: async () => {} },
    commands: {
      async run(command: string) {
        if (command.includes('-mindepth 1 -maxdepth 1')) {
          return { exitCode: 0, stdout: './src\n', stderr: '' }
        }
        return {
          exitCode: 0,
          stdout: [
            'f\t1\t10\t./.env',
            'f\t1\t10\t./.env.example',
            'f\t1\t10\t./certs/private.key',
            'f\t1\t10\t./src/app.ts',
          ].join('\n'),
          stderr: '',
        }
      },
    },
  }

  const items = await listWorkspace({ sandbox }, 'conv-1')
  assert.deepEqual(items.map(item => item.path), ['.env.example', 'src/app.ts'])
})

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

test('publishWorkspacePreview keeps sandbox access credentials out of model-visible result', async () => {
  const conversations = new Map<string, { metadata: Record<string, unknown> }>([
    ['conv-1', { metadata: {} }],
  ])
  const context = {
    sandbox: {
      files: {
        makeDir: async () => {},
        exists: async () => false,
      },
      commands: {
        async run(command: string) {
          if (command.includes('-mindepth 1 -maxdepth 1')) {
            return { exitCode: 0, stdout: './src\n', stderr: '' }
          }
          return { exitCode: 0, stdout: '', stderr: '' }
        },
      },
      getHost: () => 'https://9000-test.sandbox.example.com',
      envdAccessToken: 'secret-token',
    },
    store: {
      async getConversation({ conversationId }: { conversationId: string }) {
        const row = conversations.get(conversationId)
        if (!row) throw missingConversation('getConversation')
        return row
      },
      async appendMessage({ conversationId }: { conversationId: string }) {
        if (!conversations.has(conversationId)) conversations.set(conversationId, { metadata: {} })
      },
      async updateConversation({ conversationId, metadata }: { conversationId: string; metadata: Record<string, unknown> }) {
        const row = conversations.get(conversationId)
        if (!row) throw missingConversation('updateConversation')
        row.metadata = { ...row.metadata, ...metadata }
      },
    },
  }

  const result = await publishWorkspacePreview(context, 'conv-1')
  assert.deepEqual(result, { published: true, framework: 'static' })
  const serialized = JSON.stringify(result)
  assert.equal(serialized.includes('secret-token'), false)
  assert.equal(serialized.includes('access_token'), false)
})
