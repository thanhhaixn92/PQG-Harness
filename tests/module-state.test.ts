import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  __setSidecarStarterForTests,
  acquireDshWebSidecar,
  applyModuleEnabledToLiveSidecars,
  stopDshWebSidecar,
} from '../agents/_dsh-web-sidecar.ts'
import { setModuleEnabled } from '../agents/_module-policy.ts'
import {
  applyModulePolicyToBridge,
  listInstalledModuleStates,
  setInstalledModuleEnabled,
} from '../agents/_module-state.ts'

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function moduleRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pqg-module-state-'))
  await writeJson(join(root, 'package.json'), {
    dependencies: { '@pqg/plugin-task': '1.0.0' },
  })
  const packageDir = join(root, 'node_modules', '@pqg', 'plugin-task')
  await mkdir(packageDir, { recursive: true })
  await writeJson(join(packageDir, 'package.json'), {
    name: '@pqg/plugin-task',
    pqg: { module: { id: 'task', label: 'Công việc', defaultEnabled: true } },
    exports: { './makers': './lib/makers.js' },
  })
  return root
}

function fakeContext(conversationId = 'conversation') {
  const conversations = new Map<string, { metadata: Record<string, unknown> }>()
  return {
    conversations,
    context: {
      conversation_id: conversationId,
      store: {
        async getConversation({ conversationId: id }: { conversationId: string }) {
          const conversation = conversations.get(id)
          if (conversation) return conversation
          const error = new Error('Conversation not found') as Error & { code?: string }
          error.code = 'MemoryNotFoundError'
          throw error
        },
        async appendMessage({ conversationId: id }: { conversationId: string }) {
          conversations.set(id, { metadata: {} })
        },
        async updateConversation({ conversationId: id, metadata }: { conversationId: string; metadata: Record<string, unknown> }) {
          conversations.set(id, { metadata })
        },
      },
    },
  }
}

test('installed module catalog uses package metadata plus persisted policy', async () => {
  const root = await moduleRoot()
  const { context } = fakeContext()
  try {
    assert.deepEqual(await listInstalledModuleStates(context, root), [{
      id: 'task',
      label: 'Công việc',
      enabled: true,
    }])

    await setInstalledModuleEnabled(context, 'task', false, root)
    assert.deepEqual(await listInstalledModuleStates(context, root), [{
      id: 'task',
      label: 'Công việc',
      enabled: false,
    }])
    await assert.rejects(
      setInstalledModuleEnabled(context, 'missing', true, root),
      /not installed/i,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('module catalog is empty when no PQG module is installed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pqg-module-state-empty-'))
  const { context } = fakeContext()
  try {
    await writeJson(join(root, 'package.json'), {})
    assert.deepEqual(await listInstalledModuleStates(context, root), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('stale policy for an uninstalled module is not exposed in the catalog', async () => {
  const root = await moduleRoot()
  const { context } = fakeContext()
  try {
    await setModuleEnabled(context, 'removed-module', false)
    assert.deepEqual(await listInstalledModuleStates(context, root), [{
      id: 'task',
      label: 'Công việc',
      enabled: true,
    }])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('uninstall hides a module without deleting its persisted enable override', async () => {
  const root = await moduleRoot()
  const { context } = fakeContext()
  try {
    await setInstalledModuleEnabled(context, 'task', false, root)

    await writeJson(join(root, 'package.json'), {})
    assert.deepEqual(await listInstalledModuleStates(context, root), [])

    await writeJson(join(root, 'package.json'), {
      dependencies: { '@pqg/plugin-task': '1.0.0' },
    })
    assert.deepEqual(await listInstalledModuleStates(context, root), [{
      id: 'task',
      label: 'Công việc',
      enabled: false,
    }])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('persisted policy seeds bridge state before future tool registration', async () => {
  const root = await moduleRoot()
  const { context } = fakeContext()
  const calls: Array<[string, boolean]> = []
  try {
    await setInstalledModuleEnabled(context, 'task', false, root)
    await applyModulePolicyToBridge(context, {
      setModuleEnabled(moduleId: string, enabled: boolean) {
        calls.push([moduleId, enabled])
      },
    } as any, root)
    assert.deepEqual(calls, [['task', false]])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('toggle with no live sidecar persists policy without starting one', async () => {
  const root = await moduleRoot()
  const { context } = fakeContext()
  let starts = 0
  __setSidecarStarterForTests(async () => {
    starts += 1
    throw new Error('sidecar must not start')
  })
  try {
    await setInstalledModuleEnabled(context, 'task', false, root)
    await applyModuleEnabledToLiveSidecars('task', false)
    assert.equal(starts, 0)
    assert.equal((await listInstalledModuleStates(context, root))[0]?.enabled, false)
  } finally {
    __setSidecarStarterForTests(undefined)
    await rm(root, { recursive: true, force: true })
  }
})

test('toggle propagates to every live sidecar in the current runtime', async () => {
  const calls = new Map<string, Array<[string, boolean]>>()
  __setSidecarStarterForTests(async (context, conversationId) => {
    const bridgeCalls: Array<[string, boolean]> = []
    calls.set(conversationId, bridgeCalls)
    return {
      conversationId,
      home: '/tmp/test',
      port: 1,
      child: {} as any,
      gateway: {} as any,
      mcp: {
        setModuleEnabled(moduleId: string, enabled: boolean) {
          bridgeCalls.push([moduleId, enabled])
        },
      } as any,
      lastUsedAt: Date.now(),
      context,
      async close() {},
    }
  })
  try {
    const a = fakeContext('project-a').context
    const b = fakeContext('project-b').context
    const leaseA = await acquireDshWebSidecar(a)
    const leaseB = await acquireDshWebSidecar(b)
    leaseA.release()
    leaseB.release()

    await applyModuleEnabledToLiveSidecars('task', false)
    assert.deepEqual(calls.get('project-a'), [['task', false]])
    assert.deepEqual(calls.get('project-b'), [['task', false]])
  } finally {
    await stopDshWebSidecar('project-a')
    await stopDshWebSidecar('project-b')
    __setSidecarStarterForTests(undefined)
  }
})
