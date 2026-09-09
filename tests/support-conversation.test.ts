import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const clientSourceUrl = new URL('../packages/application-shell/src/client.tsx', import.meta.url)

function rootSeatPattern(name: string, kind: string, scope: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`['\"]${escaped}['\"]\\s*:\\s*\\{\\s*kind:\\s*['\"]${kind}['\"]\\s*,\\s*scope:\\s*['\"]${scope}['\"]`)
}

test('PQG root restores the official DSH session/conversation seat graph and layout bridge', async () => {
  const source = await readFile(clientSourceUrl, 'utf8')

  assert.match(source, rootSeatPattern('sidebar', 'single', 'root'))
  assert.match(source, rootSeatPattern('conversation', 'single', 'session-maybe'))
  assert.match(source, rootSeatPattern('details', 'single', 'session'))
  assert.match(source, rootSeatPattern('shell.overlay', 'list', 'root'))
  assert.match(source, /ctx\.reflect\.provide\(['\"]layout['\"]/)

  assert.match(source, /renderSlot\(['\"]sidebar['\"]/)
  assert.match(source, /renderSlot\(['\"]conversation['\"]/)
  assert.match(source, /renderSlot\(['\"]details['\"]/)
  assert.match(source, /renderSlot\(['\"]shell\.overlay['\"]/)
})

test('Support delegates transcript, queue, partial, composer and Stop to DSH conversation UI', async () => {
  const source = await readFile(clientSourceUrl, 'utf8')

  assert.doesNotMatch(source, /data-pqg-support-composer/)
  assert.doesNotMatch(source, /data-pqg-support-send/)
  assert.doesNotMatch(source, /data-pqg-support-stop/)
  assert.doesNotMatch(source, /snapshot\?\.queue/)
  assert.doesNotMatch(source, /snapshot\?\.partial/)
  assert.doesNotMatch(source, /<textarea/)
  assert.match(source, /renderSlot\(['\"]conversation['\"]/)
})
