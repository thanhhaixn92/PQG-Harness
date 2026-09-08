import { z } from 'zod'
import { createTask, listTasks, updateTask } from './service.ts'

type MakersPermissionMode = 'read-only' | 'workspace-write' | 'danger-full-access'
type MakersResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

type MakersAdapterInput = {
  moduleId: string
  bridge: {
    registerModuleTool(
      moduleId: string,
      name: string,
      config: {
        description: string
        inputSchema?: Record<string, unknown>
        permission: MakersPermissionMode
      },
      callback: (args: any, extra: { signal?: AbortSignal }, context: any) => Promise<MakersResult>,
    ): unknown
  }
}

function result(value: unknown): MakersResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}

function failure(error: unknown): MakersResult {
  return {
    content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
    isError: true,
  }
}

export function apply({ moduleId, bridge }: MakersAdapterInput) {
  bridge.registerModuleTool(
    moduleId,
    'pqg_task_list',
    {
      description: 'List the user tasks stored by the PQG Task module.',
      inputSchema: {},
      permission: 'read-only',
    },
    async (_args, _extra, context) => {
      try {
        return result({ tasks: await listTasks(context) })
      } catch (error) {
        return failure(error)
      }
    },
  )

  bridge.registerModuleTool(
    moduleId,
    'pqg_task_create',
    {
      description: 'Create one task in the PQG Task module.',
      inputSchema: {
        title: z.string().min(1),
        dueDate: z.string().optional(),
      },
      permission: 'workspace-write',
    },
    async ({ title, dueDate }, _extra, context) => {
      try {
        return result({ task: await createTask(context, { title, dueDate }) })
      } catch (error) {
        return failure(error)
      }
    },
  )

  bridge.registerModuleTool(
    moduleId,
    'pqg_task_update',
    {
      description: 'Update the title, completion state, or due date of one PQG task.',
      inputSchema: {
        id: z.string().min(1),
        title: z.string().min(1).optional(),
        completed: z.boolean().optional(),
        dueDate: z.string().nullable().optional(),
      },
      permission: 'workspace-write',
    },
    async ({ id, title, completed, dueDate }, _extra, context) => {
      try {
        return result({ task: await updateTask(context, id, { title, completed, dueDate }) })
      } catch (error) {
        return failure(error)
      }
    },
  )
}
