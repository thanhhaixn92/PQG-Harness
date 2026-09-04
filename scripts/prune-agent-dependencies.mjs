import { lstat, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const projectRoot = new URL('../', import.meta.url)
const nodePtyRoot = fileURLToPath(new URL('node_modules/node-pty/', projectRoot))
const subprocessRuntimePath = fileURLToPath(new URL(
  'node_modules/@deepseek-ai/dsh-subprocess-local/lib/index.js',
  projectRoot,
))
const removablePaths = [
  'prebuilds/win32-arm64',
  'prebuilds/win32-x64',
  'third_party/conpty',
  'deps/winpty',
]

async function sizeOf(path) {
  let stats
  try {
    stats = await lstat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return 0
    throw error
  }
  if (!stats.isDirectory()) return stats.size
  const entries = await readdir(path)
  const sizes = await Promise.all(entries.map(entry => sizeOf(join(path, entry))))
  return sizes.reduce((total, size) => total + size, 0)
}

async function removeSourceMaps(path) {
  let removedBytes = 0
  let removedFiles = 0
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const entryPath = join(path, entry.name)
    if (entry.isDirectory()) {
      const removed = await removeSourceMaps(entryPath)
      removedBytes += removed.bytes
      removedFiles += removed.files
    } else if (entry.isFile() && entry.name.endsWith('.map')) {
      removedBytes += await sizeOf(entryPath)
      await rm(entryPath, { force: true })
      removedFiles += 1
    }
  }
  return { bytes: removedBytes, files: removedFiles }
}

async function makeNodePtyLazy() {
  const source = await readFile(subprocessRuntimePath, 'utf8')
  const eagerImport = 'import * as nodePty from "node-pty";\n'
  const terminalMethod = 'async spawnTerminal(spec) {\n\t\tconst file = spec.argv[0];'
  const lazyTerminalMethod = 'async spawnTerminal(spec) {\n\t\tconst nodePty = await import("node-pty");\n\t\tconst file = spec.argv[0];'

  if (source.includes(lazyTerminalMethod)) return false
  if (!source.includes(eagerImport) || !source.includes(terminalMethod)) {
    throw new Error('Unsupported @deepseek-ai/dsh-subprocess-local build; cannot make node-pty lazy.')
  }
  await writeFile(
    subprocessRuntimePath,
    source.replace(eagerImport, '').replace(terminalMethod, lazyTerminalMethod),
  )
  return true
}

const patchedNodePty = await makeNodePtyLazy()
console.log(`${patchedNodePty ? 'Patched' : 'Kept'} node-pty as a lazy Makers-only terminal dependency.`)

let removedBytes = 0
for (const relativePath of removablePaths) {
  const path = join(nodePtyRoot, relativePath)
  removedBytes += await sizeOf(path)
  await rm(path, { recursive: true, force: true })
}

console.log(`Pruned ${(removedBytes / 1024 / 1024).toFixed(1)} MiB of Windows-only node-pty files from the Makers agent package.`)

const sourceMaps = await removeSourceMaps(fileURLToPath(new URL('node_modules/', projectRoot)))
console.log(`Pruned ${sourceMaps.files} dependency source maps (${(sourceMaps.bytes / 1024 / 1024).toFixed(1)} MiB) from the Makers agent package.`)
