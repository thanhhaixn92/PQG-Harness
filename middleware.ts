const SESSION_COOKIE = 'pqg_session'
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
const MIN_SECRET_LENGTH = 32

export const config = {
  matcher: ['/:path*'],
}

function noStoreHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({
    'cache-control': 'no-store',
    ...extra,
  })
}

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: noStoreHeaders({ 'content-type': 'application/json; charset=utf-8' }),
  })
}

function htmlResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: noStoreHeaders({
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    }),
  })
}

function loginPage(message = ''): string {
  const safeMessage = message ? `<p role="alert">${message}</p>` : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PQG Harness Access</title>
<style>
:root{color-scheme:light dark;font-family:system-ui,sans-serif}body{margin:0;min-height:100vh;display:grid;place-items:center;background:Canvas;color:CanvasText}.card{width:min(28rem,calc(100vw - 2rem));padding:2rem;border:1px solid color-mix(in srgb,CanvasText 20%,transparent);border-radius:1rem}label,input,button{display:block;width:100%;box-sizing:border-box}input,button{font:inherit;padding:.75rem;margin-top:.5rem}button{margin-top:1rem;cursor:pointer}p{line-height:1.5}
</style>
</head>
<body>
<main class="card">
<h1>PQG Harness</h1>
<p>Enter the personal access key to continue.</p>
${safeMessage}
<form method="post" action="/pqg-login" autocomplete="off">
<label for="accessKey">Access key</label>
<input id="accessKey" name="accessKey" type="password" required autocomplete="current-password">
<button type="submit">Continue</button>
</form>
</main>
</body>
</html>`
}

function accessSecret(context: any): string | null {
  const value = context?.env?.PQG_ACCESS_SECRET
  if (typeof value !== 'string' || value.length < MIN_SECRET_LENGTH) return null
  return value
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') || ''
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() !== name) continue
    return part.slice(index + 1).trim()
  }
  return null
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function hmac(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return bytesToBase64Url(new Uint8Array(signature))
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])
  const a = new Uint8Array(leftHash)
  const b = new Uint8Array(rightHash)
  let diff = a.length ^ b.length
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0)
  }
  return diff === 0
}

async function createSession(secret: string): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  const payload = String(expires)
  const signature = await hmac(secret, payload)
  return `${payload}.${signature}`
}

async function validSession(secret: string, token: string | null): Promise<boolean> {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot <= 0 || token.indexOf('.', dot + 1) !== -1) return false
  const payload = token.slice(0, dot)
  const providedSignature = token.slice(dot + 1)
  if (!/^\d+$/.test(payload) || !providedSignature) return false
  const expires = Number(payload)
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return false
  if (expires > Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS + 60) return false
  const expectedSignature = await hmac(secret, payload)
  return constantTimeEqual(providedSignature, expectedSignature)
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`
}

function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
}

function redirect(location: string, setCookie?: string): Response {
  const headers = noStoreHeaders({ location })
  if (setCookie) headers.set('set-cookie', setCookie)
  return new Response(null, { status: 303, headers })
}

function wantsHtml(request: Request): boolean {
  return (request.headers.get('accept') || '').toLowerCase().includes('text/html')
}

export async function middleware(context: any): Promise<Response> {
  const request = context.request as Request
  const url = new URL(request.url)
  const secret = accessSecret(context)

  if (!secret) {
    return jsonError(503, 'PQG_ACCESS_NOT_CONFIGURED')
  }

  if (url.pathname === '/pqg-login') {
    if (request.method === 'GET' || request.method === 'HEAD') {
      return htmlResponse(200, loginPage())
    }
    if (request.method !== 'POST') {
      return new Response(null, {
        status: 405,
        headers: noStoreHeaders({ allow: 'GET, HEAD, POST' }),
      })
    }

    let supplied = ''
    try {
      const form = await request.formData()
      const value = form.get('accessKey')
      supplied = typeof value === 'string' ? value : ''
    } catch {
      supplied = ''
    }

    if (!(await constantTimeEqual(supplied, secret))) {
      return htmlResponse(401, loginPage('Access denied.'))
    }

    return redirect('/', sessionCookie(await createSession(secret)))
  }

  if (url.pathname === '/pqg-logout') {
    return redirect('/pqg-login', clearedSessionCookie())
  }

  if (await validSession(secret, cookieValue(request, SESSION_COOKIE))) {
    return context.next()
  }

  if (wantsHtml(request)) {
    return redirect('/pqg-login')
  }

  return jsonError(401, 'PQG_AUTH_REQUIRED')
}
