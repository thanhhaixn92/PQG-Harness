import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import { gzipSync } from 'node:zlib'

const require = createRequire(import.meta.url)
const bundleUrl = new URL('../public/plugins/@pqg/mantine-spike/client.js', import.meta.url)
const cssUrl = new URL('../public/plugins/@pqg/mantine-spike/styles.css', import.meta.url)
const allowedReactExternals = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
])

test('pins the React-18-compatible Mantine 8.3.18 baseline', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.dependencies?.['@mantine/core'], '8.3.18')
  assert.equal(pkg.dependencies?.['@mantine/hooks'], '8.3.18')
})

test('prepared Mantine client is in the DSH graph with layered CSS', async () => {
  assert.equal(existsSync(bundleUrl), true, 'Mantine spike client bundle must be prepared')
  assert.equal(existsSync(cssUrl), true, 'Mantine spike layered CSS must be prepared')

  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  const css = await readFile(cssUrl, 'utf8')
  assert.match(html, /"id":"@pqg\/mantine-spike"/)
  assert.match(html, /data-pqg-mantine-spike/)
  assert.match(html, /\/plugins\/@pqg\/mantine-spike\/styles\.css\?rev=/)
  assert.match(css, /@layer\s+mantine/)
  assert.match(css, /--mantine-primary-color-filled/)
})

test('bundle resolves React only from the DSH platform singleton and renders through the slot lifecycle', async () => {
  const source = await readFile(bundleUrl, 'utf8')
  const handoffs: Array<{ id: string; factory: (requireModule: (id: string) => unknown) => any }> = []
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(handoff: { id: string; factory: (requireModule: (id: string) => unknown) => any }) {
          handoffs.push(handoff)
        },
      },
    },
  }
  vm.runInNewContext(source, sandbox, { filename: 'mantine-spike-client.js' })
  assert.equal(handoffs.length, 1)
  assert.equal(handoffs[0]?.id, '@pqg/mantine-spike')

  const requested = new Set<string>()
  const plugin = handoffs[0]!.factory((id: string) => {
    requested.add(id)
    assert.equal(allowedReactExternals.has(id), true, `unexpected external module: ${id}`)
    return require(id)
  })

  assert.equal(requested.has('react'), true)
  assert.equal(requested.has('react/jsx-runtime'), true)
  for (const id of requested) assert.equal(allowedReactExternals.has(id), true)

  const React = require('react') as { createElement: (...args: any[]) => unknown }
  const { renderToString } = require('react-dom/server') as { renderToString: (node: unknown) => string }
  let component: (() => unknown) | undefined
  let contributionDisposer: (() => void) | undefined
  let disposed = 0

  const ctx = {
    slots: {
      inject(name: string, register: () => unknown) {
        assert.equal(name, 'settings.section')
        contributionDisposer = register() as () => void
        return () => contributionDisposer?.()
      },
      register(options: Record<string, unknown>, candidate: () => unknown) {
        assert.equal(options.name, 'settings.section')
        assert.equal(options.id, 'pqg-mantine-spike')
        component = candidate
        return () => {
          disposed += 1
          component = undefined
        }
      },
    },
  }

  plugin.apply(ctx)
  assert.ok(component, 'slot contribution must register a component')
  const first = renderToString(React.createElement(component as () => unknown))
  assert.match(first, /id="pqg-mantine-spike"/)
  assert.match(first, /mantine-Button-root/)
  assert.match(first, /Mantine compatibility/)
  assert.match(first, /#pqg-mantine-spike/)

  contributionDisposer?.()
  assert.equal(disposed, 1)
  assert.equal(component, undefined)

  plugin.apply(ctx)
  assert.ok(component, 'slot contribution must remount after disposal')
  const second = renderToString(React.createElement(component as () => unknown))
  assert.match(second, /mantine-Button-root/)
})

test('reports the additive raw and gzip bundle delta', async () => {
  const client = await readFile(bundleUrl)
  const css = await readFile(cssUrl)
  const raw = client.byteLength + css.byteLength
  const gzip = gzipSync(client).byteLength + gzipSync(css).byteLength
  assert.ok(raw > 0)
  assert.ok(gzip > 0)
  console.log(`[mantine-spike] bundle delta raw=${String(raw)} bytes gzip=${String(gzip)} bytes`)
})
