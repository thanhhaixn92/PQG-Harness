import {
  AppShell,
  Burger,
  Button,
  Drawer,
  Group,
  MantineProvider,
  NavLink,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core'
// @ts-expect-error Vite bundles Mantine's exported CSS file; it has no TypeScript declaration.
import '@mantine/core/styles.layer.css'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { pqgCopy } from './copy.ts'
import type { SupportPanelState } from './contracts.ts'
import type {} from './contracts.ts'
import { EmptyState, UnavailableState } from './states.ts'
import { pqgShellTokens } from './tokens.ts'

type ShellSeat =
  | 'pqg.shell.navigation'
  | 'pqg.shell.workspace'
  | 'pqg.shell.home.widget'
  | 'pqg.shell.search.provider'
  | 'pqg.shell.support.context'
  | 'pqg.shell.support.suggestion'

type RootProps = PropsRuntime<'root'> & PropsRenderSlots<ShellSeat>

type ReactApi = {
  createElement: (...args: any[]) => any
  useEffect(effect: () => void | (() => void), deps: unknown[]): void
  useState<T>(initial: T | (() => T)): [T, (value: T | ((current: T) => T)) => void]
}

const React = require('react') as ReactApi
const inject = ['slots']
const utilityIds = new Set(['quick-note', 'recent', 'favorites'])

function shellRoot(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined
  return document.getElementById('pqg-application-shell') ?? undefined
}

function initialSupportState(): SupportPanelState {
  if (typeof window === 'undefined') return 'expanded'
  if (window.innerWidth < pqgShellTokens.tabletBreakpoint) return 'collapsed'
  if (window.innerWidth < pqgShellTokens.desktopSupportBreakpoint) return 'compact'
  return 'expanded'
}

function viewportWidth(): number {
  return typeof window === 'undefined' ? pqgShellTokens.desktopSupportBreakpoint : window.innerWidth
}

function SupportContent({
  activeId,
  state,
  renderSlot,
  setState,
}: {
  activeId: string
  state: SupportPanelState
  renderSlot: RootProps['renderSlot']
  setState(state: SupportPanelState): void
}) {
  return React.createElement(
    Stack,
    { gap: 'md', p: state === 'compact' ? 'sm' : 'md', 'data-pqg-support-state': state },
    React.createElement(
      Group,
      { justify: 'space-between', gap: 'xs' },
      React.createElement(Text, { fw: 700, size: state === 'compact' ? 'sm' : 'md' }, pqgCopy.supportTitle),
      React.createElement(
        Group,
        { gap: 4 },
        state !== 'compact' ? React.createElement(Button, { size: 'compact-xs', variant: 'subtle', onClick: () => setState('compact') }, pqgCopy.supportCompact) : null,
        state !== 'expanded' ? React.createElement(Button, { size: 'compact-xs', variant: 'subtle', onClick: () => setState('expanded') }, pqgCopy.supportExpand) : null,
        React.createElement(Button, { size: 'compact-xs', variant: 'subtle', onClick: () => setState('collapsed') }, pqgCopy.supportClose),
      ),
    ),
    state === 'compact' ? null : React.createElement(Text, { c: 'dimmed', size: 'sm' }, pqgCopy.supportDescription),
    renderSlot('pqg.shell.support.context', { activeId }, { fallback: null }),
    renderSlot('pqg.shell.support.suggestion', { activeId }, { fallback: null }),
  )
}

function HomeView({ renderSlot }: Pick<RootProps, 'renderSlot'>) {
  return React.createElement(
    Stack,
    { gap: 'lg' },
    React.createElement(
      'div',
      null,
      React.createElement(Title, { order: 2 }, pqgCopy.homeTitle),
      React.createElement(Text, { c: 'dimmed', mt: 4 }, pqgCopy.homeDescription),
    ),
    React.createElement(
      Paper,
      { withBorder: true, radius: 'lg', p: 'lg' },
      React.createElement(Text, { fw: 600, mb: 'sm' }, pqgCopy.workspace),
      renderSlot('pqg.shell.home.widget', {}, {
        fallback: React.createElement(EmptyState, { description: pqgCopy.homeEmpty }),
      }),
    ),
  )
}

function PqgApplicationShell({ renderSlot, renderSlotChain }: RootProps) {
  const [activeId, setActiveId] = React.useState('home')
  const [mobileNavOpened, setMobileNavOpened] = React.useState(false)
  const [supportState, setSupportState] = React.useState<SupportPanelState>(initialSupportState)
  const [width, setWidth] = React.useState(viewportWidth)

  React.useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const narrow = width < pqgShellTokens.tabletBreakpoint
  const mobileNav = width < pqgShellTokens.mobileNavBreakpoint
  const navigate = (targetId: string) => {
    setActiveId(targetId)
    setMobileNavOpened(false)
  }
  const mainFallback = activeId === 'home'
    ? React.createElement(HomeView, { renderSlot })
    : activeId === 'approval'
      ? React.createElement(UnavailableState, { title: pqgCopy.approval, description: pqgCopy.approvalUnavailable })
      : utilityIds.has(activeId)
        ? React.createElement(UnavailableState, { description: pqgCopy.utilityUnavailable })
        : React.createElement(UnavailableState, { description: pqgCopy.moduleUnavailable })

  const supportContent = React.createElement(SupportContent, {
    activeId,
    state: supportState,
    renderSlot,
    setState: setSupportState,
  })

  return React.createElement(
    'div',
    { id: 'pqg-application-shell', 'data-pqg-active': activeId, style: { minHeight: '100vh' } },
    React.createElement(
      MantineProvider,
      {
        cssVariablesSelector: '#pqg-application-shell',
        deduplicateCssVariables: false,
        forceColorScheme: 'light',
        getRootElement: shellRoot,
        withGlobalClasses: false,
      },
      React.createElement(
        AppShell,
        {
          padding: 'md',
          header: { height: pqgShellTokens.headerHeight },
          navbar: {
            width: pqgShellTokens.navbarWidth,
            breakpoint: pqgShellTokens.mobileNavBreakpoint,
            collapsed: { mobile: !mobileNavOpened },
          },
          aside: {
            width: supportState === 'compact' ? pqgShellTokens.supportCompactWidth : pqgShellTokens.supportExpandedWidth,
            breakpoint: pqgShellTokens.tabletBreakpoint,
            collapsed: { mobile: true, desktop: supportState === 'collapsed' },
          },
        },
        React.createElement(
          AppShell.Header,
          { px: 'md' },
          React.createElement(
            Group,
            { h: '100%', justify: 'space-between', wrap: 'nowrap' },
            React.createElement(
              Group,
              { gap: 'sm', wrap: 'nowrap' },
              mobileNav ? React.createElement(Burger, {
                opened: mobileNavOpened,
                onClick: () => setMobileNavOpened((opened) => !opened),
                size: 'sm',
                'aria-label': 'Mở điều hướng',
              }) : null,
              React.createElement('div', null,
                React.createElement(Text, { fw: 800, size: 'lg', lh: 1.1 }, pqgCopy.brand),
                React.createElement(Text, { c: 'dimmed', size: 'xs' }, pqgCopy.workspace),
              ),
            ),
            React.createElement(Button, {
              variant: supportState === 'collapsed' ? 'light' : 'filled',
              size: 'sm',
              onClick: () => setSupportState((state) => state === 'collapsed' ? (narrow ? 'expanded' : 'compact') : 'collapsed'),
              'data-pqg-support-toggle': true,
            }, pqgCopy.support),
          ),
        ),
        React.createElement(
          AppShell.Navbar,
          { p: 'sm' },
          React.createElement(
            AppShell.Section,
            { grow: true, component: 'nav', 'aria-label': 'Điều hướng chính' },
            React.createElement(
              Stack,
              { gap: 4 },
              React.createElement(NavLink, { label: pqgCopy.home, active: activeId === 'home', onClick: () => navigate('home') }),
              React.createElement(Text, { c: 'dimmed', fw: 700, px: 'sm', pt: 'sm', size: 'xs', tt: 'uppercase' }, pqgCopy.modules),
              renderSlot('pqg.shell.navigation', { activeId, navigate }, { fallback: null }),
              React.createElement(NavLink, { label: pqgCopy.approval, active: activeId === 'approval', onClick: () => navigate('approval') }),
              React.createElement(Text, { c: 'dimmed', fw: 700, px: 'sm', pt: 'md', size: 'xs', tt: 'uppercase' }, pqgCopy.personal),
              React.createElement(NavLink, { label: pqgCopy.quickNote, active: activeId === 'quick-note', onClick: () => navigate('quick-note') }),
              React.createElement(NavLink, { label: pqgCopy.recent, active: activeId === 'recent', onClick: () => navigate('recent') }),
              React.createElement(NavLink, { label: pqgCopy.favorites, active: activeId === 'favorites', onClick: () => navigate('favorites') }),
            ),
          ),
        ),
        React.createElement(
          AppShell.Main,
          null,
          React.createElement('div', { hidden: true, 'data-pqg-search-provider-seat': true },
            renderSlot('pqg.shell.search.provider', { query: '' }, { fallback: null }),
          ),
          renderSlotChain('pqg.shell.workspace', { activeId }, { fallback: mainFallback }),
        ),
        React.createElement(AppShell.Aside, null, !narrow && supportState !== 'collapsed' ? supportContent : null),
        React.createElement(
          Drawer,
          {
            opened: narrow && supportState !== 'collapsed',
            onClose: () => setSupportState('collapsed'),
            title: pqgCopy.supportTitle,
            position: 'right',
            size: supportState === 'expanded' ? (width < 768 ? '100%' : 420) : 320,
            withinPortal: false,
            'data-pqg-support-drawer': true,
          },
          narrow ? supportContent : null,
        ),
      ),
    ),
  )
}

function apply(ctx: ClientContext): void {
  ctx.slots.register({
    name: 'root',
    children: {
      'pqg.shell.navigation': { kind: 'list', scope: 'root' },
      'pqg.shell.workspace': { kind: 'chain', scope: 'root' },
      'pqg.shell.home.widget': { kind: 'list', scope: 'root' },
      'pqg.shell.search.provider': { kind: 'list', scope: 'root' },
      'pqg.shell.support.context': { kind: 'list', scope: 'root' },
      'pqg.shell.support.suggestion': { kind: 'list', scope: 'root' },
    },
  }, PqgApplicationShell)
}

module.exports = { inject, apply }
