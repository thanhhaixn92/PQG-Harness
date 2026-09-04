import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('generated chrome carries PQG identity and upstream attribution', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'))
  assert.match(html, /<title>PQG Harness<\/title>/)
  assert.equal(manifest.name, 'PQG Harness')
  assert.equal(manifest.short_name, 'PQG')
  assert.match(html, /name="pqg-source" content="https:\/\/github\.com\/thanhhaixn92\/PQG-Harness"/)
  assert.match(html, /name="pqg-upstream-adapter" content="https:\/\/github\.com\/TencentEdgeOne\/deepseek-harness"/)
  assert.match(html, /name="pqg-upstream-core" content="https:\/\/github\.com\/deepseek-ai\/deepseek-harness"/)
  assert.match(html, /github\.href = "https:\/\/github\.com\/thanhhaixn92\/PQG-Harness"/)
})

test('PQG contact dialog owns focus and traps keyboard navigation', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(html, /const focusable =/)
  assert.match(html, /event\.key === "Tab"/)
  assert.match(html, /event\.shiftKey/)
  assert.match(html, /const opener = document\.activeElement/)
  assert.match(html, /"inert" in appRoot/)
  assert.match(html, /opener\?\.isConnected/)
  assert.match(html, /document\.addEventListener\('focusin'/)
  assert.match(html, /document\.addEventListener\('focusout'/)
})
