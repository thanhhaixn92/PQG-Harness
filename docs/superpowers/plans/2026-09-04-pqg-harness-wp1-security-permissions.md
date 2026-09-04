# PQG-Harness WP1 Security & Permission Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make permission failures fail closed, prevent auto-approved workspace tools from reading/writing common secret files, stop retaining raw MCP request bodies, and move sandbox preview credentials out of model-visible tool results.

**Architecture:** Keep the existing three permission presets and MCP tool visibility. Separate the product default (`workspace-write`) from the security fallback (`read-only`), add a deterministic sensitive-path policy at the workspace API boundary, retain only bounded MCP request metadata, and expose credentialed preview URLs through a same-origin browser-only API rather than the MCP trajectory.

**Tech Stack:** TypeScript/ESM, Node test runner, MCP SDK, EdgeOne Makers Agent routes/Sandbox.

**Spec:** `docs/audit/phase-1/PHASE-1B-coordinator-consolidation.md` — M02, M03, M04, M05, M14, M17.

## Global Constraints

- `workspace-write` remains the explicit fresh-session product default.
- Unknown/failed permission resolution must not silently gain write access.
- Full Access remains explicit; this WP does not make it default or remove it.
- Runtime secrets remain in `context.env`, never copied into browser code.
- Do not read real production secrets during testing.
- Application authentication is implemented only if WP5 proves EdgeOne outer access policy is insufficient; do not invent duplicate auth before that evidence.

---

## File map

**Modify:**
- `agents/_makers-mcp-permission.mjs` — fail-closed effective mode and canonical tool metadata.
- `agents/_workspace.ts` — sensitive-path policy; preview tool result no longer contains tokenized URL.
- `agents/_mcp-bridge.ts` — bounded metadata-only request log; tool policy generated from one registry where feasible.
- `scripts/prepare-dsh-web.mjs` — browser-only Preview action in existing Makers chrome.
- `tests/mcp-permission.test.ts`
- `tests/workspace.test.ts`
- `tests/dsh-web.test.ts`

**Create:**
- `agents/api/makers.preview.ts` — same-origin browser-only current preview URL endpoint.
- `tests/mcp-bridge.test.ts` — bridge request-log/privacy behavior.

---

### Task 1: Separate product default from security fallback

**Files:**
- Modify: `agents/_makers-mcp-permission.mjs`
- Modify: `tests/mcp-permission.test.ts`

**Interfaces:**
- Keep `DEFAULT_MAKERS_PERMISSION = 'workspace-write'` for DSH composition/UI.
- Add `SAFE_FALLBACK_MAKERS_PERMISSION = 'read-only'`.
- Add `makersEffectivePermission(value)` and use it whenever runtime policy resolution is uncertain.

- [ ] **Step 1: Write failing tests**

Add tests equivalent to:

```ts
import {
  makersAutoAllowTools,
  makersEffectivePermission,
  makersToolGate,
} from '../agents/_makers-mcp-permission.mjs'

assert.equal(makersEffectivePermission(undefined), 'read-only')
assert.equal(makersEffectivePermission('broken-mode'), 'read-only')
assert.equal(makersEffectivePermission('workspace-write'), 'workspace-write')
assert.equal(makersToolGate(undefined, 'workspace_write_file'), 'ask')
assert.equal(makersToolGate(undefined, 'workspace_read_file'), 'allow')
assert.ok(!makersAutoAllowTools(undefined).includes('workspace_write_file'))
```

Extend the mocked `tools/pre-execute` test so a missing/throwing/malformed sandbox policy does **not** auto-run `workspace_write_file`.

- [ ] **Step 2: Run the focused test and verify it fails**

```bash
npm run prepare:dsh-web
node --experimental-strip-types --test tests/mcp-permission.test.ts
```

Expected: FAIL because current invalid mode maps to `workspace-write`.

- [ ] **Step 3: Implement fail-closed resolution**

Add:

```js
export const SAFE_FALLBACK_MAKERS_PERMISSION = 'read-only'

export function makersEffectivePermission(value) {
  return isMakersPermissionMode(value) ? value : SAFE_FALLBACK_MAKERS_PERMISSION
}
```

Change:

```js
export function makersAutoAllowTools(mode) {
  return AUTO_ALLOW[makersEffectivePermission(mode)]
}
```

and in `apply(ctx)`:

```js
let mode
try {
  mode = sandboxPolicy?.resolve?.({ session: exec.agent?.session })?.mode
} catch {
  mode = undefined
}
const current = makersEffectivePermission(mode)
```

Update `makersMcpPermissionSource()` so the generated plugin includes `SAFE_FALLBACK_MAKERS_PERMISSION` and `makersEffectivePermission`.

Do **not** change `cordis.patch.yml` fresh-session `defaultPreset: workspace-write`.

- [ ] **Step 4: Run tests**

```bash
node --experimental-strip-types --test tests/mcp-permission.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agents/_makers-mcp-permission.mjs tests/mcp-permission.test.ts
git commit -m "fix: fail closed on unresolved Makers permissions"
```

---

### Task 2: Block common secret files from auto-approved workspace file tools

**Files:**
- Modify: `agents/_workspace.ts`
- Modify: `tests/workspace.test.ts`

**Interfaces:**
- Add `isSensitiveWorkspacePath(requestedPath): boolean`.
- `listWorkspace` omits sensitive entries.
- `readWorkspaceFile` and `writeWorkspaceFile` reject sensitive paths.
- `.env.example`, `.env.sample`, `.env.template` remain allowed documentation/templates.
- Full Access shell commands remain a separately approved whole-sandbox capability.

- [ ] **Step 1: Add failing pure-policy tests**

```ts
assert.equal(isSensitiveWorkspacePath('.env'), true)
assert.equal(isSensitiveWorkspacePath('.env.local'), true)
assert.equal(isSensitiveWorkspacePath('.npmrc'), true)
assert.equal(isSensitiveWorkspacePath('keys/id_ed25519'), true)
assert.equal(isSensitiveWorkspacePath('certs/private.key'), true)
assert.equal(isSensitiveWorkspacePath('service-account.json'), true)
assert.equal(isSensitiveWorkspacePath('.env.example'), false)
assert.equal(isSensitiveWorkspacePath('src/app.ts'), false)
```

Add mocked read/write tests asserting `.env` throws before `sandbox.files.read/write` is called.

- [ ] **Step 2: Run and confirm failure**

```bash
node --experimental-strip-types --test tests/workspace.test.ts
```

Expected: FAIL because the helper does not exist/current file calls proceed.

- [ ] **Step 3: Implement the sensitive-path policy**

Add near `normalizeWorkspacePath`:

```ts
const SAFE_ENV_TEMPLATES = new Set(['.env.example', '.env.sample', '.env.template'])
const SENSITIVE_BASENAMES = new Set([
  '.env', '.npmrc', '.pypirc', '.netrc',
  'credentials', 'credentials.json', 'service-account.json',
])
const SENSITIVE_KEY_PREFIXES = ['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519']
const SENSITIVE_KEY_EXTENSIONS = ['.key', '.pem', '.p12', '.pfx']

export function isSensitiveWorkspacePath(requestedPath: string): boolean {
  const path = normalizeWorkspacePath(requestedPath)
  if (!path) return false
  const name = path.split('/').pop()!.toLowerCase()
  if (SAFE_ENV_TEMPLATES.has(name)) return false
  if (SENSITIVE_BASENAMES.has(name)) return true
  if (name.startsWith('.env.')) return true
  if (SENSITIVE_KEY_PREFIXES.some(prefix => name === prefix || name.startsWith(`${prefix}.`))) return true
  return SENSITIVE_KEY_EXTENSIONS.some(ext => name.endsWith(ext))
}
```

In `readWorkspaceFile` and `writeWorkspaceFile`, immediately after path normalization:

```ts
if (isSensitiveWorkspacePath(path)) {
  throw new Error('Sensitive workspace files are not available to automatic file tools.')
}
```

In `listWorkspace`, filter returned items using:

```ts
.filter(item => !isSensitiveWorkspacePath(item.rawPath))
```

- [ ] **Step 4: Run tests/typecheck**

```bash
node --experimental-strip-types --test tests/workspace.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agents/_workspace.ts tests/workspace.test.ts
git commit -m "fix: shield sensitive workspace files from automatic tools"
```

---

### Task 3: Remove raw MCP request-body retention

**Files:**
- Modify: `agents/_mcp-bridge.ts`
- Create: `tests/mcp-bridge.test.ts`

**Interfaces:**
- Preserve `requestCount()`.
- Change `requestLog()` to bounded metadata only: `{ method, url, bodyBytes }[]`.
- Never retain parsed MCP body content for diagnostics.

- [ ] **Step 1: Write failing test around exported pure recorder helper**

Add an exported helper in the test plan interface:

```ts
export interface McpRequestMetadata {
  method: string
  url: string
  bodyBytes: number
}

export function appendMcpRequestMetadata(
  log: McpRequestMetadata[],
  meta: McpRequestMetadata,
): McpRequestMetadata[]
```

Test expected behavior:

```ts
const log = []
let next = appendMcpRequestMetadata(log, { method: 'POST', url: '/mcp', bodyBytes: 120 })
for (let i = 0; i < 80; i++) {
  next = appendMcpRequestMetadata(next, { method: 'POST', url: '/mcp', bodyBytes: i })
}
assert.equal(next.length, 64)
assert.ok(next.every(entry => !('body' in entry)))
```

- [ ] **Step 2: Implement metadata-only recording**

Use:

```ts
const MCP_REQUEST_LOG_LIMIT = 64

export function appendMcpRequestMetadata(log, meta) {
  return [...log, meta].slice(-MCP_REQUEST_LOG_LIMIT)
}
```

In the HTTP handler, compute bytes from the raw text only long enough to parse/handle the request:

```ts
requestMetadata = appendMcpRequestMetadata(requestMetadata, {
  method: request.method || 'UNKNOWN',
  url: request.url || '',
  bodyBytes: Buffer.byteLength(text),
})
```

Do not push `parsedBody` into any retained array.

- [ ] **Step 3: Run test/typecheck**

```bash
node --experimental-strip-types --test tests/mcp-bridge.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add agents/_mcp-bridge.ts tests/mcp-bridge.test.ts
git commit -m "fix: redact MCP request diagnostics"
```

---

### Task 4: Move preview credential from MCP result to browser-only API

**Files:**
- Modify: `agents/_workspace.ts`
- Modify: `agents/_mcp-bridge.ts`
- Create: `agents/api/makers.preview.ts`
- Modify: `scripts/prepare-dsh-web.mjs`
- Modify: `tests/workspace.test.ts`
- Modify: `tests/dsh-web.test.ts`

**Interfaces:**
- `publishWorkspacePreview()` returns `{ published: true, framework }` and no URL/token.
- `currentPreview()` remains server-side and may build the credentialed URL for browser delivery.
- `POST /api/makers.preview` resolves the current request's `context.conversation_id` and returns `{ published, previewUrl? }` with `cache-control: no-store`.
- Makers chrome adds an explicit Preview button that calls this same-origin endpoint; fetch wrapper already injects `makers-conversation-id` for `/api/*`.

- [ ] **Step 1: Write failing workspace test**

Use a fake sandbox where `files.exists()` is false, command calls return `{ exitCode:0, stdout:'', stderr:'' }`, `getHost()` returns `https://9000-test.sandbox.example.com`, and `envdAccessToken='secret-token'`.

Assert:

```ts
const result = await publishWorkspacePreview(context, 'conv-1')
assert.deepEqual(result, { published: true, framework: 'static' })
assert.equal(JSON.stringify(result).includes('secret-token'), false)
assert.equal(JSON.stringify(result).includes('access_token'), false)
```

- [ ] **Step 2: Change workspace return type**

Change the signature to:

```ts
Promise<{ published: true; framework: string }>
```

Keep tokenized URL construction only inside `currentPreview()`.

Return:

```ts
return { published: true, framework }
```

- [ ] **Step 3: Add browser-only route**

Create `agents/api/makers.preview.ts`:

```ts
import { currentPreview } from '../_workspace.ts'

export async function onRequest(context: any): Promise<Response> {
  const conversationId = String(context.conversation_id || '').trim()
  if (!conversationId) {
    return Response.json({ published: false, error: 'makers-conversation-id is required' }, { status: 400 })
  }
  const preview = await currentPreview(context, conversationId)
  return Response.json(preview, { headers: { 'cache-control': 'no-store' } })
}
```

Do not add this filename to the generated Host API manifest; it is project-owned and `generate-dsh-api-routes.mjs` does not delete unrelated files.

- [ ] **Step 4: Add a Preview button to the existing Makers chrome**

In `makersActionsHead`, create a button rather than embedding a tokenized href:

```js
const preview = document.createElement('button')
preview.type = 'button'
preview.className = 'dsh-makers-preview'
preview.innerHTML = '<span class="dsh-makers-action-label">Preview</span>'
preview.addEventListener('click', async () => {
  preview.disabled = true
  try {
    const response = await fetch('/api/makers.preview', { method: 'POST' })
    const result = await response.json()
    if (!response.ok || !result.previewUrl) throw new Error('Preview is not published yet.')
    window.open(result.previewUrl, '_blank', 'noopener,noreferrer')
  } finally {
    preview.disabled = false
  }
})
```

Add localized labels/error title through the existing `copy` object; do not hard-code only English in final generated output.

Append it in the same nav group:

```js
nav.append(github, preview, deploy)
```

The token reaches the user's browser only after an explicit click; it does not become MCP/model text.

- [ ] **Step 5: Add source-contract test for the security invariant**

In `tests/dsh-web.test.ts`, assert generated chrome contains `/api/makers.preview` and does **not** contain a literal `access_token` handling path in the MCP result UI code. In `tests/workspace.test.ts`, assert `publishWorkspacePreview` result has no URL/token.

- [ ] **Step 6: Run quality commands**

```bash
npm run prepare:dsh-web
git diff -- agents/api/makers.preview.ts agents/_workspace.ts agents/_mcp-bridge.ts scripts/prepare-dsh-web.mjs tests
npm run typecheck
npm run test:prepared
npm run build:prepared
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add agents/_workspace.ts agents/_mcp-bridge.ts agents/api/makers.preview.ts scripts/prepare-dsh-web.mjs tests/workspace.test.ts tests/dsh-web.test.ts
git commit -m "fix: keep sandbox preview token out of model output"
```

---

### Task 5: Verify access/auth policy before adding application auth

**Files:**
- Modify: `PROJECT_STATUS.md`
- No auth source file unless verification proves it is required.

- [ ] **Step 1: Inspect EdgeOne project access controls without exposing secret values**

Record only:
- whether the generated production domain is public/gated;
- whether password/identity/edge access protection is enabled;
- whether `/api/*` receives the same protection;
- whether Preview has equivalent or stricter protection.

- [ ] **Step 2: Run two black-box requests from a logged-out/incognito client**

Safe targets:
- `/`;
- one read-only/non-mutating endpoint such as `/api/host.describe` if its request contract is known.

Do not call shell/write/model endpoints for this verification.

- [ ] **Step 3: Apply decision rule**

If anonymous requests are rejected by a documented EdgeOne identity/access layer protecting `/api/*`, record the control and do not add duplicate application auth in WP1.

If anonymous Agent API requests are accepted, mark M03 open and create a dedicated authentication design plan before stable/public use. Do not improvise JWT/password code inside this WP.

- [ ] **Step 4: Update `PROJECT_STATUS.md`**

Use one of:

```markdown
- Access/auth policy: CONFIRMED platform-gated — <control name>, verified YYYY-MM-DD
```

or:

```markdown
- Access/auth policy: application authentication required before public/stable use
```

Never write credentials/cookies/tokens to the file.

---

## WP1 acceptance criteria

- [ ] Missing/malformed permission policy cannot auto-write files.
- [ ] `.env`, package-manager credentials and private-key-like files are hidden/blocked from automatic file tools; template env files remain usable.
- [ ] MCP diagnostics retain no raw body/tool arguments.
- [ ] `publish_preview` model-visible result contains no data-plane token or tokenized URL.
- [ ] Browser can still open a published preview through `/api/makers.preview`.
- [ ] All relevant unit/source-contract tests pass.
- [ ] Access/auth state is explicitly recorded as CONFIRMED platform-gated or application-auth-required.

## Rollback

Each task is independently revertible. If the Preview button integration regresses UI layout, revert Task 4 only; do not restore model-visible tokens as a shortcut. If sensitive-path policy blocks a legitimate non-secret file, adjust the explicit allowlist/pattern tests rather than disabling the policy.