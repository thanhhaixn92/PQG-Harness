import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

import * as cordisModule from '@deepseek-ai/cordis'
import { Context } from '@deepseek-ai/cordis'
import * as slotCoreModule from '@deepseek-ai/dsh-client-ui-slots'

const require = createRequire(import.meta.url)
const { renderToStaticMarkup } = require('react-dom/server') as { renderToStaticMarkup(node: unknown): string }
const runtimeBundleUrl = new URL('../public/plugins/@deepseek-ai/dsh-client-runtime/client.js', import.meta.url)
const shellBundleUrl = new URL('../public/plugins/@pqg/application-shell/client.js', import.meta.url)
const referenceBundleUrl = new URL('../public/plugins/@pqg/reference-module/client.js', import.meta.url)
const layoutBundleUrl = new URL('../public/plugins/@deepseek-ai/dsh-client-ui-layout/client.js', import.meta.url)
const visualSeats = [
  'pqg.shell.navigation',
  'pqg.shell.workspace',
  'pqg.shell.home.widget',
  'pqg.shell.support.context',
  'pqg.shell.support.suggestion',
] as const

interface PluginModule {
  inject: string[]
  apply(ctx: Context): void | Promise<void>
}

interface SlotEntry {
  component: (props: any) => unknown
  select?: (owner: { activeId: string }) => unknown
}

interface SlotRegistryFace {
  entries(key: string): readonly SlotEntry[]
  spec(key: string): { kind: string; scope: string } | undefined
}

async function loadHandoff(
  url: URL,
  expectedId: string,
  globals: Record<string, unknown> = {},
) {
  const source = await readFile(url, 'utf8')
  const handoffs: Array<{ id: string; factory: (requireModule: (id: string) => unknown) => any }> = []
  vm.runInNewContext(source, {
    queueMicrotask,
    ...globals,
    window: {
      __ModuleLoader__: {
        load(handoff: { id: string; factory: (requireModule: (id: string) => unknown) => any }) {
          handoffs.push(handoff)
        },
      },
    },
  }, { filename: url.pathname.split('/').at(-1) })
  assert.equal(handoffs.length, 1)
  assert.equal(handoffs[0]?.id, expectedId)
  return handoffs[0]!
}

async function loadPlugin(
  url: URL,
  expectedId: string,
  globals: Record<string, unknown> = {},
): Promise<PluginModule> {
  const handoff = await loadHandoff(url, expectedId, globals)
  return handoff.factory((id: string) => {
    if (id === 'react' || id === 'react/jsx-runtime' || id === 'react-dom' || id === 'react-dom/client') return require(id)
    throw new Error(`unexpected external module in ${expectedId}: ${id}`)
  }) as PluginModule
}

async function loadRuntimeSlotRegistry(): Promise<any> {
  const handoff = await loadHandoff(runtimeBundleUrl, '@deepseek-ai/dsh-client-runtime')
  const runtime = handoff.factory((id: string) => {
    if (id === '@deepseek-ai/cordis') return cordisModule
    if (id === '@deepseek-ai/dsh-client-ui-slots') return slotCoreModule
    throw new Error(`unexpected external module in DSH runtime: ${id}`)
  }) as { SlotRegistry?: unknown }
  assert.equal(typeof runtime.SlotRegistry, 'function')
  return runtime.SlotRegistry
}

test('Makers layout compatibility patch removes the shipped root owner as one unit but keeps ThemePresenter', async () => {
  const source = await readFile(layoutBundleUrl, 'utf8')
  assert.doesNotMatch(source, /ctx\.reflect\.provide\("layout", layout\)/)
  assert.doesNotMatch(source, /ui-layout: service \+ root registration/)
  assert.match(source, /ui-layout: theme presenter/)
  assert.match(source, /new ThemePresenter\(\)/)
})

test('PQG shell owns a readable light surface and hides placeholder utilities from navigation', async () => {
  const SlotRegistry = await loadRuntimeSlotRegistry()
  const shell = await loadPlugin(shellBundleUrl, '@pqg/application-shell')
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('sessions', {} as never)
  const slots = ctx.get('slots') as unknown as SlotRegistryFace
  const shellFiber = ctx.plugin({ inject: [...shell.inject], apply: shell.apply })
  await shellFiber.await()

  const root = slots.entries('root')[0]?.component
  assert.equal(typeof root, 'function')
  const React = require('react') as { createElement: (...args: any[]) => unknown }
  const html = renderToStaticMarkup(React.createElement(root as any, {
    renderSlot: (_name: string, _owner: unknown, options?: { fallback?: unknown }) => options?.fallback ?? null,
    renderSlotChain: (_name: string, _owner: unknown, options?: { fallback?: unknown }) => options?.fallback ?? null,
    useSessions: (selector: (state: { current?: string; byId: Record<string, unknown> }) => unknown) => selector({ current: undefined, byId: {} }),
  }))

  const rootStyle = html.match(/<div id="pqg-application-shell"[^>]*style="([^"]+)"/)?.[1] ?? ''
  assert.match(rootStyle, /background/)
  assert.match(rootStyle, /color:/)
  assert.match(rootStyle, /color-scheme:light/)

  const emptyStateStyle = html.match(/<section data-pqg-product-state="Chưa có nội dung" style="([^"]+)"/)?.[1] ?? ''
  assert.match(emptyStateStyle, /color:/)
  assert.match(emptyStateStyle, /background/)

  assert.doesNotMatch(html, />Ghi chú nhanh</)
  assert.doesNotMatch(html, />Gần đây</)
  assert.doesNotMatch(html, />Mục yêu thích</)

  await shellFiber.dispose()
})

test('PQG shell keeps search non-visual and gates module contributions by enabled policy', async () => {
  const SlotRegistry = await loadRuntimeSlotRegistry()
  const shell = await loadPlugin(shellBundleUrl, '@pqg/application-shell')
  let referenceEnabled = false
  const reference = await loadPlugin(referenceBundleUrl, '@pqg/reference-module', {
    fetch: async () => ({
      ok: true,
      json: async () => ({
        modules: [{ id: 'reference', label: 'Reference Module', enabled: referenceEnabled }],
      }),
    }),
  })

  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('sessions', {} as never)
  const slots = ctx.get('slots') as unknown as SlotRegistryFace

  const disabledReference = ctx.plugin({ inject: [...reference.inject], apply: reference.apply })
  await disabledReference.await()
  let shellFiber = ctx.plugin({ inject: [...shell.inject], apply: shell.apply })
  await shellFiber.await()
  await disabledReference.await()
  assert.equal(slots.entries('root').length, 1, 'PQG must remain the only root registration')
  assert.equal(slots.spec('pqg.shell.search.provider'), undefined, 'search provider must not be a rendered slot')
  for (const seat of visualSeats) {
    assert.equal(slots.entries(seat).length, 0, `${seat} must stay empty while module is disabled`)
  }

  await disabledReference.dispose()
  await shellFiber.dispose()
  referenceEnabled = true

  let referenceFiber = ctx.plugin({ inject: [...reference.inject], apply: reference.apply })
  await referenceFiber.await()
  for (const seat of visualSeats) assert.equal(slots.entries(seat).length, 0, `${seat} must wait for shell declaration`)

  shellFiber = ctx.plugin({ inject: [...shell.inject], apply: shell.apply })
  await shellFiber.await()
  await referenceFiber.await()
  const expectedKinds: Record<(typeof visualSeats)[number], string> = {
    'pqg.shell.navigation': 'list',
    'pqg.shell.workspace': 'chain',
    'pqg.shell.home.widget': 'list',
    'pqg.shell.support.context': 'list',
    'pqg.shell.support.suggestion': 'list',
  }
  for (const seat of visualSeats) {
    assert.equal(slots.spec(seat)?.kind, expectedKinds[seat], `${seat} kind`)
    assert.equal(slots.spec(seat)?.scope, 'root', `${seat} scope`)
    assert.equal(slots.entries(seat).length, 1, `${seat} enabled reference contribution`)
  }

  const workspace = slots.entries('pqg.shell.workspace')[0]
  assert.equal(typeof workspace?.select, 'function')
  assert.equal((workspace?.select?.({ activeId: 'reference' }) as { moduleId?: string } | null)?.moduleId, 'reference')
  assert.equal(workspace?.select?.({ activeId: 'home' }), null)

  await referenceFiber.dispose()
  for (const seat of visualSeats) assert.equal(slots.entries(seat).length, 0, `${seat} must disappear when module disposes`)

  referenceFiber = ctx.plugin({ inject: [...reference.inject], apply: reference.apply })
  await referenceFiber.await()
  for (const seat of visualSeats) assert.equal(slots.entries(seat).length, 1, `${seat} must remount`)

  await shellFiber.dispose()
  for (const seat of visualSeats) assert.equal(slots.entries(seat).length, 0, `${seat} must collapse with shell owner`)

  shellFiber = ctx.plugin({ inject: [...shell.inject], apply: shell.apply })
  await shellFiber.await()
  await referenceFiber.await()
  for (const seat of visualSeats) assert.equal(slots.entries(seat).length, 1, `${seat} injection must recover after shell remount`)

  await referenceFiber.dispose()
  await shellFiber.dispose()
})
