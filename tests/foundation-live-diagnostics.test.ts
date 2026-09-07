import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const middlewareUrl = new URL('../middleware.ts', import.meta.url)
const diagnosticsUrl = new URL('../public/pqg-diagnostics.html', import.meta.url)
const origin = 'https://pqg-harness.edgeone.cool'
const secret = 'foundation-personal-secret-0123456789abcdef'

async function loadMiddleware(): Promise<any> {
  assert.equal(existsSync(middlewareUrl), true)
  return import(`${middlewareUrl.href}?test=${Date.now()}-${Math.random()}`)
}

function makeContext(request: Request) {
  let nextCalls = 0
  return {
    context: {
      request,
      env: { PQG_ACCESS_SECRET: secret },
      next() {
        nextCalls += 1
        return new Response('NEXT', { status: 200 })
      },
    },
    nextCalls: () => nextCalls,
  }
}

async function issueSessionCookie(middleware: (context: any) => Promise<Response>): Promise<string> {
  const request = new Request(`${origin}/pqg-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ accessKey: secret }),
  })
  const response = await middleware(makeContext(request).context)
  assert.equal(response.status, 303)
  return (response.headers.get('set-cookie') || '').split(';', 1)[0]
}

test('Foundation diagnostics static page stays behind PQG auth', async () => {
  const { middleware } = await loadMiddleware()
  const path = '/pqg-diagnostics.html'

  const anonymous = makeContext(new Request(`${origin}${path}`, { headers: { accept: 'text/html' } }))
  const anonymousResponse = await middleware(anonymous.context)
  assert.equal(anonymousResponse.status, 303)
  assert.match(anonymousResponse.headers.get('location') || '', /\/pqg-login$/)
  assert.equal(anonymous.nextCalls(), 0)

  const cookie = await issueSessionCookie(middleware)
  const authenticated = makeContext(new Request(`${origin}${path}`, {
    headers: { cookie, accept: 'text/html' },
  }))
  const response = await middleware(authenticated.context)
  assert.equal(response.status, 200)
  assert.equal(authenticated.nextCalls(), 1)
})

test('Foundation diagnostics probes one conversation context without exposing auth material', async () => {
  assert.equal(existsSync(diagnosticsUrl), true, 'temporary diagnostics page must exist')
  const body = await readFile(diagnosticsUrl, 'utf8')

  assert.match(body, /Makers-Conversation-Id/)
  assert.match(body, /\/api\/pqg\.modules/)
  assert.match(body, /\/api\/session\.list/)
  assert.match(body, /\/api\/workspace\.list/)
  assert.match(body, /credentials:\s*['"]same-origin['"]/)
  assert.doesNotMatch(body, /document\.cookie/)
  assert.doesNotMatch(body, new RegExp(secret))
})
