import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function json(path: string): Promise<any> {
  return JSON.parse(await readFile(new URL(path, root), 'utf8'))
}

function versionAtLeast(actual: string, minimum: string): boolean {
  const left = actual.split('.').map(Number)
  const right = minimum.split('.').map(Number)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0
    const b = right[index] ?? 0
    if (a !== b) return a > b
  }
  return true
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

test('transitive URL and query parsers stay above reviewed security floors', async () => {
  const lock = await json('package-lock.json')
  const fastUri = String(lock.packages?.['node_modules/fast-uri']?.version || '')
  const qs = String(lock.packages?.['node_modules/qs']?.version || '')

  assert.ok(versionAtLeast(fastUri, '3.1.7'), `fast-uri ${fastUri || '(missing)'} must be >= 3.1.7`)
  assert.ok(versionAtLeast(qs, '6.16.0'), `qs ${qs || '(missing)'} must be >= 6.16.0`)
})
