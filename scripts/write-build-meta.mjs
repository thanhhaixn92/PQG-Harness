import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HEX40 = /^[0-9a-f]{40}$/i

export function buildMeta({ commit, tree, packageVersion }) {
  if (!HEX40.test(String(commit || ''))) throw new Error('Build commit must be an exact 40-character git SHA.')
  if (!HEX40.test(String(tree || ''))) throw new Error('Build tree must be an exact 40-character git SHA.')
  if (typeof packageVersion !== 'string' || !packageVersion.trim()) throw new Error('Package version is required.')
  return {
    commit: String(commit).toLowerCase(),
    tree: String(tree).toLowerCase(),
    packageVersion: packageVersion.trim(),
  }
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

export async function writeBuildMeta({ root = fileURLToPath(new URL('..', import.meta.url)) } = {}) {
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const meta = buildMeta({
    commit: git(['rev-parse', 'HEAD'], root),
    tree: git(['rev-parse', 'HEAD^{tree}'], root),
    packageVersion: packageJson.version,
  })
  const output = join(root, 'dist', 'build-meta.json')
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(meta, null, 2)}\n`)
  return meta
}

const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false
if (invokedPath) {
  await writeBuildMeta()
}
