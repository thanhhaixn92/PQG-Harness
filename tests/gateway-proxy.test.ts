import assert from 'node:assert/strict'
import test from 'node:test'
import * as gatewayModule from '../agents/_gateway-proxy.ts'

const gatewayApi = gatewayModule as typeof gatewayModule & Record<string, any>

test('Gateway adapter normalizes developer messages without mutating other fields', () => {
  const input = {
    model: 'test-model',
    messages: [
      { role: 'developer', content: 'system instructions' },
      { role: 'user', content: 'hello' },
    ],
    stream: true,
  }
  assert.deepEqual(gatewayModule.normalizeGatewayRequest(input), {
    model: 'test-model',
    messages: [
      { role: 'system', content: 'system instructions' },
      { role: 'user', content: 'hello' },
    ],
    stream: true,
  })
})

test('Gateway response headers expose only the reviewed allowlist', () => {
  assert.equal(typeof gatewayApi.gatewayResponseHeaders, 'function')
  const input = new Headers({
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'retry-after': '3',
    'x-request-id': 'req-safe',
    'server': 'provider-secret-shape',
    'x-provider-debug': 'sensitive-diagnostics',
    'www-authenticate': 'Bearer realm="internal"',
    'set-cookie': 'provider=secret',
    'content-length': '999',
  })
  const output = gatewayApi.gatewayResponseHeaders(input) as Headers

  assert.deepEqual([...output.entries()].sort(), [
    ['cache-control', 'no-cache'],
    ['content-type', 'text/event-stream'],
    ['retry-after', '3'],
    ['x-request-id', 'req-safe'],
  ])
})

test('publicError returns a stable code-only body', () => {
  assert.equal(typeof gatewayApi.publicError, 'function')
  assert.deepEqual(gatewayApi.publicError('AI_GATEWAY_PROXY_FAILED'), {
    error: 'AI_GATEWAY_PROXY_FAILED',
  })
})
