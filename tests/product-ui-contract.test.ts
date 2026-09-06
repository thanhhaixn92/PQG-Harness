import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as middlewareModule from '../middleware.ts'

const productUi = middlewareModule as typeof middlewareModule & Record<string, any>

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

test('PQG product shell injects external product assets without mutating upstream bundles', () => {
  assert.equal(typeof productUi.injectPqgProductShell, 'function')
  const response = productUi.injectPqgProductShell(new Response(
    '<!doctype html><html><head><title>PQG Harness</title></head><body><div id="root"></div></body></html>',
    { headers: { 'content-type': 'text/html; charset=utf-8', 'x-upstream': 'kept' } },
  )) as Promise<Response>
  return response.then(async value => {
    assert.equal(value.headers.get('x-upstream'), 'kept')
    const html = await value.text()
    assert.match(html, /href="\/pqg-product-ui\.css"/)
    assert.match(html, /src="\/pqg-product-ui\.js"/)
    assert.equal((html.match(/pqg-product-ui\.css/g) || []).length, 1)
    assert.equal((html.match(/pqg-product-ui\.js/g) || []).length, 1)
  })
})

test('PQG product assets expose Vietnamese copy and remove provider chrome', () => {
  assert.equal(typeof productUi.pqgProductCss, 'function')
  assert.equal(typeof productUi.pqgProductScript, 'function')

  const css = String(productUi.pqgProductCss())
  const script = String(productUi.pqgProductScript())

  assert.match(css, /#dsh-makers-chrome/)
  assert.match(css, /#dsh-makers-powered/)
  assert.match(css, /#dsh-makers-actions/)
  assert.match(css, /display:\s*none/)
  assert.match(css, /PQG/)

  assert.match(script, /Hôm nay bạn muốn làm gì\?/)
  assert.match(script, /Phiên mới/)
  assert.match(script, /Không gian làm việc/)
  assert.match(script, /Chưa có phiên nào/)
  assert.match(script, /Cài đặt/)
  assert.match(script, /Mô hình AI/)
  assert.match(script, /Tiện ích/)
  assert.match(script, /Quyền truy cập/)
  assert.doesNotMatch(script, /Powered by EdgeOne Makers Agents/)
})
