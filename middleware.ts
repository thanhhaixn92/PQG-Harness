const SESSION_COOKIE = 'pqg_session'
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
const MIN_SECRET_LENGTH = 32
const PRODUCT_CSS_PATH = '/pqg-product-ui.css'
const PRODUCT_JS_PATH = '/pqg-product-ui.js'

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
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PQG</title>
<style>
:root{color-scheme:light dark;font-family:system-ui,sans-serif}body{margin:0;min-height:100vh;display:grid;place-items:center;background:Canvas;color:CanvasText}.card{width:min(28rem,calc(100vw - 2rem));padding:2rem;border:1px solid color-mix(in srgb,CanvasText 20%,transparent);border-radius:1rem}label,input,button{display:block;width:100%;box-sizing:border-box}input,button{font:inherit;padding:.75rem;margin-top:.5rem}button{margin-top:1rem;cursor:pointer}p{line-height:1.5}
</style>
</head>
<body>
<main class="card">
<h1>PQG</h1>
<p>Nhập khóa truy cập cá nhân để tiếp tục.</p>
${safeMessage}
<form method="post" action="/pqg-login" autocomplete="off">
<label for="accessKey">Khóa truy cập</label>
<input id="accessKey" name="accessKey" type="password" required autocomplete="current-password">
<button type="submit">Tiếp tục</button>
</form>
</main>
</body>
</html>`
}

export function pqgProductCss(): string {
  return `
:root {
  --pqg-accent: #6d5dfc;
}
#dsh-makers-chrome,
#dsh-makers-powered,
#dsh-makers-actions,
#dsh-makers-contact {
  display: none !important;
}
button[class*="_brand"] > :not(.pqg-sidebar-brand) {
  display: none !important;
}
.pqg-sidebar-brand {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  color: var(--dsw-alias-label-primary, currentColor);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -.02em;
}
.pqg-rail-mark {
  display: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: var(--pqg-accent);
  color: #fff;
  font-size: 12px;
  font-weight: 750;
  line-height: 1;
}
[class*="_collapsed"] .pqg-rail-mark {
  display: inline-flex;
}
[class*="_collapsed"] [class*="_railFish"] {
  display: none !important;
}
[class*="_composerHero"] [class*="_fish"] {
  display: none !important;
}
.pqg-hero-headline {
  letter-spacing: -.025em;
}
@media (max-width: 720px) {
  .pqg-sidebar-brand { font-size: 16px; }
}
`.trim()
}

export function pqgProductScript(): string {
  return String.raw`(() => {
  const translations = new Map([
    ['New Session', 'Phiên mới'],
    ['No sessions yet', 'Chưa có phiên nào'],
    ['Cloud Workspace', 'Không gian làm việc'],
    ['Workspaces', 'Không gian làm việc'],
    ['Choose workspace', 'Chọn không gian làm việc'],
    ['Choose a workspace to start', 'Chọn không gian làm việc để bắt đầu'],
    ['Into the Unknown', 'Hôm nay bạn muốn làm gì?'],
    ['Settings', 'Cài đặt'],
    ['General', 'Chung'],
    ['Language', 'Ngôn ngữ'],
    ['English', 'Tiếng Việt'],
    ['Models', 'Mô hình AI'],
    ['Models are provided by EdgeOne Makers.', 'Chọn mô hình AI bạn muốn sử dụng.'],
    ['Plugins', 'Tiện ích'],
    ['Plugin inventory', 'Danh sách tiện ích'],
    ['Tools', 'Công cụ'],
    ['Skills', 'Kỹ năng'],
    ['Permission', 'Quyền truy cập'],
    ['Permissions', 'Quyền truy cập'],
    ['Read only', 'Chỉ đọc'],
    ['read-only', 'Chỉ đọc'],
    ['Workspace write', 'Cho phép chỉnh sửa'],
    ['workspace-write', 'Cho phép chỉnh sửa'],
    ['Full access', 'Toàn quyền'],
    ['Inspect the EdgeOne Makers sandbox: list and read files. Writes, commands, and preview will ask you to confirm.', 'Chỉ xem và đọc tệp. Khi cần chỉnh sửa, chạy lệnh hoặc mở bản xem trước, hệ thống sẽ hỏi bạn xác nhận.'],
    ['Read and write files in the EdgeOne Makers sandbox. Commands and preview will ask you to confirm.', 'Đọc và chỉnh sửa tệp. Khi cần chạy lệnh hoặc mở bản xem trước, hệ thống sẽ hỏi bạn xác nhận.'],
    ['Full Makers sandbox access: files, commands, and preview, without extra confirmation. The local machine is still never accessible.', 'Cho phép thao tác tệp, chạy lệnh và mở bản xem trước mà không hỏi lại. Hệ thống không thể truy cập máy cá nhân của bạn.'],
    ['Choose the default Makers sandbox permission for new sessions: read-only, file write, or Full access with commands and preview', 'Chọn quyền mặc định cho phiên mới: chỉ đọc, cho phép chỉnh sửa, hoặc toàn quyền gồm chạy lệnh và xem trước.'],
    ['Full access lets the agent run commands and publish previews in the EdgeOne Makers sandbox without extra confirmation. The local machine is still never accessible. Only use it when you trust the current task.', 'Toàn quyền cho phép chạy lệnh và mở bản xem trước mà không hỏi lại. Hệ thống không thể truy cập máy cá nhân của bạn. Chỉ dùng khi bạn tin tưởng tác vụ hiện tại.'],
    ['Full access lets new sessions run commands and publish previews in the EdgeOne Makers sandbox without extra confirmation. The local machine is still never accessible. Only use it when you trust subsequent tasks.', 'Toàn quyền cho phép các phiên mới chạy lệnh và mở bản xem trước mà không hỏi lại. Hệ thống không thể truy cập máy cá nhân của bạn. Chỉ dùng khi bạn tin tưởng các tác vụ tiếp theo.'],
    ['To-dos', 'Việc cần làm'],
    ['Session hierarchy', 'Cấu trúc phiên'],
    ['Goal', 'Mục tiêu'],
    ['Goals', 'Mục tiêu'],
    ['Plan', 'Kế hoạch'],
    ['Stop', 'Dừng'],
    ['Cancel', 'Hủy'],
    ['Close', 'Đóng'],
    ['Save', 'Lưu'],
    ['Retry', 'Thử lại'],
    ['Allow', 'Cho phép'],
    ['Deny', 'Từ chối'],
    ['Loading…', 'Đang tải…'],
    ['Loading...', 'Đang tải…'],
    ['Learn more', 'Tìm hiểu thêm']
  ]);
  const excluded = 'pre,code,textarea,input,[contenteditable="true"],[data-message-id],[class*="_message"],[class*="_markdown"]';

  function translateText(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest(excluded)) continue;
      const raw = node.nodeValue || '';
      const text = raw.trim();
      const translated = translations.get(text);
      if (translated === undefined || translated === text) continue;
      node.nodeValue = raw.replace(text, translated);
    }
  }

  function hideExactLabel(label) {
    for (const element of document.querySelectorAll('span,div,p')) {
      if (element.children.length !== 0 || element.textContent?.trim() !== label) continue;
      if (element.closest(excluded)) continue;
      element.hidden = true;
    }
  }

  function applyBrand() {
    document.title = 'PQG';
    document.documentElement.lang = 'vi';
    for (const button of document.querySelectorAll('button[class*="_brand"]')) {
      if (!button.querySelector('.pqg-sidebar-brand')) {
        const wordmark = document.createElement('span');
        wordmark.className = 'pqg-sidebar-brand';
        wordmark.textContent = 'PQG';
        button.appendChild(wordmark);
      }
      button.setAttribute('aria-label', 'Bắt đầu phiên mới');
    }
    for (const button of document.querySelectorAll('button[class*="_toggle"]')) {
      if (button.querySelector('.pqg-rail-mark')) continue;
      const mark = document.createElement('span');
      mark.className = 'pqg-rail-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = 'P';
      button.prepend(mark);
    }
  }

  function markHeadline() {
    for (const element of document.querySelectorAll('h1,h2,h3,div,span')) {
      if (element.children.length !== 0) continue;
      if (element.textContent?.trim() === 'Hôm nay bạn muốn làm gì?') {
        element.classList.add('pqg-hero-headline');
      }
    }
  }

  function apply(root = document.body) {
    if (!root) return;
    translateText(root);
    hideExactLabel('Preview');
    hideExactLabel('中文');
    applyBrand();
    markHeadline();
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      apply();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => apply(), { once: true });
  } else {
    apply();
  }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
})();`
}

function productAssetResponse(body: string, contentType: string): Response {
  return new Response(body, {
    headers: {
      'cache-control': 'private, max-age=3600',
      'content-type': contentType,
      'x-content-type-options': 'nosniff',
    },
  })
}

export async function injectPqgProductShell(response: Response): Promise<Response> {
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  if (!contentType.includes('text/html')) return response

  let html = await response.text()
  if (!html.includes(PRODUCT_CSS_PATH)) {
    html = html.replace('</head>', `<link rel="stylesheet" href="${PRODUCT_CSS_PATH}"></head>`)
  }
  if (!html.includes(PRODUCT_JS_PATH)) {
    html = html.replace('</body>', `<script src="${PRODUCT_JS_PATH}"></script></body>`)
  }
  html = html.replace(/<html\s+lang=["'][^"']*["']/, '<html lang="vi"')

  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
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
      return htmlResponse(401, loginPage('Khóa truy cập không đúng.'))
    }

    return redirect('/', sessionCookie(await createSession(secret)))
  }

  if (url.pathname === '/pqg-logout') {
    return redirect('/pqg-login', clearedSessionCookie())
  }

  if (await validSession(secret, cookieValue(request, SESSION_COOKIE))) {
    if (url.pathname === PRODUCT_CSS_PATH) {
      return productAssetResponse(pqgProductCss(), 'text/css; charset=utf-8')
    }
    if (url.pathname === PRODUCT_JS_PATH) {
      return productAssetResponse(pqgProductScript(), 'text/javascript; charset=utf-8')
    }
    const response = await context.next()
    return wantsHtml(request) ? injectPqgProductShell(response) : response
  }

  if (wantsHtml(request)) {
    return redirect('/pqg-login')
  }

  return jsonError(401, 'PQG_AUTH_REQUIRED')
}
