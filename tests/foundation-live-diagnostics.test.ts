import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sourceDiagnosticsUrl = new URL('../src/pqg-diagnostics.html', import.meta.url)
const publicDiagnosticsUrl = new URL('../public/pqg-diagnostics.html', import.meta.url)
const productLayerUrl = new URL('../scripts/apply-product-layer.mjs', import.meta.url)

test('temporary Foundation diagnostics are not shipped after live verification', async () => {
  assert.equal(existsSync(sourceDiagnosticsUrl), false)
  assert.equal(existsSync(publicDiagnosticsUrl), false)

  const productLayer = await readFile(productLayerUrl, 'utf8')
  assert.doesNotMatch(productLayer, /pqg-diagnostics\.html/)
})
