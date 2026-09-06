import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const publicDir = join(root, 'public')
const pluginId = '@pqg/mantine-spike'
const reactPlatformExternals = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
])

function hash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function buildOutputs(result) {
  const runs = Array.isArray(result) ? result : [result]
  const outputs = runs.flatMap(run => Array.isArray(run?.output) ? run.output : [])
  if (outputs.length === 0) throw new Error('Mantine spike bundle produced no output.')
  return outputs
}

async function bundleMantineClient() {
  const entry = join(root, 'src', 'pqg-mantine-spike-client.tsx')
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

  const outputs = buildOutputs(result)
  const chunk = outputs.find(output => output.type === 'chunk' && output.isEntry)
  const css = outputs.find(output => output.type === 'asset' && output.fileName.endsWith('.css'))
  if (!chunk) throw new Error('Mantine spike bundle produced no entry chunk.')
  if (!css || typeof css.source !== 'string') throw new Error('Mantine spike bundle produced no CSS asset.')

  const bundled = [
    `window.__ModuleLoader__.load({ id: ${JSON.stringify(pluginId)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
    chunk.code.trimEnd(),
    'return module.exports; } });',
    '',
  ].join('\n')

  const targetDir = join(publicDir, 'plugins', ...pluginId.split('/'))
  await mkdir(targetDir, { recursive: true })
  await writeFile(join(targetDir, 'client.js'), bundled)
  await writeFile(join(targetDir, 'styles.css'), css.source)

  return {
    entry: {
      id: pluginId,
      url: `/plugins/${pluginId}/client.js?rev=${hash(bundled)}`,
      rev: hash(bundled),
      inject: [
        '@deepseek-ai/dsh-client-runtime',
        '@deepseek-ai/dsh-client-ui-settings',
        '@deepseek-ai/dsh-client-ui-slots',
      ],
    },
    cssUrl: `/plugins/${pluginId}/styles.css?rev=${hash(css.source)}`,
  }
}

function patchHtml(source, entry, cssUrl) {
  const boot = source.match(/window\.__DSH_BOOT__ = (\{.*?\});/)
  if (!boot) throw new Error('Prepared DSH Web boot manifest was not found.')
  const manifest = JSON.parse(boot[1])
  const entries = [
    ...manifest.entries.filter(candidate => candidate.id !== pluginId),
    entry,
  ].sort((left, right) => left.id.localeCompare(right.id))
  const graph = { rev: hash(JSON.stringify(entries)), entries }
  let next = source.replace(boot[0], `window.__DSH_BOOT__ = ${JSON.stringify(graph).replaceAll('<', '\\u003c')};`)

  const link = `<link rel="stylesheet" data-pqg-mantine-spike href="${cssUrl}" />`
  const existing = /<link[^>]*data-pqg-mantine-spike[^>]*>/
  if (existing.test(next)) return next.replace(existing, link)
  const charset = '<meta charset="utf-8" />'
  if (!next.includes(charset)) throw new Error('Prepared DSH Web charset marker was not found.')
  return next.replace(charset, `${charset}\n    ${link}`)
}

const prepared = await bundleMantineClient()
for (const path of [join(root, 'index.html'), join(publicDir, 'index.html')]) {
  const source = await readFile(path, 'utf8')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, patchHtml(source, prepared.entry, prepared.cssUrl))
}
