import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ensureWorkspace,
  isSensitiveWorkspacePath,
  listWorkspace,
  normalizeWorkspacePath,
  persistWorkspaceCheckpoint,
  publishWorkspacePreview,
  readWorkspaceFile,
  runWorkspaceCommand,
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
      exists: async () => true,
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

test('native restore wins over legacy metadata', async () => {
  const written = new Map<string, string>()
  let restoreCalls = 0
  let storeReads = 0
  const context = {
    sandbox: {
      files: {
        makeDir: async () => {},
        exists: async () => false,
        write: async (path: string, content: string) => { written.set(path, content) },
      },
      commands: {
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      },
      async restore({ path, timeout }: { path: string; timeout: number }) {
        restoreCalls += 1
        assert.equal(path, 'projects/conv-1/workspace')
        assert.equal(timeout, 180)
        return { restored: true }
      },
    },
    store: {
      async getConversation() {
        storeReads += 1
        return { metadata: { workspaceSnapshot: { 'legacy.txt': { content: 'legacy', updatedAt: 1 } } } }
      },
    },
  }

  await ensureWorkspace(context, 'conv-1')
  assert.equal(restoreCalls, 1)
  assert.equal(storeReads, 0)
  assert.equal(written.get('projects/conv-1/workspace/.pqg-workspace-ready'), 'v1\n')
})

test('legacy snapshot migrates only after native not_found', async () => {
  const written = new Map<string, string>()
  const metadataUpdates: Record<string, unknown>[] = []
  let restoreCalls = 0
  let persistCalls = 0
  const context = {
    sandbox: {
      files: {
        makeDir: async () => {},
        exists: async () => false,
        write: async (path: string, content: string) => { written.set(path, content) },
      },
      commands: {
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      },
      async restore() {
        restoreCalls += 1
        return { restored: false, reason: 'not_found' }
      },
      async persist() {
        persistCalls += 1
        return { size: 10, sha256: 'sha', etag: 'etag', persistedAt: '2026-09-04T00:00:00Z' }
      },
    },
    store: {
      async getConversation() {
        return { metadata: { workspaceSnapshot: { 'legacy.txt': { content: 'legacy', updatedAt: 1 } } } }
      },
      async updateConversation({ metadata }: { metadata: Record<string, unknown> }) {
        metadataUpdates.push(metadata)
      },
    },
  }

  await ensureWorkspace(context, 'conv-1')
  assert.equal(restoreCalls, 1)
  assert.equal(persistCalls, 1)
  assert.equal(written.get('projects/conv-1/workspace/legacy.txt'), 'legacy')
  assert.equal(written.get('projects/conv-1/workspace/.pqg-workspace-ready'), 'v1\n')
  assert.deepEqual(metadataUpdates.at(-1)?.workspaceSnapshot, {})
  assert.equal(typeof metadataUpdates.at(-1)?.workspaceSnapshotMigratedAt, 'number')
})

test('restore failure never persists an incomplete workspace', async () => {
  const written = new Map<string, string>()
  let persistCalls = 0
  const context = {
    sandbox: {
      files: {
        makeDir: async () => {},
        exists: async () => false,
        write: async (path: string, content: string) => { written.set(path, content) },
      },
      commands: {
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      },
      async restore() {
        throw new Error('restore unavailable')
      },
      async persist() {
        persistCalls += 1
        return { size: 0, sha256: '', etag: '', persistedAt: '' }
      },
    },
  }

  await assert.rejects(() => ensureWorkspace(context, 'conv-1'), /restore unavailable/)
  assert.equal(persistCalls, 0)
  assert.equal(written.has('projects/conv-1/workspace/.pqg-workspace-ready'), false)
})

test('ready marker skips duplicate restore on a live sandbox', async () => {
  let restoreCalls = 0
  const context = {
    sandbox: {
      files: {
        makeDir: async () => {},
        exists: async (path: string) => path.endsWith('/.pqg-workspace-ready'),
        write: async () => {},
      },
      commands: {
        run: async () => { throw new Error('legacy emptiness probe must not run') },
      },
      async restore() {
        restoreCalls += 1
        return { restored: true }
      },
    },
  }

  await ensureWorkspace(context, 'conv-1')
  assert.equal(restoreCalls, 0)
})

test('junk file without marker does not suppress native restore', async () => {
  let restoreCalls = 0
  const context = {
    sandbox: {
      files: {
        makeDir: async () => {},
        exists: async () => false,
        write: async () => {},
      },
      commands: {
        run: async () => ({ exitCode: 0, stdout: './junk.txt\n', stderr: '' }),
      },
      async restore() {
        restoreCalls += 1
        return { restored: true }
      },
    },
  }

  await ensureWorkspace(context, 'conv-1')
  assert.equal(restoreCalls, 1)
})

test('automatic workspace read and write tools reject sensitive paths before file I/O', async () => {
  let reads = 0
  let writes = 0
  const sandbox = {
    files: {
      makeDir: async () => {},
      exists: async () => true,
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
    files: {
      makeDir: async () => {},
      exists: async () => true,
    },
    commands: {
      async run() {
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

test('writeWorkspaceFile checkpoints after writing before reporting durable success', async () => {
  const events: string[] = []
  const sandbox = {
    files: {
      makeDir: async () => {},
      exists: async () => true,
      async write() { events.push('write') },
    },
    commands: {
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    },
    async persist() {
      events.push('persist')
      return { size: 12, sha256: 'sha-write', etag: 'etag-write', persistedAt: '2026-09-04T00:00:00Z' }
    },
  }

  const result = await writeWorkspaceFile({ sandbox }, 'conv-1', 'index.html', '<html></html>')

  assert.deepEqual(events, ['write', 'persist'])
  assert.equal(result.persisted, true)
  assert.equal(result.checkpoint.sha256, 'sha-write')
})

test('writeWorkspaceFile rejects when checkpoint persistence fails after the write', async () => {
  let wrote = false
  const sandbox = {
    files: {
      makeDir: async () => {},
      exists: async () => true,
      async write() { wrote = true },
    },
    commands: {
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    },
    async persist() {
      throw new Error('checkpoint unavailable')
    },
  }

  await assert.rejects(
    () => writeWorkspaceFile({ sandbox }, 'conv-1', 'index.html', '<html></html>'),
    /checkpoint persistence failed: checkpoint unavailable/,
  )
  assert.equal(wrote, true)
})

test('runWorkspaceCommand persists after a successful command', async () => {
  let persistCalls = 0
  const sandbox = {
    files: {
      makeDir: async () => {},
      exists: async () => true,
    },
    commands: {
      run: async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }),
    },
    async persist() {
      persistCalls += 1
      return { size: 1, sha256: 'sha-command', etag: 'etag-command', persistedAt: '2026-09-04T00:00:00Z' }
    },
  }

  const result = await runWorkspaceCommand({ sandbox }, 'conv-1', 'printf ok')
  assert.equal(persistCalls, 1)
  assert.equal(result.persistence.persisted, true)
  assert.equal(result.stdout, 'ok')
})

test('runWorkspaceCommand persists even when the command exits nonzero', async () => {
  let persistCalls = 0
  const sandbox = {
    files: {
      makeDir: async () => {},
      exists: async () => true,
    },
    commands: {
      run: async () => ({ exitCode: 7, stdout: '', stderr: 'failed' }),
    },
    async persist() {
      persistCalls += 1
      return { size: 1, sha256: 'sha-failed', etag: 'etag-failed', persistedAt: '2026-09-04T00:00:00Z' }
    },
  }

  const result = await runWorkspaceCommand({ sandbox }, 'conv-1', 'false')
  assert.equal(result.exitCode, 7)
  assert.equal(persistCalls, 1)
  assert.equal(result.persistence.persisted, true)
})

test('runWorkspaceCommand reports checkpoint persistence failure without hiding command output', async () => {
  const sandbox = {
    files: {
      makeDir: async () => {},
      exists: async () => true,
    },
    commands: {
      run: async () => ({ exitCode: 0, stdout: 'changed files', stderr: '' }),
    },
    async persist() {
      throw new Error('persist failed')
    },
  }

  const result = await runWorkspaceCommand({ sandbox }, 'conv-1', 'touch changed.txt')
  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout, 'changed files')
  assert.equal(result.persistence.persisted, false)
  assert.equal(result.persistence.error, 'persist failed')
})

test('publishWorkspacePreview keeps sandbox access credentials out of model-visible result', async () => {
  const conversations = new Map<string, { metadata: Record<string, unknown> }>([
    ['conv-1', { metadata: {} }],
  ])
  const context = {
    sandbox: {
      files: {
        makeDir: async () => {},
        exists: async () => true,
      },
      commands: {
        async run() {
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
