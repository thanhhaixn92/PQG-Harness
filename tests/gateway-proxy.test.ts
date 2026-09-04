import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeGatewayRequest } from '../agents/_gateway-proxy.ts'

test('Gateway adapter normalizes developer messages without mutating other fields', () => {
  const input = {
    model: 'test-model',
    messages: [
      { role: 'developer', content: 'system instructions' },
      { role: 'user', content: 'hello' },
    ],
    stream: true,
  }
  assert.deepEqual(normalizeGatewayRequest(input), {
    model: 'test-model',
    messages: [
      { role: 'system', content: 'system instructions' },
      { role: 'user', content: 'hello' },
    ],
    stream: true,
  })
})
