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
  SimpleGrid,
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
  | 'sidebar'
  | 'conversation'
  | 'details'
  | 'shell.overlay'

type RootProps = PropsRuntime<'root'> & PropsRenderSlots<ShellSeat>
type ApplicationShellProps = RootProps & { services: ShellSystemServices, layout: PqgLayoutBridge }

type ReactApi = {
  createElement: (...args: any[]) => any
  useEffect(effect: () => void | (() => void), deps: unknown[]): void
  useState<T>(initial: T | (() => T)): [T, (value: T | ((current: T) => T)) => void]
}

type LayoutPanelActions = {
  toggleSidebar(): void
  openDetails(): void
  closeDetails(): void
}

class PqgLayoutBridge {
  private panels: LayoutPanelActions | undefined

  attachPanels(actions: LayoutPanelActions): void {
    this.panels = actions
  }

  detachPanels(actions: LayoutPanelActions): void {
    if (this.panels === actions) this.panels = undefined
  }

  toggleSidebar(): void {
    this.requirePanels().toggleSidebar()
  }

  openDetails(): void {
    this.requirePanels().openDetails()
  }

  closeDetails(): void {
    this.requirePanels().closeDetails()
  }

  private requirePanels(): LayoutPanelActions {
    if (this.panels === undefined) throw new Error('layout: panel actions not wired (PQG root not mounted)')
    return this.panels
  }
}

const React = require('react') as ReactApi
const inject = ['slots', 'sessions']
const shellFontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'

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
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | undefined>(undefined)
  const [, setRevision] = React.useState(0)
  React.useEffect(() => services.subscribeSupport(() => setRevision(value => value + 1)), [services])
  const support = services.supportFor(activeId)
  const suggestions = state === 'expanded' ? support?.suggestions ?? [] : []
  const snapshot = services.supportSnapshot()
  const unavailable = snapshot === undefined
    || snapshot.removed
    || snapshot.subagent?.address.mode === 'one-shot'
    || (snapshot.pending?.length ?? 0) > 0

  const sendSuggestion = async (value: string): Promise<void> => {
    if (!value.trim() || busy || unavailable) return
    setBusy(true)
    setError(undefined)
    try {
      await services.promptSupport(value, support)
    } catch {
      setError(pqgCopy.supportSendError)
      services.notify({ kind: 'error', title: pqgCopy.supportTitle, message: pqgCopy.supportSendError })
    } finally {
      setBusy(false)
    }
  }

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
                Button,
                {
                  key: suggestion.id,
                  size: 'compact-sm',
                  variant: 'light',
                  justify: 'flex-start',
                  disabled: !suggestion.prompt || unavailable || busy,
                  onClick: () => suggestion.prompt === undefined ? undefined : void sendSuggestion(suggestion.prompt),
                  'data-pqg-support-suggestion': suggestion.id,
                },
                suggestion.label,
              )),
            ),
      )

  return React.createElement(
    Stack,
    { gap: 'md', p: state === 'compact' ? 'sm' : 'md', style: { height: '100%', minHeight: 0 }, 'data-pqg-support-state': state },
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
    error === undefined ? null : React.createElement(Text, { c: 'red', size: 'xs' }, error),
    state === 'compact' ? null : React.createElement(
      'div',
      { style: { flex: 1, minHeight: 0, overflow: 'hidden' }, 'data-pqg-support-chat': true },
      renderSlot('conversation', {}, {
        fallback: React.createElement(Text, { c: 'dimmed', size: 'sm' }, pqgCopy.supportEmpty),
      }),
    ),
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
  const [error, setError] = React.useState<string | undefined>(undefined)

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

function DashboardMetricCard({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description: string
}) {
  return React.createElement(
    Paper,
    {
      withBorder: true,
      radius: 'lg',
      p: 'lg',
      'data-pqg-dashboard-metric': label,
      style: { background: pqgShellTokens.panelBackground, boxShadow: pqgShellTokens.cardShadow },
    },
    React.createElement(
      Stack,
      { gap: 6 },
      React.createElement(Text, { c: 'dimmed', fw: 600, size: 'sm' }, label),
      React.createElement(Text, { fw: 800, size: 'xl', lh: 1.15 }, value),
      React.createElement(Text, { c: 'dimmed', size: 'xs' }, description),
    ),
  )
}

function HomeView({
  navigate,
  renderSlot,
  sessions,
}: Pick<RootProps, 'renderSlot'> & {
  navigate(targetId: string): void
  sessions: { current?: string; byId: Record<string, { pendingInteraction?: unknown }> }
}) {
  const sessionCount = Object.keys(sessions.byId).length
  const currentSummary = sessions.current === undefined ? undefined : sessions.byId[sessions.current]
  const approvalCount = currentSummary?.pendingInteraction == null ? '0' : '1'
  const currentSession = sessions.current === undefined ? pqgCopy.dashboardClosed : pqgCopy.dashboardOpen
  const today = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return React.createElement(
    Stack,
    { gap: 'xl', 'data-pqg-dashboard': true },
    React.createElement(
      Group,
      { justify: 'space-between', align: 'flex-start', gap: 'lg' },
      React.createElement(
        'div',
        null,
        React.createElement(Title, { order: 1, size: '2rem', lh: 1.15 }, pqgCopy.homeTitle),
        React.createElement(Text, { c: 'dimmed', mt: 6 }, pqgCopy.homeDescription),
      ),
      React.createElement(Text, { c: 'dimmed', size: 'sm', visibleFrom: 'md' }, today),
    ),
    React.createElement(
      SimpleGrid,
      { cols: { base: 1, sm: 3 }, spacing: 'md' },
      React.createElement(DashboardMetricCard, {
        label: pqgCopy.dashboardSessions,
        value: String(sessionCount),
        description: 'Các phiên đang có trong không gian làm việc.',
      }),
      React.createElement(DashboardMetricCard, {
        label: pqgCopy.dashboardCurrentSession,
        value: currentSession,
        description: 'Trạng thái phiên làm việc hiện tại.',
      }),
      React.createElement(DashboardMetricCard, {
        label: pqgCopy.dashboardApproval,
        value: approvalCount,
        description: 'Hành động đang chờ xác nhận của bạn.',
      }),
    ),
    React.createElement(
      Stack,
      { gap: 'md' },
      React.createElement(
        'div',
        null,
        React.createElement(Title, { order: 2 }, pqgCopy.dashboardWorkspaceTitle),
        React.createElement(Text, { c: 'dimmed', mt: 4 }, pqgCopy.dashboardWorkspaceDescription),
      ),
      React.createElement(
        SimpleGrid,
        { cols: { base: 1, md: 2 }, spacing: 'md', 'data-pqg-dashboard-widgets': true },
        renderSlot('pqg.shell.home.widget', { activeId: 'home', navigate }, {
          fallback: React.createElement(
            Paper,
            { withBorder: true, radius: 'lg', p: 'lg' },
            React.createElement(EmptyState, { description: pqgCopy.homeEmpty }),
          ),
        }),
      ),
    ),
  )
}

function PqgApplicationShell({ renderSlot, renderSlotChain, services, layout, useSessions }: ApplicationShellProps) {
  const [activeId, setActiveId] = React.useState('home')
  const [mobileNavOpened, setMobileNavOpened] = React.useState(false)
  const [sessionSidebarOpened, setSessionSidebarOpened] = React.useState(false)
  const [detailsOpened, setDetailsOpened] = React.useState(false)
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
    const actions: LayoutPanelActions = {
      toggleSidebar: () => setSessionSidebarOpened(opened => !opened),
      openDetails: () => setDetailsOpened(true),
      closeDetails: () => setDetailsOpened(false),
    }
    layout.attachPanels(actions)
    return () => layout.detachPanels(actions)
  }, [layout])

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
    ? React.createElement(HomeView, { navigate, renderSlot, sessions })
    : activeId === 'approval'
      ? React.createElement(ApprovalView, { revision: approvalRevision, services })
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
    {
      id: 'pqg-application-shell',
      'data-pqg-active': activeId,
      style: {
        minHeight: '100vh',
        background: pqgShellTokens.shellBackground,
        color: pqgShellTokens.textPrimary,
        colorScheme: 'light',
      },
    },
    React.createElement(
      MantineProvider,
      {
        cssVariablesSelector: '#pqg-application-shell',
        deduplicateCssVariables: false,
        forceColorScheme: 'light',
        getRootElement: shellRoot,
        withGlobalClasses: false,
        theme: {
          primaryColor: 'blue',
          defaultRadius: 'md',
          fontFamily: shellFontFamily,
          headings: { fontFamily: shellFontFamily },
        },
      },
      React.createElement(Notifications, { position: 'top-right', limit: 4 }),
      React.createElement(SearchSurface, { navigate, revision: serviceRevision, services }),
      renderSlot('shell.overlay', {}, { fallback: null }),
      React.createElement(
        AppShell,
        {
          padding: mobileNav ? 'sm' : 'lg',
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
          {
            px: mobileNav ? 'sm' : 'lg',
            style: {
              background: pqgShellTokens.panelBackground,
              borderBottom: `1px solid ${pqgShellTokens.borderColor}`,
              color: pqgShellTokens.textPrimary,
            },
          },
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
                onClick: () => setSessionSidebarOpened(true),
                'data-pqg-session-toggle': true,
              }, 'Phiên'),
              React.createElement(Button, {
                variant: 'default',
                size: 'compact-sm',
                leftSection: React.createElement(IconSearch, { size: 16, stroke: 1.8, 'aria-hidden': true }),
                onClick: spotlight.open,
                'aria-label': pqgCopy.search,
                'data-pqg-search-toggle': true,
                style: width < 900 ? undefined : { minWidth: 340, justifyContent: 'flex-start' },
              }, width < 640 ? null : pqgCopy.searchPlaceholder),
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
          {
            p: 'md',
            style: {
              background: pqgShellTokens.navigationBackground,
              borderRight: `1px solid ${pqgShellTokens.borderColor}`,
              color: pqgShellTokens.textPrimary,
            },
          },
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
            ),
          ),
        ),
        React.createElement(
          AppShell.Main,
          { style: { background: pqgShellTokens.shellBackground } },
          React.createElement(
            'div',
            { style: { width: '100%', maxWidth: pqgShellTokens.contentMaxWidth, margin: '0 auto' } },
            renderSlotChain('pqg.shell.workspace', { activeId }, { fallback: mainFallback }),
          ),
        ),
        React.createElement(AppShell.Aside, {
          style: {
            background: pqgShellTokens.panelBackground,
            borderLeft: `1px solid ${pqgShellTokens.borderColor}`,
            color: pqgShellTokens.textPrimary,
          },
        }, !narrow && supportState !== 'collapsed' ? supportContent : null),
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
        React.createElement(
          Drawer,
          {
            opened: sessionSidebarOpened,
            onClose: () => setSessionSidebarOpened(false),
            title: 'Phiên làm việc',
            position: 'left',
            size: 320,
            withinPortal: false,
            'data-pqg-session-drawer': true,
          },
          React.createElement(
            'div',
            { style: { height: '100%', minHeight: 0, overflow: 'hidden' } },
            renderSlot('sidebar', { collapsed: false, width: 280 }, { fallback: null }),
          ),
        ),
        React.createElement(
          Drawer,
          {
            opened: detailsOpened && sessions.current !== undefined,
            onClose: () => setDetailsOpened(false),
            title: 'Chi tiết',
            position: 'right',
            size: width < 768 ? '100%' : 420,
            withinPortal: false,
            'data-pqg-details-drawer': true,
          },
          renderSlot('details', {}, { fallback: null }),
        ),
      ),
    ),
  )
}

function apply(ctx: ClientContext): void {
  const services = createShellSystemServices(ctx.sessions)
  const layout = new PqgLayoutBridge()

  function ApplicationShellRoot(props: RootProps) {
    return React.createElement(PqgApplicationShell, { ...props, services, layout })
  }

  ctx.effect(() => {
    const disposeLayout = ctx.reflect.provide('layout', layout)
    const disposeService = ctx.reflect.provide('pqgShell', services)
    const disposeRegistration = ctx.slots.register({
      name: 'root',
      children: {
        'sidebar': { kind: 'single', scope: 'root' },
        'conversation': { kind: 'single', scope: 'session-maybe' },
        'details': { kind: 'single', scope: 'session' },
        'shell.overlay': { kind: 'list', scope: 'root' },
        'pqg.shell.navigation': { kind: 'list', scope: 'root' },
        'pqg.shell.workspace': { kind: 'chain', scope: 'root' },
        'pqg.shell.home.widget': { kind: 'list', scope: 'root' },
        'pqg.shell.support.context': { kind: 'list', scope: 'root' },
        'pqg.shell.support.suggestion': { kind: 'list', scope: 'root' },
      },
    }, ApplicationShellRoot)
    return () => {
      disposeRegistration()
      void disposeService()
      void disposeLayout()
    }
  }, 'pqg-shell: DSH layout bridge + system services + root registration')
}

module.exports = { inject, apply }
