import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const middlewareUrl = new URL('../middleware.ts', import.meta.url)
const envExampleUrl = new URL('../.env.example', import.meta.url)
const origin = 'https://pqg-harness.edgeone.cool'
const secret = 'foundation-personal-secret-0123456789abcdef'

async function loadMiddleware(): Promise<any> {
  assert.equal(existsSync(middlewareUrl), true, 'middleware.ts must exist')
  return import(`${middlewareUrl.href}?test=${Date.now()}-${Math.random()}`)
}

function makeContext(request: Request, env: Record<string, string> = { PQG_ACCESS_SECRET: secret }) {
  let nextCalls = 0
  return {
    context: {
      request,
      env,
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
  const { context } = makeContext(request)
  const response = await middleware(context)
  assert.equal(response.status, 303)
  const setCookie = response.headers.get('set-cookie') || ''
  const pair = setCookie.split(';', 1)[0]
  assert.match(pair, /^pqg_session=/)
  return pair
}

test('single-user middleware exists, matches all routes, and documents its secret', async () => {
  const { config } = await loadMiddleware()
  assert.deepEqual(config?.matcher, ['/:path*'])
  const envExample = await readFile(envExampleUrl, 'utf8')
  assert.match(envExample, /^PQG_ACCESS_SECRET=/m)
})

test('missing access secret fails closed before the application', async () => {
  const { middleware } = await loadMiddleware()
  const probe = makeContext(new Request(`${origin}/`, { headers: { accept: 'text/html' } }), {})
  const response = await middleware(probe.context)
  assert.equal(response.status, 503)
  assert.equal(probe.nextCalls(), 0)
  assert.match(await response.text(), /PQG_ACCESS_NOT_CONFIGURED/)
})

test('anonymous browser navigation is redirected to the login page', async () => {
  const { middleware } = await loadMiddleware()
  const probe = makeContext(new Request(`${origin}/`, { headers: { accept: 'text/html' } }))
  const response = await middleware(probe.context)
  assert.equal(response.status, 303)
  assert.match(response.headers.get('location') || '', /\/pqg-login$/)
  assert.equal(probe.nextCalls(), 0)
})

test('anonymous API access is rejected before sidecar or Agent work', async () => {
  const { middleware } = await loadMiddleware()
  const probe = makeContext(new Request(`${origin}/api/agentPreset.list`, { headers: { accept: 'application/json' } }))
  const response = await middleware(probe.context)
  assert.equal(response.status, 401)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(probe.nextCalls(), 0)
  assert.deepEqual(await response.json(), { error: 'PQG_AUTH_REQUIRED' })
})

test('login form never serializes the configured secret', async () => {
  const { middleware } = await loadMiddleware()
  const { context } = makeContext(new Request(`${origin}/pqg-login`, { headers: { accept: 'text/html' } }))
  const response = await middleware(context)
  assert.equal(response.status, 200)
  const body = await response.text()
  assert.match(body, /method="post"/i)
  assert.match(body, /name="accessKey"/)
  assert.doesNotMatch(body, new RegExp(secret))
})

test('invalid login is rejected without setting a session cookie', async () => {
  const { middleware } = await loadMiddleware()
  const request = new Request(`${origin}/pqg-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ accessKey: 'wrong-secret' }),
  })
  const { context } = makeContext(request)
  const response = await middleware(context)
  assert.equal(response.status, 401)
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('valid login sets only a signed hardened session cookie', async () => {
  const { middleware } = await loadMiddleware()
  const request = new Request(`${origin}/pqg-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ accessKey: secret }),
  })
  const { context } = makeContext(request)
  const response = await middleware(context)
  assert.equal(response.status, 303)
  const setCookie = response.headers.get('set-cookie') || ''
  assert.match(setCookie, /pqg_session=/)
  assert.match(setCookie, /HttpOnly/i)
  assert.match(setCookie, /Secure/i)
  assert.match(setCookie, /SameSite=Strict/i)
  assert.match(setCookie, /Path=\//i)
  assert.match(setCookie, /Max-Age=604800/i)
  assert.doesNotMatch(setCookie, new RegExp(secret))
})

test('a valid session cookie passes through while a tampered cookie is rejected', async () => {
  const { middleware } = await loadMiddleware()
  const cookie = await issueSessionCookie(middleware)

  const allowed = makeContext(new Request(`${origin}/`, { headers: { cookie, accept: 'text/html' } }))
  const allowedResponse = await middleware(allowed.context)
  assert.equal(allowedResponse.status, 200)
  assert.equal(await allowedResponse.text(), 'NEXT')
  assert.equal(allowed.nextCalls(), 1)

  const tampered = makeContext(new Request(`${origin}/api/agentPreset.list`, {
    headers: { cookie: `${cookie}x`, accept: 'application/json' },
  }))
  const rejectedResponse = await middleware(tampered.context)
  assert.equal(rejectedResponse.status, 401)
  assert.equal(tampered.nextCalls(), 0)
})

test('logout clears the session cookie without touching application routes', async () => {
  const { middleware } = await loadMiddleware()
  const cookie = await issueSessionCookie(middleware)
  const probe = makeContext(new Request(`${origin}/pqg-logout`, { headers: { cookie } }))
  const response = await middleware(probe.context)
  assert.equal(response.status, 303)
  assert.match(response.headers.get('set-cookie') || '', /pqg_session=;/)
  assert.match(response.headers.get('set-cookie') || '', /Max-Age=0/i)
  assert.equal(probe.nextCalls(), 0)
})
