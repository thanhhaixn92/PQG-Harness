import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

import * as cordisModule from '@deepseek-ai/cordis'
import { Context } from '@deepseek-ai/cordis'
import * as slotCoreModule from '@deepseek-ai/dsh-client-ui-slots'

const runtimeBundleUrl = new URL('../public/plugins/@deepseek-ai/dsh-client-runtime/client.js', import.meta.url)
const shellBundleUrl = new URL('../public/plugins/@pqg/application-shell/client.js', import.meta.url)
const referenceBundleUrl = new URL('../public/plugins/@pqg/reference-module/client.js', import.meta.url)
const layoutBundleUrl = new URL('../public/plugins/@deepseek-ai/dsh-client-ui-layout/client.js', import.meta.url)

interface PluginModule {
  inject: string[]
  apply(ctx: Context): void
}

interface SlotRegistryFace {
  entries(key: string): Array<{ component: (props: any) => unknown }>
  entriesOfSlot(key: string): Array<{ component?: (props: object) => unknown }>
}

async function loadHandoff(url: URL, expectedId: string) {
  const source = await readFile(url, 'utf8')
  const handoffs: Array<{ id: string; factory: (requireModule: (id: string) => unknown) => any }> = []
  vm.runInNewContext(source, {
    queueMicrotask,
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

async function loadPlugin(url: URL, expectedId: string): Promise<PluginModule> {
  const handoff = await loadHandoff(url, expectedId)
  return handoff.factory((id: string) => {
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

test('PQG root owns a custom child seat and reference contribution follows declaration lifecycle', async () => {
  const SlotRegistry = await loadRuntimeSlotRegistry()
  const shell = await loadPlugin(shellBundleUrl, '@pqg/application-shell')
  const reference = await loadPlugin(referenceBundleUrl, '@pqg/reference-module')

  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistryFace

  const referenceFiber = ctx.plugin({ inject: [...reference.inject], apply: reference.apply })
  await referenceFiber.await()
  assert.equal(slots.entries('pqg.shell.proof').length, 0, 'inject must wait while the PQG seat is undeclared')

  let shellFiber = ctx.plugin({ inject: [...shell.inject], apply: shell.apply })
  await shellFiber.await()
  assert.equal(slots.entries('root').length, 1, 'PQG must be the only root registration')
  assert.equal(slots.entries('pqg.shell.proof').length, 1, 'reference contribution must appear after declaration')

  const root = slots.entries('root')[0]!
  const renderSlot = (name: string): unknown => {
    const entry = slots.entriesOfSlot(name)[0]
    return entry?.component?.({}) ?? null
  }
  assert.equal(root.component({ renderSlot }), 'PQG shell proof contribution')

  await referenceFiber.dispose()
  assert.equal(slots.entries('pqg.shell.proof').length, 0, 'disposing the reference plugin removes its contribution')

  const remountedReference = ctx.plugin({ inject: [...reference.inject], apply: reference.apply })
  await remountedReference.await()
  assert.equal(slots.entries('pqg.shell.proof').length, 1, 'reference contribution must remount')

  await shellFiber.dispose()
  assert.equal(slots.entries('pqg.shell.proof').length, 0, 'disposing the owner collapses its child seat')

  shellFiber = ctx.plugin({ inject: [...shell.inject], apply: shell.apply })
  await shellFiber.await()
  assert.equal(slots.entries('pqg.shell.proof').length, 1, 'pending injection must recover when the owner remounts')

  await remountedReference.dispose()
  await shellFiber.dispose()
})
