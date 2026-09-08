export const TASK_CONVERSATION_ID = 'pqg-internal-tasks-v1'
const TASK_METADATA_KIND = 'pqg-task'
const TASK_PAGE_LIMIT = 100

export interface TaskRecord {
  id: string
  title: string
  completed: boolean
  dueDate?: string
}

export interface CreateTaskInput {
  title: string
  dueDate?: string
}

export interface UpdateTaskInput {
  title?: string
  completed?: boolean
  dueDate?: string | null
}

type StoreMessage = {
  messageId?: unknown
  content?: unknown
  metadata?: unknown
}

function taskStore(context: any): any {
  if (!context?.store) throw new Error('PQG task store is unavailable')
  return context.store
}

function normalizeTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim() : ''
  if (!title) throw new Error('Task title is required')
  return title
}

function normalizeDueDate(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const dueDate = typeof value === 'string' ? value.trim() : ''
  return dueDate || undefined
}

function taskFromMessage(message: StoreMessage): TaskRecord | undefined {
  const metadata = message.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined
  const record = metadata as Record<string, unknown>
  if (record.kind !== TASK_METADATA_KIND || typeof message.messageId !== 'string' || typeof message.content !== 'string') {
    return undefined
  }
  if (typeof record.completed !== 'boolean') return undefined
  const dueDate = normalizeDueDate(record.dueDate)
  return {
    id: message.messageId,
    title: message.content,
    completed: record.completed,
    ...(dueDate === undefined ? {} : { dueDate }),
  }
}

function taskMetadata(completed: boolean, dueDate?: string): Record<string, unknown> {
  return {
    kind: TASK_METADATA_KIND,
    completed,
    ...(dueDate === undefined ? {} : { dueDate }),
  }
}

async function taskMessages(context: any): Promise<StoreMessage[]> {
  const messages = await taskStore(context).getMessages({
    conversationId: TASK_CONVERSATION_ID,
    limit: TASK_PAGE_LIMIT,
    order: 'asc',
  })
  return Array.isArray(messages) ? messages : []
}

export async function listTasks(context: any): Promise<TaskRecord[]> {
  return (await taskMessages(context))
    .map(taskFromMessage)
    .filter((task): task is TaskRecord => task !== undefined)
}

export async function createTask(context: any, input: CreateTaskInput): Promise<TaskRecord> {
  const title = normalizeTitle(input?.title)
  const dueDate = normalizeDueDate(input?.dueDate)
  const messageId = await taskStore(context).appendMessage({
    conversationId: TASK_CONVERSATION_ID,
    role: 'system',
    content: title,
    metadata: taskMetadata(false, dueDate),
  })
  if (typeof messageId !== 'string' || !messageId) throw new Error('Task store returned an invalid message id')
  return {
    id: messageId,
    title,
    completed: false,
    ...(dueDate === undefined ? {} : { dueDate }),
  }
}

export async function updateTask(
  context: any,
  taskId: string,
  patch: UpdateTaskInput,
): Promise<TaskRecord> {
  const id = typeof taskId === 'string' ? taskId.trim() : ''
  if (!id) throw new Error('Task id is required')
  const currentMessage = (await taskMessages(context)).find(message => message.messageId === id)
  const current = currentMessage === undefined ? undefined : taskFromMessage(currentMessage)
  if (!current) throw new Error(`Task "${id}" not found`)

  const title = patch.title === undefined ? current.title : normalizeTitle(patch.title)
  const completed = patch.completed === undefined ? current.completed : patch.completed
  if (typeof completed !== 'boolean') throw new Error('Task completed state must be boolean')
  const dueDate = Object.prototype.hasOwnProperty.call(patch, 'dueDate')
    ? normalizeDueDate(patch.dueDate)
    : current.dueDate

  const updated = await taskStore(context).updateMessage({
    conversationId: TASK_CONVERSATION_ID,
    messageId: id,
    content: title,
    metadata: taskMetadata(completed, dueDate),
  })
  const task = taskFromMessage(updated)
  if (!task) throw new Error('Task store returned an invalid updated message')
  return task
}
