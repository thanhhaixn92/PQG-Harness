import assert from 'node:assert/strict'
import test from 'node:test'
import { startLocalGatewayProxy } from '../agents/_gateway-proxy.ts'
import { onRequest as hostProxyRequest } from '../agents/api/_proxy.ts'

test('Gateway proxy catch returns a stable code without raw exception detail', async () => {
  const proxy = await startLocalGatewayProxy(() => ({
    env: {
      AI_GATEWAY_BASE_URL: 'http://127.0.0.1:1/v1',
      AI_GATEWAY_API_KEY: 'synthetic-test-key',
    },
  }), 'conv-gateway-error')

  try {
    const response = await fetch(`${proxy.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'synthetic', messages: [] }),
    })
    assert.equal(response.status, 502)
    const text = await response.text()
    assert.deepEqual(JSON.parse(text), { error: 'AI_GATEWAY_PROXY_FAILED' })
    assert.doesNotMatch(text, /fetch failed|ECONNREFUSED|127\.0\.0\.1|synthetic-test-key/i)
  } finally {
    await proxy.close()
  }
})

test('Host proxy catch returns a stable code without raw exception detail', async () => {
  const response = await hostProxyRequest({
    request: {
      url: '/api/anything',
      method: 'GET',
      headers: {},
    },
  })

  assert.equal(response.status, 502)
  const text = await response.text()
  assert.deepEqual(JSON.parse(text), { error: 'DSH_WEB_PROXY_FAILED' })
  assert.doesNotMatch(text, /makers-conversation-id|required|stack|message/i)
})
