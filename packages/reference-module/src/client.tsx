import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '../../application-shell/src/contracts.ts'

type ReactApi = {
  createElement: (...args: any[]) => any
}

const React = require('react') as ReactApi
const inject = ['slots']

function ReferenceNavigation({ activeId, navigate }: PropsRuntime<'pqg.shell.navigation'>) {
  return React.createElement(
    'button',
    {
      type: 'button',
      'data-pqg-reference-nav': true,
      'aria-current': activeId === 'reference' ? 'page' : undefined,
      onClick: () => navigate('reference'),
      style: {
        width: '100%',
        padding: '9px 12px',
        border: 0,
        borderRadius: 8,
        background: activeId === 'reference' ? 'var(--mantine-color-blue-light, #eef4ff)' : 'transparent',
        color: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        font: 'inherit',
      },
    },
    'Mô-đun mẫu',
  )
}

function ReferenceWorkspace(_props: PropsRuntime<'pqg.shell.workspace'> & { matched: { moduleId: string } }) {
  return React.createElement(
    'section',
    { 'data-pqg-reference-workspace': true, style: { padding: 8 } },
    React.createElement('h1', { style: { margin: '0 0 8px', fontSize: 24 } }, 'Mô-đun mẫu'),
    React.createElement('p', { style: { margin: 0, color: 'var(--mantine-color-dimmed, #667085)' } }, 'Mô-đun mẫu đã kết nối qua PQG Shell.'),
  )
}

function ReferenceHomeWidget(_props: PropsRuntime<'pqg.shell.home.widget'>) {
  return React.createElement('div', { 'data-pqg-reference-home-widget': true }, 'Mô-đun mẫu đã sẵn sàng.')
}

function ReferenceSearchProvider(_props: PropsRuntime<'pqg.shell.search.provider'>) {
  return null
}

function ReferenceSupportContext({ activeId }: PropsRuntime<'pqg.shell.support.context'>) {
  if (activeId !== 'reference') return null
  return React.createElement('p', { 'data-pqg-reference-support-context': true, style: { margin: 0, fontSize: 13 } }, 'Bạn đang ở Mô-đun mẫu.')
}

function ReferenceSupportSuggestion({ activeId }: PropsRuntime<'pqg.shell.support.suggestion'>) {
  if (activeId !== 'reference') return null
  return React.createElement('p', { 'data-pqg-reference-support-suggestion': true, style: { margin: 0, fontSize: 13 } }, 'Gợi ý theo ngữ cảnh sẽ xuất hiện tại đây.')
}

function apply(ctx: ClientContext): void {
  ctx.slots.inject('pqg.shell.navigation', () => ctx.slots.register({
    name: 'pqg.shell.navigation',
    id: 'reference',
    order: 0,
    label: 'Mô-đun mẫu',
  }, ReferenceNavigation))

  ctx.slots.inject('pqg.shell.workspace', () => ctx.slots.register({
    name: 'pqg.shell.workspace',
    select: ({ activeId }) => activeId === 'reference' ? { moduleId: 'reference' } : null,
  }, ReferenceWorkspace))

  ctx.slots.inject('pqg.shell.home.widget', () => ctx.slots.register({
    name: 'pqg.shell.home.widget',
    id: 'reference',
    order: 0,
    label: 'Mô-đun mẫu',
  }, ReferenceHomeWidget))

  ctx.slots.inject('pqg.shell.search.provider', () => ctx.slots.register({
    name: 'pqg.shell.search.provider',
    id: 'reference',
    order: 0,
    label: 'Mô-đun mẫu',
  }, ReferenceSearchProvider))

  ctx.slots.inject('pqg.shell.support.context', () => ctx.slots.register({
    name: 'pqg.shell.support.context',
    id: 'reference',
    order: 0,
    label: 'Mô-đun mẫu',
  }, ReferenceSupportContext))

  ctx.slots.inject('pqg.shell.support.suggestion', () => ctx.slots.register({
    name: 'pqg.shell.support.suggestion',
    id: 'reference',
    order: 0,
    label: 'Mô-đun mẫu',
  }, ReferenceSupportSuggestion))
}

module.exports = { inject, apply }
