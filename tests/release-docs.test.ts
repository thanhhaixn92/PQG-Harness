import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function text(path: string): Promise<string> {
  return readFile(new URL(path, root), 'utf8')
}

test('Foundation Core ships the required operational and release documents', async () => {
  const required = [
    'SECURITY.md',
    'ARCHITECTURE.md',
    'RUNBOOK.md',
    'CHANGELOG.md',
    'docs/release/RELEASE_CHECKLIST.md',
    'docs/release/KNOWN_LIMITATIONS.md',
  ]
  for (const path of required) {
    const content = await text(path)
    assert.ok(content.trim().length > 200, `${path} must contain substantive guidance`)
  }
})

test('release checklist accounts for every Phase 1B P1 finding', async () => {
  const checklist = await text('docs/release/RELEASE_CHECKLIST.md')
  for (const id of ['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M08', 'M09', 'M10', 'M13']) {
    assert.match(checklist, new RegExp(`\\b${id}\\b`), `${id} missing from release checklist`)
  }
  assert.match(checklist, /CLOSED|BLOCKED|ACCEPTED RISK/)
})

test('release docs preserve blocked live gates and deployment safety', async () => {
  const checklist = await text('docs/release/RELEASE_CHECKLIST.md')
  const limitations = await text('docs/release/KNOWN_LIMITATIONS.md')
  const status = await text('PROJECT_STATUS.md')
  const combined = `${checklist}\n${limitations}\n${status}`

  assert.match(combined, /access\/auth[^\n]*(NOT VERIFIED|BLOCKED)/i)
  assert.match(combined, /Preview[^\n]*BLOCKED/i)
  assert.match(combined, /Auto Deploy[^\n]*DISCONNECTED/i)
  assert.match(combined, /Foundation Freeze[^\n]*(BLOCKED|not complete|not declared)/i)
  assert.doesNotMatch(combined, /Foundation Freeze[^\n]*(COMPLETE|GREEN|PASS)/i)
})
