import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const publicDir = join(root, 'public')
const pqgApplicationShellId = '@pqg/application-shell'
const reactPlatformExternals = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
])

function hash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

const entry = join(root, 'packages', 'application-shell', 'src', 'client.tsx')
const result = await build({
  configFile: false,
  root,
  logLevel: 'silent',
  build: {
    write: false,
    target: 'es2022',
    minify: 'esbuild',
    cssCodeSplit: false,
    lib: {
      entry,
      formats: ['cjs'],
      fileName: 'client',
    },
    rollupOptions: {
      external: id => reactPlatformExternals.has(id),
      output: { inlineDynamicImports: true },
    },
  },
})
const runs = Array.isArray(result) ? result : [result]
const outputs = runs.flatMap(run => Array.isArray(run?.output) ? run.output : [])
const chunk = outputs.find(output => output.type === 'chunk' && output.isEntry)
const css = outputs.find(output => output.type === 'asset' && output.fileName.endsWith('.css'))
if (!chunk) throw new Error('PQG Application Shell bundle produced no entry chunk.')
if (!css || typeof css.source !== 'string') throw new Error('PQG Application Shell bundle produced no CSS asset.')

const bundled = [
  'window.__ModuleLoader__.load({ id: ' + JSON.stringify(pqgApplicationShellId) + ', factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
  chunk.code.trimEnd(),
  'return module.exports; } });',
  '',
].join('\n')
const targetDir = join(publicDir, 'plugins', ...pqgApplicationShellId.split('/'))
await mkdir(targetDir, { recursive: true })
await writeFile(join(targetDir, 'client.js'), bundled)
await writeFile(join(targetDir, 'styles.css'), css.source)

const bundleRev = hash(bundled)
const cssUrl = `/plugins/${pqgApplicationShellId}/styles.css?rev=${hash(css.source)}`
const indexPath = join(root, 'index.html')
const publicIndexPath = join(publicDir, 'index.html')
const html = await readFile(indexPath, 'utf8')
const manifestMatch = html.match(/window\.__DSH_BOOT__ = (\{.*?\});\n\(\(\) => \{/s)
if (!manifestMatch) throw new Error('Prepared DSH Web index no longer exposes the boot manifest patch point.')
const manifest = JSON.parse(manifestMatch[1])
const shellEntry = manifest.entries.find(entry => entry.id === pqgApplicationShellId)
if (!shellEntry) throw new Error('Prepared DSH Web graph is missing the PQG Application Shell entry.')
shellEntry.url = `/plugins/${pqgApplicationShellId}/client.js?rev=${bundleRev}`
shellEntry.rev = bundleRev
manifest.rev = hash(JSON.stringify(manifest.entries))
const serialized = JSON.stringify(manifest).replaceAll('<', '\\u003c')
let next = html.replace(manifestMatch[1], serialized)
const spikeLink = next.match(/<link rel="stylesheet" data-pqg-mantine-spike href="[^"]+" \/>/)?.[0]
if (!spikeLink) throw new Error('Prepared DSH Web index no longer exposes the Mantine CSS insertion point.')
next = next.replace(spikeLink, `${spikeLink}\n    <link rel="stylesheet" data-pqg-application-shell href="${cssUrl}" />`)
await writeFile(indexPath, next)
await writeFile(publicIndexPath, next)
