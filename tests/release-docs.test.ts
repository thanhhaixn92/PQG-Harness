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

test('release docs preserve current verified and remaining live gates', async () => {
  const checklist = await text('docs/release/RELEASE_CHECKLIST.md')
  const status = await text('PROJECT_STATUS.md')

  assert.match(status, /M01[^\n]*(BLOCKED|pending)/i)
  assert.match(status, /M08[^\n]*(PASS|CLOSED)/i)
  assert.match(status, /realtime approval[^\n]*PASS/i)
  assert.match(status, /Protect main[^\n]*ACTIVE/i)
  assert.match(status, /Production[^\n]*build-meta[^\n]*(MATCH|verified)/i)

  assert.match(checklist, /M01[^\n]*BLOCKED/i)
  assert.match(checklist, /M08[^\n]*CLOSED/i)
  assert.match(checklist, /M09[^\n]*CLOSED/i)
  assert.match(checklist, /M13[^\n]*(CLOSED|PARTIAL|BLOCKED)/i)
  assert.doesNotMatch(checklist, /main[^\n]*(?:unprotected|protected:false|required checks off)/i)
})
