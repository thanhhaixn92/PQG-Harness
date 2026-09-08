import { createTask, listTasks, updateTask } from '../../packages/task-module/src/service.ts'

async function requestJson(context: any): Promise<unknown> {
  const request = context.request
  if (typeof request?.json === 'function') return request.json()
  const body = request?.body
  if (typeof body === 'string') return body ? JSON.parse(body) : undefined
  if (body && typeof body === 'object') return body
  return undefined
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status })
}

function objectBody(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export async function onRequest(context: any): Promise<Response> {
  const method = String(context.request?.method || 'GET').toUpperCase()

  if (method === 'GET') {
    return Response.json({ tasks: await listTasks(context) })
  }

  if (method !== 'POST' && method !== 'PATCH') {
    return errorResponse(405, 'method-not-allowed', 'Method not allowed')
  }

  let body: Record<string, unknown> | undefined
  try {
    body = objectBody(await requestJson(context))
  } catch {
    return errorResponse(400, 'invalid-request', 'Dữ liệu công việc không hợp lệ')
  }
  if (!body) return errorResponse(400, 'invalid-request', 'Dữ liệu công việc không hợp lệ')

  try {
    if (method === 'POST') {
      if (typeof body.title !== 'string') {
        return errorResponse(400, 'invalid-request', 'Tên công việc là bắt buộc')
      }
      if (body.dueDate !== undefined && typeof body.dueDate !== 'string') {
        return errorResponse(400, 'invalid-request', 'Hạn hoàn thành không hợp lệ')
      }
      const task = await createTask(context, {
        title: body.title,
        ...(body.dueDate === undefined ? {} : { dueDate: body.dueDate }),
      })
      return Response.json({ task }, { status: 201 })
    }

    if (typeof body.id !== 'string') {
      return errorResponse(400, 'invalid-request', 'Mã công việc là bắt buộc')
    }
    if (body.title !== undefined && typeof body.title !== 'string') {
      return errorResponse(400, 'invalid-request', 'Tên công việc không hợp lệ')
    }
    if (body.completed !== undefined && typeof body.completed !== 'boolean') {
      return errorResponse(400, 'invalid-request', 'Trạng thái công việc không hợp lệ')
    }
    if (body.dueDate !== undefined && body.dueDate !== null && typeof body.dueDate !== 'string') {
      return errorResponse(400, 'invalid-request', 'Hạn hoàn thành không hợp lệ')
    }
    const task = await updateTask(context, body.id, {
      ...(body.title === undefined ? {} : { title: body.title }),
      ...(body.completed === undefined ? {} : { completed: body.completed }),
      ...(body.dueDate === undefined ? {} : { dueDate: body.dueDate as string | null }),
    })
    return Response.json({ task })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/not found/i.test(message)) {
      return errorResponse(404, 'task-not-found', 'Không tìm thấy công việc')
    }
    if (/required|must be boolean|invalid/i.test(message)) {
      return errorResponse(400, 'invalid-request', 'Dữ liệu công việc không hợp lệ')
    }
    if (/store is unavailable/i.test(message)) {
      return errorResponse(503, 'task-store-unavailable', 'Kho dữ liệu công việc chưa sẵn sàng')
    }
    throw error
  }
}
