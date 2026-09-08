import {
  Badge,
  Button,
  Checkbox,
  Group,
  NavLink,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ShellSystemServices } from '@pqg/application-shell/contracts'

interface TaskRecord {
  id: string
  title: string
  completed: boolean
  dueDate?: string
}

type ModuleState = {
  id: string
  enabled: boolean
}

type ReactApi = {
  createElement: (...args: any[]) => any
  useEffect(effect: () => void | (() => void), deps: unknown[]): void
  useState<T>(initial: T | (() => T)): [T, (value: T | ((current: T) => T)) => void]
}

const React = require('react') as ReactApi
const inject = ['slots', 'pqgShell']
const TASK_ID = 'task'

async function taskModuleEnabled(): Promise<boolean> {
  try {
    const response = await fetch('/api/pqg.modules', { headers: { accept: 'application/json' } })
    if (!response.ok) return false
    const body = await response.json() as { modules?: ModuleState[] }
    return Array.isArray(body.modules)
      && body.modules.some(module => module.id === TASK_ID && module.enabled === true)
  } catch {
    return false
  }
}

async function taskRequest<T>(method: 'GET' | 'POST' | 'PATCH', body?: unknown): Promise<T> {
  const response = await fetch('/api/pqg.tasks', {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } } & T
  if (!response.ok) throw new Error(payload.error?.message || 'Không thể cập nhật công việc')
  return payload
}

async function loadTasks(): Promise<TaskRecord[]> {
  const payload = await taskRequest<{ tasks?: TaskRecord[] }>('GET')
  return Array.isArray(payload.tasks) ? payload.tasks : []
}

function localDateKey(date = new Date()): string {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function TaskNavigation({ activeId, navigate }: PropsRuntime<'pqg.shell.navigation'>) {
  return React.createElement(NavLink, {
    label: 'Công việc',
    active: activeId === TASK_ID,
    onClick: () => navigate(TASK_ID),
    'data-pqg-task-nav': true,
  })
}

function TaskRow({
  task,
  onUpdated,
}: {
  task: TaskRecord
  onUpdated(task: TaskRecord): void
}) {
  const [title, setTitle] = React.useState(task.title)
  const [dueDate, setDueDate] = React.useState(task.dueDate ?? '')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    setTitle(task.title)
    setDueDate(task.dueDate ?? '')
    setError(undefined)
  }, [task.id, task.title, task.dueDate])

  const update = async (patch: Record<string, unknown>) => {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      const payload = await taskRequest<{ task: TaskRecord }>('PATCH', { id: task.id, ...patch })
      onUpdated(payload.task)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật công việc')
    } finally {
      setBusy(false)
    }
  }

  return React.createElement(
    Paper,
    { withBorder: true, radius: 'md', p: 'md', 'data-pqg-task-row': task.id },
    React.createElement(
      Stack,
      { gap: 'sm' },
      React.createElement(
        Group,
        { align: 'flex-start', wrap: 'nowrap' },
        React.createElement(Checkbox, {
          checked: task.completed,
          disabled: busy,
          onChange: (event: any) => { void update({ completed: event.currentTarget.checked }) },
          'aria-label': `Hoàn thành ${task.title}`,
        }),
        React.createElement(TextInput, {
          value: title,
          disabled: busy,
          onChange: (event: any) => setTitle(event.currentTarget.value),
          style: { flex: 1 },
          'aria-label': 'Tên công việc',
        }),
        React.createElement(Badge, {
          variant: 'light',
          color: task.completed ? 'teal' : 'blue',
        }, task.completed ? 'Đã xong' : 'Đang làm'),
      ),
      React.createElement(
        Group,
        { justify: 'space-between', align: 'flex-end' },
        React.createElement(TextInput, {
          type: 'date',
          value: dueDate,
          disabled: busy,
          label: 'Hạn hoàn thành',
          onChange: (event: any) => setDueDate(event.currentTarget.value),
        }),
        React.createElement(Button, {
          size: 'xs',
          variant: 'light',
          loading: busy,
          disabled: title.trim() === '',
          onClick: () => { void update({ title, dueDate: dueDate || null }) },
        }, 'Lưu'),
      ),
      error === undefined ? null : React.createElement(Text, { c: 'red', size: 'sm' }, error),
    ),
  )
}

function TaskWorkspace(_props: PropsRuntime<'pqg.shell.workspace'> & { matched: { moduleId: string } }) {
  const [tasks, setTasks] = React.useState<TaskRecord[]>([])
  const [title, setTitle] = React.useState('')
  const [dueDate, setDueDate] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | undefined>(undefined)

  const refresh = () => {
    setLoading(true)
    setError(undefined)
    void loadTasks().then(
      rows => {
        setTasks(rows)
        setLoading(false)
      },
      cause => {
        setError(cause instanceof Error ? cause.message : 'Không thể tải công việc')
        setLoading(false)
      },
    )
  }

  React.useEffect(() => {
    refresh()
  }, [])

  const create = async () => {
    if (busy || title.trim() === '') return
    setBusy(true)
    setError(undefined)
    try {
      const payload = await taskRequest<{ task: TaskRecord }>('POST', {
        title,
        ...(dueDate === '' ? {} : { dueDate }),
      })
      setTasks(current => [...current, payload.task])
      setTitle('')
      setDueDate('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo công việc')
    } finally {
      setBusy(false)
    }
  }

  const replaceTask = (updated: TaskRecord) => {
    setTasks(current => current.map(task => task.id === updated.id ? updated : task))
  }

  return React.createElement(
    Stack,
    { gap: 'lg', 'data-pqg-task-workspace': true },
    React.createElement(
      'div',
      null,
      React.createElement(Title, { order: 2 }, 'Công việc'),
      React.createElement(Text, { c: 'dimmed', mt: 4 }, 'Theo dõi những việc cần làm và hạn hoàn thành.'),
    ),
    React.createElement(
      Paper,
      { withBorder: true, radius: 'lg', p: 'md' },
      React.createElement(
        Stack,
        { gap: 'sm' },
        React.createElement(Text, { fw: 600 }, 'Thêm công việc'),
        React.createElement(
          Group,
          { align: 'flex-end' },
          React.createElement(TextInput, {
            label: 'Tên công việc',
            placeholder: 'Ví dụ: Hoàn thiện báo cáo tuần',
            value: title,
            onChange: (event: any) => setTitle(event.currentTarget.value),
            style: { flex: 1 },
          }),
          React.createElement(TextInput, {
            type: 'date',
            label: 'Hạn hoàn thành',
            value: dueDate,
            onChange: (event: any) => setDueDate(event.currentTarget.value),
          }),
          React.createElement(Button, {
            loading: busy,
            disabled: title.trim() === '',
            onClick: () => { void create() },
          }, 'Thêm'),
        ),
      ),
    ),
    error === undefined ? null : React.createElement(Text, { c: 'red' }, error),
    loading
      ? React.createElement(Text, { c: 'dimmed' }, 'Đang tải công việc…')
      : tasks.length === 0
        ? React.createElement(Text, { c: 'dimmed' }, 'Chưa có công việc nào.')
        : React.createElement(
            Stack,
            { gap: 'sm' },
            ...tasks.map(task => React.createElement(TaskRow, { key: task.id, task, onUpdated: replaceTask })),
          ),
  )
}

function TaskHomeWidget({ navigate }: PropsRuntime<'pqg.shell.home.widget'>) {
  const [tasks, setTasks] = React.useState<TaskRecord[]>([])
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    void loadTasks().then(
      rows => {
        setTasks(rows)
        setLoaded(true)
      },
      () => setLoaded(true),
    )
  }, [])

  const today = localDateKey()
  const dueToday = tasks.filter(task => !task.completed && task.dueDate === today)
  return React.createElement(
    Paper,
    {
      withBorder: true,
      radius: 'lg',
      p: 'lg',
      'data-pqg-task-home-card': true,
    },
    React.createElement(
      Stack,
      { gap: 'sm', 'data-pqg-task-home-widget': true },
      React.createElement(
        Group,
        { justify: 'space-between', align: 'center' },
        React.createElement(Text, { fw: 700 }, 'Việc cần làm hôm nay'),
        React.createElement(Button, {
          variant: 'subtle',
          size: 'compact-sm',
          onClick: () => navigate(TASK_ID),
        }, 'Xem công việc'),
      ),
      React.createElement(Badge, { variant: 'light', w: 'fit-content' }, loaded ? `${dueToday.length} việc` : 'Đang tải…'),
      loaded && dueToday.length === 0
        ? React.createElement(Text, { c: 'dimmed', size: 'sm' }, 'Không có việc đến hạn hôm nay.')
        : dueToday.slice(0, 4).map(task => React.createElement(
            Group,
            { key: task.id, gap: 'xs', wrap: 'nowrap' },
            React.createElement('span', { 'aria-hidden': true }, '•'),
            React.createElement(Text, { size: 'sm', lineClamp: 1 }, task.title),
          )),
    ),
  )
}

async function apply(ctx: ClientContext): Promise<void> {
  if (!(await taskModuleEnabled())) return
  const services = (ctx as ClientContext & { pqgShell: ShellSystemServices }).pqgShell

  ctx.effect(() => services.registerSearchProvider({
    id: TASK_ID,
    label: 'Công việc',
    async search(query) {
      const normalized = query.trim().toLocaleLowerCase('vi')
      if (!normalized) return []
      const tasks = await loadTasks()
      return tasks
        .filter(task => task.title.toLocaleLowerCase('vi').includes(normalized))
        .slice(0, 20)
        .map(task => ({
          id: task.id,
          label: task.title,
          description: task.completed
            ? 'Đã hoàn thành'
            : task.dueDate === undefined
              ? 'Chưa có hạn hoàn thành'
              : `Hạn ${task.dueDate}`,
          targetId: TASK_ID,
        }))
    },
  }))

  ctx.effect(() => services.registerSupportProvider({
    id: TASK_ID,
    supportFor(activeId) {
      if (activeId !== TASK_ID) return undefined
      return {
        title: 'Trợ lý công việc',
        summary: 'Tôi có thể giúp bạn xem, tạo và cập nhật công việc qua dữ liệu của mô-đun Công việc.',
        suggestions: [
          { id: 'today', label: 'Tóm tắt việc hôm nay', prompt: 'Tóm tắt các công việc cần làm hôm nay.' },
          { id: 'create', label: 'Tạo công việc mới', prompt: 'Giúp tôi tạo một công việc mới.' },
          { id: 'complete', label: 'Đánh dấu đã hoàn thành', prompt: 'Giúp tôi đánh dấu một công việc đã hoàn thành.' },
        ],
      }
    },
  }))

  ctx.slots.inject('pqg.shell.navigation', () => ctx.slots.register({
    name: 'pqg.shell.navigation',
    id: TASK_ID,
    order: 10,
    label: 'Công việc',
  }, TaskNavigation))

  ctx.slots.inject('pqg.shell.workspace', () => ctx.slots.register({
    name: 'pqg.shell.workspace',
    select: ({ activeId }) => activeId === TASK_ID ? { moduleId: TASK_ID } : null,
  }, TaskWorkspace))

  ctx.slots.inject('pqg.shell.home.widget', () => ctx.slots.register({
    name: 'pqg.shell.home.widget',
    id: TASK_ID,
    order: 10,
    label: 'Công việc',
  }, TaskHomeWidget))
}

module.exports = { inject, apply }
