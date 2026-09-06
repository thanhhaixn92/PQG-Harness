import {
  AppShell,
  Badge,
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
import { Notifications, notifications } from '@mantine/notifications'
import { Spotlight, spotlight } from '@mantine/spotlight'
import { IconCheck, IconHome, IconSearch } from '@tabler/icons-react'
// @ts-expect-error Vite bundles Mantine's exported CSS file; it has no TypeScript declaration.
import '@mantine/core/styles.layer.css'
// @ts-expect-error Vite bundles package CSS files; they have no TypeScript declarations.
import '@mantine/notifications/styles.css'
// @ts-expect-error Vite bundles package CSS files; they have no TypeScript declarations.
import '@mantine/spotlight/styles.css'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { pqgCopy } from './copy.ts'
import type {
  ShellApprovalOutcome,
  ShellNotificationKind,
  ShellSearchMatch,
  ShellSystemServices,
  SupportPanelState,
} from './contracts.ts'
import { createShellSystemServices } from './services.ts'
import { EmptyState, UnavailableState } from './states.ts'
import { pqgShellTokens } from './tokens.ts'

type ShellSeat =
  | 'pqg.shell.navigation'
  | 'pqg.shell.workspace'
  | 'pqg.shell.home.widget'
  | 'pqg.shell.support.context'
  | 'pqg.shell.support.suggestion'

type RootProps = PropsRuntime<'root'> & PropsRenderSlots<ShellSeat>
type ApplicationShellProps = RootProps & { services: ShellSystemServices }

type ReactApi = {
  createElement: (...args: any[]) => any
  useEffect(effect: () => void | (() => void), deps: unknown[]): void
  useState<T>(initial: T | (() => T)): [T, (value: T | ((current: T) => T)) => void]
}

const React = require('react') as ReactApi
const inject = ['slots', 'sessions']
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

function notificationColor(kind: ShellNotificationKind | undefined): string {
  if (kind === 'success') return 'teal'
  if (kind === 'warning') return 'yellow'
  if (kind === 'error') return 'red'
  return 'blue'
}

function SupportContent({
  activeId,
  state,
  renderSlot,
  services,
  setState,
}: {
  activeId: string
  state: SupportPanelState
  renderSlot: RootProps['renderSlot']
  services: ShellSystemServices
  setState(state: SupportPanelState): void
}) {
  const support = services.supportFor(activeId)
  const suggestions = state === 'expanded' ? support?.suggestions ?? [] : []
  const structuredSupport = support === undefined
    ? null
    : React.createElement(
        Stack,
        { gap: 'sm', 'data-pqg-support-context': activeId },
        support.title === undefined ? null : React.createElement(Text, { fw: 600, size: 'sm' }, support.title),
        support.summary === undefined ? null : React.createElement(Text, { c: 'dimmed', size: 'sm' }, support.summary),
        suggestions.length === 0
          ? null
          : React.createElement(
              Stack,
              { gap: 6 },
              React.createElement(Text, { c: 'dimmed', fw: 600, size: 'xs', tt: 'uppercase' }, pqgCopy.supportSuggestions),
              ...suggestions.map(suggestion => React.createElement(
                Paper,
                { key: suggestion.id, withBorder: true, radius: 'md', p: 'xs', 'data-pqg-support-suggestion': suggestion.id },
                React.createElement(Text, { size: 'sm' }, suggestion.label),
              )),
            ),
      )

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
    structuredSupport ?? renderSlot('pqg.shell.support.context', { activeId }, { fallback: null }),
    structuredSupport === null ? renderSlot('pqg.shell.support.suggestion', { activeId }, { fallback: null }) : null,
  )
}

function SearchSurface({
  navigate,
  revision,
  services,
}: {
  navigate(targetId: string): void
  revision: number
  services: ShellSystemServices
}) {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<readonly ShellSearchMatch[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    const normalized = query.trim()
    if (normalized === '') {
      setResults([])
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    void services.search(normalized).then(
      matches => {
        if (!active) return
        setResults(matches)
        setLoading(false)
      },
      () => {
        if (!active) return
        setResults([])
        setLoading(false)
      },
    )
    return () => { active = false }
  }, [query, revision, services])

  const items = results.map(result => React.createElement(Spotlight.Action, {
    key: `${result.providerId}:${result.id}`,
    label: result.label,
    description: result.description ?? result.providerLabel,
    onClick: () => {
      navigate(result.targetId)
      spotlight.close()
    },
    'data-pqg-search-result': `${result.providerId}:${result.id}`,
  }))
  const emptyCopy = query.trim() === ''
    ? pqgCopy.searchHint
    : loading
      ? pqgCopy.searchLoading
      : pqgCopy.searchEmpty

  return React.createElement(
    Spotlight.Root,
    { query, onQueryChange: setQuery, withinPortal: false, 'data-pqg-search-root': true },
    React.createElement(Spotlight.Search, {
      placeholder: pqgCopy.searchPlaceholder,
      leftSection: React.createElement(IconSearch, { size: 18, stroke: 1.8, 'aria-hidden': true }),
      'data-pqg-search-input': true,
    }),
    React.createElement(
      Spotlight.ActionsList,
      null,
      items.length > 0 ? items : React.createElement(Spotlight.Empty, null, emptyCopy),
    ),
  )
}

function ApprovalView({
  revision,
  services,
}: {
  revision: string
  services: ShellSystemServices
}) {
  const approval = services.currentApproval()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | undefined>()

  React.useEffect(() => {
    setBusy(false)
    setError(undefined)
  }, [approval?.key, revision])

  if (approval === undefined) {
    return React.createElement(EmptyState, { description: pqgCopy.approvalEmpty })
  }

  const decide = async (outcome: ShellApprovalOutcome): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      await services.answerApproval(approval, outcome)
      services.notify({
        kind: outcome === 'allowed-once' ? 'success' : 'info',
        title: pqgCopy.approval,
        message: outcome === 'allowed-once'
          ? pqgCopy.approvalAllowedNotification
          : pqgCopy.approvalRejectedNotification,
      })
    } catch {
      setError(pqgCopy.approvalErrorNotification)
      services.notify({ kind: 'error', title: pqgCopy.approval, message: pqgCopy.approvalErrorNotification })
    } finally {
      setBusy(false)
    }
  }

  return React.createElement(
    Stack,
    { gap: 'lg', 'data-pqg-approval-view': true },
    React.createElement(Title, { order: 2 }, pqgCopy.approval),
    React.createElement(
      Paper,
      { withBorder: true, radius: 'lg', p: 'lg', 'data-pqg-approval-request': approval.key },
      React.createElement(Stack, { gap: 'md' },
        React.createElement('div', null,
          React.createElement(Text, { c: 'dimmed', size: 'xs', tt: 'uppercase', fw: 700 }, pqgCopy.approvalAction),
          React.createElement(Text, { fw: 600 }, approval.toolName),
        ),
        React.createElement('div', null,
          React.createElement(Text, { c: 'dimmed', size: 'xs', tt: 'uppercase', fw: 700 }, pqgCopy.approvalReason),
          React.createElement(Text, { size: 'sm' }, approval.reason ?? pqgCopy.approvalReasonFallback),
        ),
        React.createElement('div', null,
          React.createElement(Text, { c: 'dimmed', size: 'xs', tt: 'uppercase', fw: 700 }, pqgCopy.approvalRisk),
          React.createElement(Badge, { variant: 'light', color: 'yellow' }, pqgCopy.approvalRiskConfirmation),
        ),
        error === undefined ? null : React.createElement(Text, { c: 'red', size: 'sm' }, error),
        React.createElement(
          Group,
          { justify: 'flex-end' },
          React.createElement(Button, {
            variant: 'light',
            color: 'red',
            disabled: busy,
            onClick: () => { void decide('rejected') },
            'data-pqg-approval-reject': true,
          }, pqgCopy.approvalReject),
          React.createElement(Button, {
            loading: busy,
            onClick: () => { void decide('allowed-once') },
            'data-pqg-approval-allow': true,
          }, pqgCopy.approvalAllow),
        ),
      ),
    ),
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

function PqgApplicationShell({ renderSlot, renderSlotChain, services, useSessions }: ApplicationShellProps) {
  const [activeId, setActiveId] = React.useState('home')
  const [mobileNavOpened, setMobileNavOpened] = React.useState(false)
  const [supportState, setSupportState] = React.useState<SupportPanelState>(initialSupportState)
  const [width, setWidth] = React.useState(viewportWidth)
  const [serviceRevision, setServiceRevision] = React.useState(0)
  const sessions = useSessions(state => state)
  const currentSummary = sessions.current === undefined ? undefined : sessions.byId[sessions.current]
  const approvalRevision = `${sessions.current ?? ''}:${currentSummary?.pendingInteraction ?? ''}:${currentSummary?.updatedAt ?? 0}`

  React.useEffect(() => services.subscribe(() => {
    setServiceRevision(version => version + 1)
  }), [services])

  React.useEffect(() => services.subscribeNotifications(notification => {
    notifications.show({
      ...(notification.id === undefined ? {} : { id: notification.id }),
      ...(notification.title === undefined ? {} : { title: notification.title }),
      message: notification.message,
      color: notificationColor(notification.kind),
    })
  }), [services])

  React.useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== 'k') return
      event.preventDefault()
      spotlight.open()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
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
      ? React.createElement(ApprovalView, { revision: approvalRevision, services })
      : utilityIds.has(activeId)
        ? React.createElement(UnavailableState, { description: pqgCopy.utilityUnavailable })
        : React.createElement(UnavailableState, { description: pqgCopy.moduleUnavailable })

  const supportContent = React.createElement(SupportContent, {
    activeId,
    state: supportState,
    renderSlot,
    services,
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
      React.createElement(Notifications, { position: 'top-right', limit: 4 }),
      React.createElement(SearchSurface, { navigate, revision: serviceRevision, services }),
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
            React.createElement(
              Group,
              { gap: 'xs', wrap: 'nowrap' },
              React.createElement(Button, {
                variant: 'default',
                size: 'compact-sm',
                leftSection: React.createElement(IconSearch, { size: 16, stroke: 1.8, 'aria-hidden': true }),
                onClick: spotlight.open,
                'aria-label': pqgCopy.search,
                'data-pqg-search-toggle': true,
              }, width < 640 ? null : pqgCopy.search),
              React.createElement(Button, {
                variant: supportState === 'collapsed' ? 'light' : 'filled',
                size: 'compact-sm',
                onClick: () => setSupportState((state) => state === 'collapsed' ? (narrow ? 'expanded' : 'compact') : 'collapsed'),
                'data-pqg-support-toggle': true,
              }, pqgCopy.support),
            ),
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
              React.createElement(NavLink, { label: pqgCopy.home, leftSection: React.createElement(IconHome, { size: 18, stroke: 1.8, 'aria-hidden': true }), active: activeId === 'home', onClick: () => navigate('home') }),
              React.createElement(Text, { c: 'dimmed', fw: 700, px: 'sm', pt: 'sm', size: 'xs', tt: 'uppercase' }, pqgCopy.modules),
              renderSlot('pqg.shell.navigation', { activeId, navigate }, { fallback: null }),
              React.createElement(NavLink, { label: pqgCopy.approval, leftSection: React.createElement(IconCheck, { size: 18, stroke: 1.8, 'aria-hidden': true }), active: activeId === 'approval', onClick: () => navigate('approval') }),
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
  const services = createShellSystemServices(ctx.sessions)
  ctx.provide('pqgShell', services)

  function ApplicationShellRoot(props: RootProps) {
    return React.createElement(PqgApplicationShell, { ...props, services })
  }

  ctx.slots.register({
    name: 'root',
    children: {
      'pqg.shell.navigation': { kind: 'list', scope: 'root' },
      'pqg.shell.workspace': { kind: 'chain', scope: 'root' },
      'pqg.shell.home.widget': { kind: 'list', scope: 'root' },
      'pqg.shell.support.context': { kind: 'list', scope: 'root' },
      'pqg.shell.support.suggestion': { kind: 'list', scope: 'root' },
    },
  }, ApplicationShellRoot)
}

module.exports = { inject, apply }
