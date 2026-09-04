import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const moduleUrl = new URL('../scripts/write-build-meta.mjs', import.meta.url).href

async function loadBuildMetaModule(): Promise<any> {
  return import(moduleUrl)
}

test('buildMeta accepts exact git identities and package version', async () => {
  const { buildMeta } = await loadBuildMetaModule()
  const commit = 'a'.repeat(40)
  const tree = 'b'.repeat(40)
  assert.deepEqual(buildMeta({ commit, tree, packageVersion: '0.1.0' }), {
    commit,
    tree,
    packageVersion: '0.1.0',
  })
})

test('buildMeta rejects unknown or malformed git identities', async () => {
  const { buildMeta } = await loadBuildMetaModule()
  assert.throws(() => buildMeta({ commit: 'unknown', tree: 'b'.repeat(40), packageVersion: '0.1.0' }), /commit/i)
  assert.throws(() => buildMeta({ commit: 'a'.repeat(40), tree: 'not-a-tree', packageVersion: '0.1.0' }), /tree/i)
  assert.throws(() => buildMeta({ commit: 'a'.repeat(40), tree: 'b'.repeat(40), packageVersion: '' }), /package version/i)
})

test('prepared build emits build-meta after vite', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.match(String(pkg.scripts?.['build:prepared'] || ''), /vite build.*write-build-meta\.mjs/)
  assert.equal(pkg.scripts?.build, 'npm run prepare:dsh-web && npm run build:prepared')
})
