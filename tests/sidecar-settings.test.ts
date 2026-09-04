import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { restoreDshSettingsYaml, snapshotDshSettingsYaml } from '../agents/_dsh-web-sidecar.ts'

function missingConversation(action: string) {
  return Object.assign(new Error(`Conversation not found by ${action}.`), {
    code: 'MemoryNotFoundError',
  })
}

function createStore(conversations = new Map<string, { metadata: Record<string, unknown> }>()) {
  return {
    conversations,
    async getConversation({ conversationId }: { conversationId: string }) {
      const row = conversations.get(conversationId)
      if (!row) throw missingConversation('getConversation')
      return row
    },
    async appendMessage({ conversationId }: { conversationId: string }) {
      if (!conversations.has(conversationId)) conversations.set(conversationId, { metadata: {} })
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
}

test('restoreDshSettingsYaml writes the stored document into DSH_HOME', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-settings-'))
  const store = createStore(new Map([
    ['conv-1', { metadata: { dshSettingsYaml: 'locale:\n  preference: en\n' } }],
  ]))
  try {
    assert.equal(await restoreDshSettingsYaml({ store }, 'conv-1', home), true)
    assert.equal(
      await readFile(join(home, 'settings.yaml'), 'utf8'),
      'locale:\n  preference: en\n',
    )
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('restoreDshSettingsYaml skips a missing conversation', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-settings-'))
  try {
    assert.equal(await restoreDshSettingsYaml({ store: createStore() }, 'conv-1', home), false)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('snapshotDshSettingsYaml persists settings.yaml onto a new conversation', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-settings-'))
  const store = createStore()
  try {
    await writeFile(join(home, 'settings.yaml'), 'ui-theme:\n  preference: dark\n')
    assert.equal(await snapshotDshSettingsYaml({ store }, 'conv-1', home), true)
    assert.equal(
      store.conversations.get('conv-1')?.metadata?.dshSettingsYaml,
      'ui-theme:\n  preference: dark\n',
    )
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('snapshotDshSettingsYaml is a no-op when the file is absent', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-settings-'))
  const store = createStore()
  try {
    assert.equal(await snapshotDshSettingsYaml({ store }, 'conv-1', home), false)
    assert.equal(store.conversations.has('conv-1'), false)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
