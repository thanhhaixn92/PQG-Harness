import assert from 'node:assert/strict'
import test from 'node:test'
import { appendMcpRequestMetadata } from '../agents/_mcp-bridge.ts'

test('MCP request diagnostics retain only bounded metadata', () => {
  const initial: Array<{ method: string; url: string; bodyBytes: number }> = []
  let next = appendMcpRequestMetadata(initial, {
    method: 'POST',
    url: '/mcp',
    bodyBytes: 120,
  })

  assert.equal(initial.length, 0)
  assert.equal(next.length, 1)

  for (let index = 0; index < 80; index += 1) {
    next = appendMcpRequestMetadata(next, {
      method: 'POST',
      url: '/mcp',
      bodyBytes: index,
    })
  }

  assert.equal(next.length, 64)
  assert.equal(next[0]?.bodyBytes, 16)
  assert.equal(next.at(-1)?.bodyBytes, 79)
  assert.ok(next.every(entry => !Object.hasOwn(entry, 'body')))
  assert.ok(next.every(entry => Object.keys(entry).sort().join(',') === 'bodyBytes,method,url'))
})
