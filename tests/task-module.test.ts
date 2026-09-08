import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

import * as cordisModule from '@deepseek-ai/cordis'
import { Context } from '@deepseek-ai/cordis'
import * as slotCoreModule from '@deepseek-ai/dsh-client-ui-slots'

const require = createRequire(import.meta.url)
const serviceUrl = new URL('../packages/task-module/src/service.ts', import.meta.url)
const permissionUrl = new URL('../agents/_makers-mcp-permission.mjs', import.meta.url)
const runtimeBundleUrl = new URL('../public/plugins/@deepseek-ai/dsh-client-runtime/client.js', import.meta.url)
const shellBundleUrl = new URL('../public/plugins/@pqg/application-shell/client.js', import.meta.url)
const taskBundleUrl = new URL('../public/plugins/@pqg/task-module/client.js', import.meta.url)

type StoreMessage = {
  messageId: string
  role: string
  content: unknown
  metadata?: Record<string, unknown>
  createdAt: number
  updatedAt?: number
}

type PluginModule = {
  inject: string[]
  apply(ctx: Context): void | Promise<void>
}

type SlotRegistryFace = {
  entries(key: string): readonly unknown[]
}

async function loadHandoff(
  url: URL,
  expectedId: string,
  globals: Record<string, unknown> = {},
) {
  const source = await readFile(url, 'utf8')
  const handoffs: Array<{ id: string; factory: (requireModule: (id: string) => unknown) => any }> = []
  vm.runInNewContext(source, {
    queueMicrotask,
    ...globals,
    window: {
      __ModuleLoader__: {
        load(handoff: { id: string; factory: (requireModule: (id: string) => unknown) => any }) {
          handoffs.push(handoff)
        },
      },
    },
  }, { filename: url.pathname.split('/').at(-1) })
  assert.equal(handoffs.length, 1)
  assert.equal(handoffs[0]?.id, expectedId)
  return handoffs[0]!
}

async function loadPlugin(
  url: URL,
  expectedId: string,
  globals: Record<string, unknown> = {},
): Promise<PluginModule> {
  const handoff = await loadHandoff(url, expectedId, globals)
  return handoff.factory((id: string) => {
    if (id === 'react' || id === 'react/jsx-runtime' || id === 'react-dom' || id === 'react-dom/client') return require(id)
    throw new Error(`unexpected external module in ${expectedId}: ${id}`)
  }) as PluginModule
}

async function loadRuntimeSlotRegistry(): Promise<any> {
  const handoff = await loadHandoff(runtimeBundleUrl, '@deepseek-ai/dsh-client-runtime')
  const runtime = handoff.factory((id: string) => {
    if (id === '@deepseek-ai/cordis') return cordisModule
    if (id === '@deepseek-ai/dsh-client-ui-slots') return slotCoreModule
    throw new Error(`unexpected external module in DSH runtime: ${id}`)
  }) as { SlotRegistry?: unknown }
  assert.equal(typeof runtime.SlotRegistry, 'function')
  return runtime.SlotRegistry
}

function fakeContext() {
  const messages: StoreMessage[] = []
  let sequence = 0
  return {
    store: {
      async appendMessage(input: any) {
        const messageId = `msg_${String(++sequence)}`
        messages.push({
          messageId,
          role: input.role,
          content: input.content,
          metadata: input.metadata,
          createdAt: sequence,
        })
        return messageId
      },
      async getMessages(input: any) {
        let rows = messages.slice()
        if (input.after) {
          const index = rows.findIndex(message => message.messageId === input.after)
          rows = index < 0 ? [] : rows.slice(index + 1)
        }
        if (input.order === 'desc') rows.reverse()
        return rows.slice(0, input.limit ?? 20)
      },
      async updateMessage(input: any) {
        const message = messages.find(row => row.messageId === input.messageId)
        if (!message) throw new Error('Message not found')
        if ('content' in input) message.content = input.content
        if ('metadata' in input) message.metadata = input.metadata
        message.updatedAt = ++sequence
        return { ...message }
      },
    },
  }
}

test('Task service creates, lists and updates one authoritative Store message per task', async () => {
  assert.equal(existsSync(serviceUrl), true, 'Task service must exist before behavior can be exercised')
  const { TASK_CONVERSATION_ID, createTask, listTasks, updateTask } = await import(serviceUrl.href)
  const context = fakeContext()

  const created = await createTask(context, {
    title: '  Soạn báo cáo tuần  ',
    dueDate: '2026-09-08',
  })
  assert.deepEqual(created, {
    id: 'msg_1',
    title: 'Soạn báo cáo tuần',
    completed: false,
    dueDate: '2026-09-08',
  })
  assert.equal(TASK_CONVERSATION_ID, 'pqg-internal-tasks-v1')

  assert.deepEqual(await listTasks(context), [created])

  const updated = await updateTask(context, created.id, {
    title: 'Báo cáo tuần đã duyệt',
    completed: true,
  })
  assert.deepEqual(updated, {
    id: 'msg_1',
    title: 'Báo cáo tuần đã duyệt',
    completed: true,
    dueDate: '2026-09-08',
  })
  assert.deepEqual(await listTasks(context), [updated])
})

test('generated Makers permission plugin honors module tool metadata and keeps unknown tools gated', async () => {
  const { makersMcpPermissionSource } = await import(permissionUrl.href)
  const source = makersMcpPermissionSource({
    pqg_task_list: 'read-only',
    pqg_task_create: 'workspace-write',
    pqg_task_update: 'workspace-write',
  })
  const generated = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

  assert.equal(generated.makersToolGate('read-only', 'pqg_task_list'), 'allow')
  assert.equal(generated.makersToolGate('read-only', 'pqg_task_create'), 'ask')
  assert.equal(generated.makersToolGate('workspace-write', 'pqg_task_create'), 'allow')
  assert.equal(generated.makersToolGate('danger-full-access', 'pqg_task_update'), 'allow')
  assert.equal(generated.makersToolGate('danger-full-access', 'pqg_unknown_action'), 'ask')
})

test('Task module is wired through the existing PQG module, build and permission seams', async () => {
  const taskPackageUrl = new URL('../packages/task-module/package.json', import.meta.url)
  const clientUrl = new URL('../packages/task-module/src/client.tsx', import.meta.url)
  const makersUrl = new URL('../packages/task-module/src/makers.ts', import.meta.url)
  const apiUrl = new URL('../agents/api/pqg.tasks.ts', import.meta.url)
  assert.equal(existsSync(taskPackageUrl), true, 'Task package manifest must be installed as a PQG module')
  assert.equal(existsSync(clientUrl), true, 'Task client contribution must exist')
  assert.equal(existsSync(makersUrl), true, 'Task Makers adapter must exist')
  assert.equal(existsSync(apiUrl), true, 'Task HTTP adapter must exist')
})

test('Task client keeps its own build producer without rewriting the Reference producer', async () => {
  const source = await readFile(new URL('../scripts/prepare-dsh-web.mjs', import.meta.url), 'utf8')
  assert.match(source, /async function preparePqgReferenceModuleClient\(\)/)
  assert.match(source, /async function preparePqgTaskModuleClient\(\)/)
  assert.doesNotMatch(source, /async function preparePqgModuleClient\(id, entry, inject\)/)
})

test('Task Home contribution is a dashboard card with real today tasks and a route affordance', async () => {
  const source = await readFile(new URL('../packages/task-module/src/client.tsx', import.meta.url), 'utf8')
  const start = source.indexOf('function TaskHomeWidget')
  const end = source.indexOf('\nasync function apply', start)
  assert.ok(start >= 0 && end > start, 'TaskHomeWidget must exist')
  const widget = source.slice(start, end)
  assert.match(widget, /data-pqg-task-home-card/)
  assert.match(widget, /Việc cần làm hôm nay/)
  assert.match(widget, /Xem công việc/)
  assert.match(widget, /onClick: \(\) => navigate\(TASK_ID\)/)
  assert.match(widget, /dueToday/)
  assert.doesNotMatch(widget, /\b5\b/)
})

test('prepared Task contribution activates on Home before a DSH session exists', async () => {
  const SlotRegistry = await loadRuntimeSlotRegistry()
  const shell = await loadPlugin(shellBundleUrl, '@pqg/application-shell')
  const task = await loadPlugin(taskBundleUrl, '@pqg/task-module', {
    fetch: async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/api/pqg.modules')) {
        return {
          ok: true,
          json: async () => ({ modules: [{ id: 'task', label: 'Công việc', enabled: true }] }),
        }
      }
      if (url.endsWith('/api/pqg.tasks')) {
        return { ok: true, json: async () => ({ tasks: [] }) }
      }
      throw new Error(`unexpected Task request: ${url}`)
    },
  })
  const sessions = {
    list: {
      getSnapshot: () => ({ current: undefined }),
      subscribe: (_listener: () => void) => () => {},
    },
  }

  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('sessions', sessions as never)
  const slots = ctx.get('slots') as unknown as SlotRegistryFace
  const shellFiber = ctx.plugin({ inject: [...shell.inject], apply: shell.apply })
  await shellFiber.await()
  const taskFiber = ctx.plugin({ inject: [...task.inject], apply: task.apply })
  await taskFiber.await()

  assert.equal(slots.entries('pqg.shell.navigation').length, 1)
  assert.equal(slots.entries('pqg.shell.workspace').length, 1)
  assert.equal(slots.entries('pqg.shell.home.widget').length, 1)

  await taskFiber.dispose()
  await shellFiber.dispose()
})

test('Task client leaves Makers request routing to the page bootstrap instead of a DSH session id', async () => {
  const source = await readFile(new URL('../packages/task-module/src/client.tsx', import.meta.url), 'utf8')
  assert.match(source, /const inject = \['slots', 'pqgShell'\]/)
  assert.doesNotMatch(source, /makers-conversation-id/)
  assert.doesNotMatch(source, /sessions\.list/)
})

test('module settings scopes module-state GET and PUT requests to the current Makers conversation', async () => {
  const source = await readFile(new URL('../src/pqg-module-settings-client.ts', import.meta.url), 'utf8')
  assert.match(source, /const inject = \['slots', 'sessions'\]/)
  assert.match(source, /sessions\.list\.getSnapshot\(\)\.current/)
  assert.match(source, /['"]makers-conversation-id['"]/)
})

test('module settings reload the shell after a successful toggle so Task navigation follows policy', async () => {
  const source = await readFile(new URL('../src/pqg-module-settings-client.ts', import.meta.url), 'utf8')
  const toggleStart = source.indexOf('const toggle =')
  const toggleEnd = source.indexOf('\n  }\n\n  return createElement', toggleStart)
  assert.ok(toggleStart >= 0 && toggleEnd > toggleStart, 'module toggle handler must exist')
  const toggleBlock = source.slice(toggleStart, toggleEnd)
  const successStart = toggleBlock.indexOf('updated => {')
  const reloadStart = toggleBlock.indexOf('window.location.reload()')
  const failureStart = toggleBlock.indexOf('cause => {', successStart)
  assert.ok(successStart >= 0 && reloadStart > successStart, 'successful toggle must reload the shell')
  assert.ok(failureStart > reloadStart, 'reload must happen before the failure handler')
  assert.equal((toggleBlock.match(/window\.location\.reload\(\)/g) ?? []).length, 1)
})

test('prepared DSH Web boot graph includes the Task client contribution', async () => {
  const preparedClient = new URL('../public/plugins/@pqg/task-module/client.js', import.meta.url)
  assert.equal(existsSync(preparedClient), true, 'prepare:dsh-web must emit the Task client bundle')
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(html, /@pqg\/task-module/)
})
