import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function json(path: string): Promise<any> {
  return JSON.parse(await readFile(new URL(path, root), 'utf8'))
}

test('direct DSH dependencies are pinned to the reviewed rc.6 wave', async () => {
  const pkg = await json('package.json')
  const lock = await json('package-lock.json')
  const direct = Object.entries(pkg.dependencies as Record<string, string>)
    .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))

  assert.ok(direct.length > 0)
  for (const [name, version] of direct) {
    assert.equal(version, '0.1.0-rc.6', `${name} manifest spec must be exact`)
    assert.equal(
      lock.packages?.[`node_modules/${name}`]?.version,
      '0.1.0-rc.6',
      `${name} lock entry must stay on rc.6`,
    )
  }
})

test('ws is pinned to the reviewed hardened version', async () => {
  const pkg = await json('package.json')
  const lock = await json('package-lock.json')

  assert.equal(pkg.dependencies?.ws, '8.21.3')
  assert.equal(lock.packages?.['node_modules/ws']?.version, '8.21.3')
})
