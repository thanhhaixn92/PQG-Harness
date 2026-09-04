import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as any
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8')) as any

test('all direct DSH dependencies stay on the exact reviewed rc.6 wave', () => {
  const direct = Object.entries(manifest.dependencies ?? {})
    .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))

  assert.ok(direct.length > 0)
  for (const [name, version] of direct) {
    assert.equal(version, '0.1.0-rc.6', `${name} manifest spec must be exact`)
    assert.equal(lock.packages?.[`node_modules/${name}`]?.version, '0.1.0-rc.6', `${name} lock version must remain rc.6`)
  }
})

test('ws is pinned and locked to the reviewed 8.21.3 patch', () => {
  assert.equal(manifest.dependencies?.ws, '8.21.3')
  assert.equal(lock.packages?.['']?.dependencies?.ws, '8.21.3')
  assert.equal(lock.packages?.['node_modules/ws']?.version, '8.21.3')
})
