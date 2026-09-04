import assert from 'node:assert/strict'
import test from 'node:test'

const EXPECTED = {
  name: 'PQG Harness',
  shortName: 'PQG',
  repositoryUrl: 'https://github.com/thanhhaixn92/PQG-Harness',
  upstreamAdapterUrl: 'https://github.com/TencentEdgeOne/deepseek-harness',
  upstreamCoreUrl: 'https://github.com/deepseek-ai/deepseek-harness',
}

test('PQG product config is a frozen single source of identity', async () => {
  const { product } = await import('../config/product.mjs')
  assert.equal(Object.isFrozen(product), true)
  assert.deepEqual(product, EXPECTED)
})
