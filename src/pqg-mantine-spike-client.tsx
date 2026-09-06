import { Button, MantineProvider } from '@mantine/core'
// @ts-expect-error Vite bundles Mantine's exported CSS file; it has no TypeScript declaration.
import '@mantine/core/styles.layer.css'

export {}

type ReactApi = {
  createElement: (...args: any[]) => unknown
}

type ClientContext = {
  slots: {
    inject(name: string, register: () => unknown): unknown
    register(options: Record<string, unknown>, component: () => unknown): unknown
  }
}

const React = require('react') as ReactApi
const inject = ['slots']

function spikeRoot(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined
  return document.getElementById('pqg-mantine-spike') ?? undefined
}

function MantineSpikeSection(): unknown {
  return React.createElement(
    'div',
    { id: 'pqg-mantine-spike' },
    React.createElement(
      MantineProvider,
      {
        cssVariablesSelector: '#pqg-mantine-spike',
        deduplicateCssVariables: false,
        forceColorScheme: 'light',
        getRootElement: spikeRoot,
        withGlobalClasses: false,
      },
      React.createElement(Button, { size: 'sm' }, 'Mantine compatibility'),
    ),
  )
}

function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'pqg-mantine-spike',
    order: 17,
    label: () => 'Mantine Spike',
  }, MantineSpikeSection))
}

module.exports = { inject, apply }
