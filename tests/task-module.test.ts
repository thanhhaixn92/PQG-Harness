import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const serviceUrl = new URL('../packages/task-module/src/service.ts', import.meta.url)
const permissionUrl = new URL('../agents/_makers-mcp-permission.mjs', import.meta.url)

type StoreMessage = {
  messageId: string
  role: string
  content: unknown
  metadata?: Record<string, unknown>
  createdAt: number
  updatedAt?: number
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

test('module settings reload the shell after a successful toggle so Task navigation follows policy', async () => {
  const source = await readFile(new URL('../src/pqg-module-settings-client.ts', import.meta.url), 'utf8')
  const successStart = source.indexOf('updated => {')
  const failureStart = source.indexOf('},\n      () => {', successStart)
  assert.ok(successStart >= 0 && failureStart > successStart, 'module toggle success handler must exist')
  const successBlock = source.slice(successStart, failureStart)
  assert.match(successBlock, /window\.location\.reload\(\)/)
})

test('prepared DSH Web boot graph includes the Task client contribution', async () => {
  const preparedClient = new URL('../public/plugins/@pqg/task-module/client.js', import.meta.url)
  assert.equal(existsSync(preparedClient), true, 'prepare:dsh-web must emit the Task client bundle')
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(html, /@pqg\/task-module/)
})
