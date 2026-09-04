import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lockPackageEntry, verifySubresourceIntegrity } from './lib/lock-integrity.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function linuxLibc() {
  const glibc = process.report?.getReport()?.header?.glibcVersionRuntime
  return glibc ? 'gnu' : 'musl'
}

function rollupHostNative() {
  const platform = process.platform
  const arch = process.arch
  if (platform === 'win32') return `@rollup/rollup-win32-${arch}-msvc`
  if (platform === 'linux') return `@rollup/rollup-linux-${arch}-${linuxLibc()}`
  return `@rollup/rollup-${platform}-${arch}`
}

function hostNatives() {
  return [
    rollupHostNative(),
    `@esbuild/${process.platform}-${process.arch}`,
    `@koromix/koffi-${process.platform}-${process.arch}`,
    ...(process.platform === 'darwin' ? ['fsevents'] : []),
  ]
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    ...options,
  })
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim()
    throw new Error(`${command} failed${detail ? `: ${detail}` : '.'}`)
  }
  return result
}

async function unpackPackage(name, scratch) {
  const entry = lockPackageEntry(lock, name)
  const spec = `${name}@${entry.version}`
  const packed = run('npm', [
    'pack',
    '--json',
    '--ignore-scripts',
    '--pack-destination', scratch,
    spec,
  ])
  let filename
  try {
    const result = JSON.parse(packed.stdout)
    filename = result.at(-1)?.filename
  } catch {
    // The error below includes npm's output without leaking registry credentials.
  }
  if (typeof filename !== 'string' || !filename) {
    throw new Error(`npm pack did not return a tarball for ${spec}.`)
  }

  const tarball = join(scratch, filename)
  const bytes = await readFile(tarball)
  verifySubresourceIntegrity(bytes, entry.integrity)

  const destination = join(root, 'node_modules', ...name.split('/'))
  await rm(destination, { recursive: true, force: true })
  await mkdir(destination, { recursive: true })
  run('tar', [
    '-xzf', tarball,
    '-C', destination,
    '--strip-components=1',
  ], { stdio: 'pipe' })
}

async function assertLinuxRuntimeNatives() {
  const required = [
    '@img/sharp-linux-x64',
    '@img/sharp-libvips-linux-x64',
    '@koromix/koffi-linux-x64',
  ]
  const missing = []
  for (const name of required) {
    if (!await pathExists(join(root, 'node_modules', name, 'package.json'))) missing.push(name)
  }
  if (missing.length > 0) {
    throw new Error(`Linux runtime native dependencies are missing: ${missing.join(', ')}`)
  }
}

const missing = []
for (const name of hostNatives()) {
  if (!await pathExists(join(root, 'node_modules', name, 'package.json'))) missing.push(name)
}

if (missing.length === 0) {
  console.log('Host native dependencies are already present.')
} else {
  const scratch = await mkdtemp(join(tmpdir(), 'dsh-host-natives-'))
  try {
    console.log(`Restoring host natives without changing the Linux dependency tree: ${missing.join(', ')}`)
    for (const name of missing) await unpackPackage(name, scratch)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

await assertLinuxRuntimeNatives()
console.log('Linux Sharp, libvips, and Koffi runtime dependencies are present.')
