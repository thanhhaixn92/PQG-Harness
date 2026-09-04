import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function json(path: string): Promise<any> {
  return JSON.parse(await readFile(new URL(path, root), 'utf8'))
}

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0)
    if (delta !== 0) return delta
  }
  return 0
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

test('unused root OpenTelemetry stack is not carried as direct dependencies', async () => {
  const pkg = await json('package.json')
  const direct = Object.keys(pkg.dependencies as Record<string, string>)
    .filter((name) => name.startsWith('@opentelemetry/'))

  assert.deepEqual(direct, [])
})

test('known fixable transitive URI and querystring advisories are outside vulnerable ranges', async () => {
  const lock = await json('package-lock.json')
  const fastUri = lock.packages?.['node_modules/fast-uri']?.version
  const qs = lock.packages?.['node_modules/qs']?.version

  assert.equal(typeof fastUri, 'string')
  assert.equal(typeof qs, 'string')
  assert.ok(compareVersions(fastUri, '3.1.5') > 0, `fast-uri ${fastUri} must be newer than 3.1.5`)
  assert.ok(compareVersions(qs, '6.15.3') > 0, `qs ${qs} must be newer than 6.15.3`)
})
