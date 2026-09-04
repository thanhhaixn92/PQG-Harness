# PQG-Harness Foundation Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the core of WP0–WP7 for a single-user Personal v1, close or verify every Phase 1B P1 gate, freeze the foundation, and only then begin business modules.

**Architecture:** Keep the current EdgeOne Makers + DSH sidecar architecture. Finish native workspace durability first, then make sidecar lifecycle/Stop deterministic, apply narrow dependency/Gateway hardening, verify deployed identity/access/smoke, add a small PQG-owned product layer, and finish with operational/release documentation. Deep public-SaaS hardening is explicitly deferred.

**Tech Stack:** Node.js 24, TypeScript, Node test runner, Vite, DeepSeek Harness `0.1.0-rc.6`, MCP SDK, EdgeOne Makers Agent/Sandbox/Store/AI Gateway, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-04-pqg-harness-foundation-core-design.md`

## Global Constraints

- Canonical current implementation head at plan creation: `7ae3fc4e4b57ad1605ece920f4fc959598601194`.
- Continue WP2 on `impl/wp2-workspace-durability`; do not implement runtime changes on this planning branch.
- EdgeOne Git Auto Deploy stays disconnected during Foundation Core implementation.
- Preserve the existing architecture and loopback binding.
- Keep every direct `@deepseek-ai/dsh*` dependency on exactly `0.1.0-rc.6`; no DSH upgrade in Foundation Core.
- Do not add an external database, third-party telemetry stack, multi-user RBAC, or plugin marketplace.
- Never hand-edit generated `public/` or root `index.html`; change their producer and regenerate.
- Every runtime behavior change is test-first and ends with an independently reviewable commit.
- Do not call a mutation durable until native checkpoint persistence succeeded.
- Do not expose credentials, prompt bodies, workspace file contents, or tokenized preview URLs in CI/release evidence.
- A failed or blocked live verification is recorded as `FAIL` or `BLOCKED`, never converted to PASS.
- After Foundation Freeze, broad hardening stops unless a module-blocking defect, security issue, or failed operational verification requires reopening it.

---

## File map

### Existing implementation files that may change

- `agents/_workspace.ts` — native restore/persist lifecycle, preview health, listing completeness.
- `agents/_mcp-bridge.ts` — workspace durability/error serialization and current-context provider.
- `agents/_dsh-web-sidecar.ts` — explicit lifecycle entries, leases, idempotent cleanup, context refresh.
- `agents/_gateway-proxy.ts` — current-context provider, response-header allowlist, stable public errors.
- `agents/api/_proxy.ts` — sidecar leases, SSE cancellation guard, stable Host proxy errors.
- `agents/stop.ts` — failure-independent Stop transition.
- `package.json`, `package-lock.json` — exact DSH pins, targeted `ws` patch, build-meta hook.
- `scripts/restore-host-frontend-natives.mjs` — lock-integrity verification.
- `scripts/prepare-dsh-web.mjs` — PQG product metadata, locale selection, custom chrome accessibility.
- `PROJECT_STATUS.md`, `README.md` — verified operational/product state.

### New implementation/support files

- `tests/sidecar-lifecycle.test.ts`
- `tests/proxy-stream.test.ts`
- `tests/stop.test.ts`
- `tests/dependency-contract.test.ts`
- `tests/lock-integrity.test.ts`
- `tests/proxy-error-policy.test.ts`
- `tests/build-meta.test.ts`
- `tests/product-config.test.ts`
- `scripts/lib/lock-integrity.mjs`
- `scripts/write-build-meta.mjs`
- `config/product.mjs`
- `docs/localization/vi-status.md`
- `SECURITY.md`
- `ARCHITECTURE.md`
- `RUNBOOK.md`
- `CHANGELOG.md`
- `docs/release/RELEASE_CHECKLIST.md`
- `docs/release/KNOWN_LIMITATIONS.md`
- `docs/verification/<date>-preview-*.md` for non-secret execution evidence.

---

### Task 1: Synchronize WP0/WP1 evidence and establish Foundation execution rules

**Files:**
- Modify: `PROJECT_STATUS.md` on the eventual integration branch if current text does not already reflect these facts.
- No runtime source changes.

**Interfaces:**
- Consumes: WP0 head `342a10758a7dce1c3bfb83cd5796766f7eb1e263`, WP1 head `89f21bba9cb5c4447b6e4ef5aa6abc268f8dba76`.
- Produces: one factual execution baseline used by every later WP.

- [ ] **Step 1: Re-read current PR heads and quality evidence**

Verify:

```text
WP0 quality run 33864756455 = success
WP1 final quality run 33869148412 = success
WP2 current head = 7ae3fc4e4b57ad1605ece920f4fc959598601194
```

If a head changed, stop and update this plan/spec baseline before runtime work.

- [ ] **Step 2: Confirm Production Git integration remains disconnected**

Read the current EdgeOne project state before the first WP2 push used for functional verification. Record only `enabled/disabled`, branch mapping, and date; never copy secrets.

- [ ] **Step 3: Record the integration strategy in the WP2 PR and `PROJECT_STATUS.md`**

Use this exact rule:

```text
finish WP2 -> integration/foundation-core
WP3..WP7 short-lived branches -> integration/foundation-core
final Foundation Core PR -> main
Production Auto Deploy remains disconnected until final release gate
```

- [ ] **Step 4: Do not expand WP1**

Treat symlink/canonical-path enforcement and shell-level secret filtering as known limitations unless a later verified platform API provides a safe canonical-path primitive.

- [ ] **Step 5: Commit only if documentation changed**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: record Foundation Core execution baseline"
```

Expected: no runtime diff.

---

### Task 2: WP2 — native restore state machine and legacy migration

**Files:**
- Modify: `agents/_workspace.ts`
- Modify: `tests/workspace.test.ts`

**Interfaces:**
- Consumes: `persistWorkspaceCheckpoint(context, conversationId, root): Promise<WorkspaceCheckpoint>` already implemented.
- Produces:

```ts
type LegacySnapshotLoad =
  | { kind: 'found'; snapshot: WorkspaceSnapshot }
  | { kind: 'missing' }

async function initializeWorkspace(context: any, conversationId: string, root: string): Promise<void>
```

Marker path: `.pqg-workspace-ready` inside the canonical workspace root.

- [ ] **Step 1: Write failing restore tests**

Add cases to `tests/workspace.test.ts`:

```ts
test('native restore wins over legacy metadata', async () => {
  // restore() => { restored: true }; assert no legacy metadata load/write and marker exists
})

test('legacy snapshot migrates only after native not_found', async () => {
  // restore() => { restored:false, reason:'not_found' }; legacy exists
  // assert files restored, persist called once, legacy cleared only after persist succeeds
})

test('restore failure never persists an incomplete workspace', async () => {
  // restore() throws; assert ensureWorkspace rejects, no marker, no persist
})

test('ready marker skips duplicate restore on a live sandbox', async () => {
  // marker exists; assert restore call count = 0
})

test('junk file without marker does not suppress native restore', async () => {
  // arbitrary top-level file exists; assert restore still called
})
```

- [ ] **Step 2: Run focused test and confirm RED**

```bash
node --experimental-strip-types --test tests/workspace.test.ts
```

Expected: failures because marker/native restore state machine does not exist.

- [ ] **Step 3: Replace `workspaceHasFiles()` restore gating**

Add:

```ts
const WORKSPACE_READY_MARKER = '.pqg-workspace-ready'

async function workspaceReady(context: any, root: string): Promise<boolean> {
  return Boolean(await context.sandbox.files.exists(`${root}/${WORKSPACE_READY_MARKER}`))
}

async function markWorkspaceReady(context: any, root: string): Promise<void> {
  await context.sandbox.files.write(`${root}/${WORKSPACE_READY_MARKER}`, 'v1\n')
}
```

Delete `workspaceHasFiles()` once unused.

- [ ] **Step 4: Make legacy snapshot loading fail correctly**

Replace the catch-all loader with:

```ts
async function loadLegacyWorkspaceSnapshot(
  context: any,
  conversationId: string,
): Promise<LegacySnapshotLoad> {
  try {
    const conversation = await getConversation(context, conversationId)
    const snapshot = conversation?.metadata?.workspaceSnapshot
    if (!snapshot || typeof snapshot !== 'object' || Object.keys(snapshot).length === 0) {
      return { kind: 'missing' }
    }
    return { kind: 'found', snapshot: snapshot as WorkspaceSnapshot }
  } catch (error) {
    if (isMissingConversation(error)) return { kind: 'missing' }
    throw error
  }
}
```

- [ ] **Step 5: Implement `initializeWorkspace()`**

Use this exact ordering:

```ts
async function initializeWorkspace(context: any, conversationId: string, root: string): Promise<void> {
  if (await workspaceReady(context, root)) return

  const restored = await context.sandbox.restore({ path: root, timeout: 180 })
  if (restored?.restored === true) {
    await markWorkspaceReady(context, root)
    return
  }
  if (restored?.reason !== 'not_found') {
    throw new Error(`Workspace restore failed: ${String(restored?.reason || 'unknown')}`)
  }

  const legacy = await loadLegacyWorkspaceSnapshot(context, conversationId)
  if (legacy.kind === 'found') {
    await restoreLegacySnapshotFiles(context, root, legacy.snapshot)
    await markWorkspaceReady(context, root)
    await persistWorkspaceCheckpoint(context, conversationId, root)
    await updateConversationMetadata(context, conversationId, {
      workspaceSnapshot: {},
      workspaceSnapshotMigratedAt: Date.now(),
    })
    return
  }

  await markWorkspaceReady(context, root)
  await persistWorkspaceCheckpoint(context, conversationId, root)
}
```

Ensure the legacy snapshot is never cleared before a successful native persist.

- [ ] **Step 6: Make `ensureWorkspace()` use the state machine**

```ts
export async function ensureWorkspace(context: any, conversationId: string): Promise<string> {
  const root = workspaceRoot(conversationId)
  await context.sandbox.files.makeDir(root)
  await initializeWorkspace(context, conversationId, root)
  return root
}
```

- [ ] **Step 7: Run focused and type tests**

```bash
node --experimental-strip-types --test tests/workspace.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add agents/_workspace.ts tests/workspace.test.ts
git commit -m "fix: restore workspace from native checkpoint"
```

---

### Task 3: WP2 — persist every workspace mutation and expose durability failure

**Files:**
- Modify: `agents/_workspace.ts`
- Modify: `agents/_mcp-bridge.ts`
- Modify: `tests/workspace.test.ts`

**Interfaces:**

```ts
export async function writeWorkspaceFile(...): Promise<{
  path: string
  bytes: number
  persisted: true
  checkpoint: WorkspaceCheckpoint
}>

export async function runWorkspaceCommand(...): Promise<{
  command: string
  stdout: string
  stderr: string
  exitCode: number
  persistence: WorkspacePersistenceStatus
}>
```

- [ ] **Step 1: Write failing mutation durability tests**

Add tests proving:

```text
direct write -> persist called after files.write
direct write + persist failure -> function rejects with "checkpoint persistence failed"
command exit 0 -> persist called
command exit nonzero -> persist still called
command persist failure -> persistence.persisted === false
MCP command result isError when exitCode != 0 OR persistence.persisted != true
```

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
node --experimental-strip-types --test tests/workspace.test.ts
```

- [ ] **Step 3: Replace legacy snapshot writes**

After writing the file:

```ts
await context.sandbox.files.write(`${root}/${path}`, content)
let checkpoint: WorkspaceCheckpoint
try {
  checkpoint = await persistWorkspaceCheckpoint(context, conversationId, root)
} catch (error) {
  throw new Error(`Workspace write completed but checkpoint persistence failed: ${error instanceof Error ? error.message : String(error)}`)
}
return {
  path,
  bytes: new TextEncoder().encode(content).byteLength,
  persisted: true,
  checkpoint,
}
```

Delete the normal-write call to `saveWorkspaceSnapshotFile()`; retain legacy snapshot code only for migration until Task 2 cleanup makes remaining references explicit.

- [ ] **Step 4: Persist shell state regardless of exit code**

After `commands.run`:

```ts
let persistence: WorkspacePersistenceStatus
try {
  const checkpoint = await persistWorkspaceCheckpoint(context, conversationId, root)
  persistence = { persisted: true, checkpoint }
} catch (error) {
  persistence = {
    persisted: false,
    error: error instanceof Error ? error.message : String(error),
  }
}
```

Return `persistence` with command output.

- [ ] **Step 5: Make MCP durability failure visible**

For the command tool result, set:

```ts
isError: result.exitCode !== 0 || result.persistence.persisted !== true
```

Do not hide command stdout/stderr solely because checkpointing failed; the user needs both command outcome and durability status.

- [ ] **Step 6: Run tests and full prepared quality**

```bash
node --experimental-strip-types --test tests/workspace.test.ts
npm run typecheck
npm run test:prepared
npm run build:prepared
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add agents/_workspace.ts agents/_mcp-bridge.ts tests/workspace.test.ts
git commit -m "fix: persist workspace after mutations"
```

---

### Task 4: WP2 — make preview state live and workspace listings honest

**Files:**
- Modify: `agents/_workspace.ts`
- Modify: `agents/_mcp-bridge.ts`
- Modify: `tests/workspace.test.ts`

**Interfaces:**

```ts
export interface WorkspaceListing {
  items: WorkspaceItem[]
  truncated: boolean
  limit: number
}
```

`currentPreview()` returns `published:false` when port 3000 is not healthy on the current sandbox instance.

- [ ] **Step 1: Write failing preview-health tests**

Cases:

```text
metadata published + health failure -> { published:false }
metadata published + health success -> published:true and browser-only route can resolve preview
restored workspace without restarted process -> published:false
```

- [ ] **Step 2: Implement preview health check**

Before returning published state:

```ts
const health = await context.sandbox.commands.run(
  "curl -fsS http://127.0.0.1:3000/preview/ >/dev/null 2>&1 || curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1",
  { timeout: 5 },
)
if (health.exitCode !== 0) return { published: false }
```

Best-effort clear stale preview metadata, but never turn a correct health result into an exception if metadata update fails.

- [ ] **Step 3: Write the >400-listing failing test**

Generate 401 valid rows and assert:

```ts
assert.equal(result.items.length, 400)
assert.equal(result.truncated, true)
assert.equal(result.limit, 400)
```

- [ ] **Step 4: Return a listing envelope**

Parse all valid rows first, then:

```ts
const limit = 400
return {
  items: parsed.slice(0, limit),
  truncated: parsed.length > limit,
  limit,
}
```

Update MCP serialization to expose this envelope.

- [ ] **Step 5: Run tests and commit**

```bash
node --experimental-strip-types --test tests/workspace.test.ts
npm run typecheck
npm run test:prepared
```

```bash
git add agents/_workspace.ts agents/_mcp-bridge.ts tests/workspace.test.ts
git commit -m "fix: make workspace preview and listing state explicit"
```

---

### Task 5: WP2 — controlled Preview recycle proof and WP2 closure

**Files:**
- Create: `docs/verification/2026-09-04-wp2-preview-recycle.md`
- Update: PR #20 and temporary verification PR evidence.
- No source changes unless a verified defect is found.

**Interfaces:**
- Consumes: final WP2 source from Tasks 2–4.
- Produces: evidence that same-conversation native recovery is authoritative.

- [ ] **Step 1: Run the complete local/CI quality gate**

```bash
npm ci
npm run prepare:dsh-web
git diff --exit-code -- index.html public agents/api
npm run typecheck
npm run test:prepared
npm run build:prepared
```

Expected: all PASS.

- [ ] **Step 2: Deploy only the WP2 branch to a controlled EdgeOne Preview**

Verify the deployment is Preview and Production deployment identity has not changed.

- [ ] **Step 3: Create a deterministic disposable workspace**

Use automatic file tools for two non-secret files and an approved shell command for two more files. Modify one shell-created file and delete another.

Expected final logical state before recycle:

```text
auto-a.txt          exists
nested/auto-b.txt   exists
shell-a.txt         exists with modified content
shell-delete.txt    absent
```

- [ ] **Step 4: Force or wait for a new sandbox instance using the supported Preview lifecycle**

Record old/new instance identifiers if `context.sandbox.getInfo()` exposes them. Never run this lifecycle test against Production.

- [ ] **Step 5: Reopen the same conversation and verify exact state**

Required:

```text
auto-a.txt          exact content preserved
nested/auto-b.txt   exact content preserved
shell-a.txt         modified content preserved
shell-delete.txt    still absent
preview process     not falsely reported alive until restarted
```

- [ ] **Step 6: Verify one synthetic legacy migration conversation**

Seed only non-secret legacy snapshot data, ensure native restore reports `not_found`, verify migration to native checkpoint, and confirm legacy snapshot is cleared only after successful persist.

- [ ] **Step 7: Record evidence**

The verification file must include:

```text
branch
commit SHA
Preview deployment identifier/domain
PASS/FAIL/BLOCKED per case
old/new sandbox instance id when available
no secrets or tokenized preview URLs
```

- [ ] **Step 8: Close WP2 only after evidence is green**

Update PR #20 with final RED/GREEN runs and Preview result. Close the temporary verification PR without merge after evidence capture.

---

### Task 6: WP3 Core — explicit lifecycle state, bounded startup cleanup, idempotent close

**Files:**
- Modify: `agents/_dsh-web-sidecar.ts`
- Create: `tests/sidecar-lifecycle.test.ts`

**Interfaces:**

```ts
type SidecarEntryState = 'starting' | 'ready' | 'stopping'

interface SidecarEntry {
  conversationId: string
  state: SidecarEntryState
  pending: Promise<DshWebSidecar>
  lastUsedAt: number
  activeUsers: number
}

export interface DshWebSidecarLease {
  sidecar: DshWebSidecar
  release(): void
}
```

- [ ] **Step 1: Write lifecycle RED tests**

Prove:

```text
two concurrent acquires -> starter called once
release twice -> activeUsers never below 0
close twice -> child/gateway/mcp cleanup executes once
stop marks stopping before awaiting startup
acquire while stopping -> stable SIDE_CAR_STOPPING error
failed startup -> child/gateway/mcp resources closed
```

Expose only a narrow test seam:

```ts
export function __setSidecarStarterForTests(
  starter: ((context: any, conversationId: string) => Promise<DshWebSidecar>) | undefined,
): void
```

- [ ] **Step 2: Run test and confirm RED**

```bash
node --experimental-strip-types --test tests/sidecar-lifecycle.test.ts
```

- [ ] **Step 3: Replace `Map<string, Promise<DshWebSidecar>>` with explicit entries**

Use `SidecarEntry` and set state transitions only when the map still points to the same entry.

- [ ] **Step 4: Make close idempotent**

Inside each sidecar:

```ts
let closePromise: Promise<void> | undefined

async close() {
  closePromise ??= closeSidecarResources()
  return closePromise
}
```

`closeSidecarResources()` snapshots settings best-effort, terminates the child, and closes Gateway/MCP with `Promise.allSettled`.

- [ ] **Step 5: Add bounded startup retry**

Use a maximum of three attempts for boot-time bind/readiness failure:

```ts
const START_ATTEMPTS = 3
for (let attempt = 1; attempt <= START_ATTEMPTS; attempt++) {
  try { return await startSidecarAttempt(context, conversationId) }
  catch (error) {
    if (attempt === START_ATTEMPTS) throw error
    await new Promise(resolve => setTimeout(resolve, 100 * attempt))
  }
}
throw new Error('unreachable')
```

Every failed attempt must terminate the child and close companion servers. Do not redesign the transport merely to remove the free-port TOCTOU in this Foundation Core task.

- [ ] **Step 6: Run tests/typecheck and commit**

```bash
node --experimental-strip-types --test tests/sidecar-lifecycle.test.ts
npm run typecheck
```

```bash
git add agents/_dsh-web-sidecar.ts tests/sidecar-lifecycle.test.ts
git commit -m "fix: model sidecar lifecycle explicitly"
```

---

### Task 7: WP3 Core — leases, current context, SSE cancellation, Stop transition

**Files:**
- Modify: `agents/_dsh-web-sidecar.ts`
- Modify: `agents/_gateway-proxy.ts`
- Modify: `agents/_mcp-bridge.ts`
- Modify: `agents/api/_proxy.ts`
- Modify: `agents/stop.ts`
- Create: `tests/proxy-stream.test.ts`
- Create: `tests/stop.test.ts`
- Extend: `tests/sidecar-lifecycle.test.ts`

**Interfaces:**

```ts
export type MakersContextProvider = () => any

export async function acquireDshWebSidecar(context: any): Promise<DshWebSidecarLease>

export async function stopDshWebSidecar(conversationId: string): Promise<{
  found: boolean
  closed: boolean
  error?: string
}>
```

Gateway and MCP constructors become:

```ts
startLocalGatewayProxy(getContext: MakersContextProvider, conversationId: string)
startLocalMcpBridge(getContext: MakersContextProvider, conversationId: string)
```

- [ ] **Step 1: Write active-lease and context-refresh RED tests**

Test:

```text
active unary request blocks idle reap
active SSE blocks idle reap until close
later acquire updates context A -> B
later Gateway/MCP request reads B env/sandbox/store, not creation context A
```

- [ ] **Step 2: Implement lease-based acquire**

On acquire:

```text
resolve conversation -> create/reuse entry -> await ready -> set latest context -> increment activeUsers -> return one-shot release
```

Idle sweep may close only entries with:

```ts
entry.state === 'ready' && entry.activeUsers === 0 && entry.lastUsedAt < cutoff
```

- [ ] **Step 3: Change Gateway/MCP to resolve context per request**

Each incoming loopback request begins with:

```ts
const context = getContext()
```

Do not retain the first EdgeOne invocation context beyond the provider closure.

- [ ] **Step 4: Write SSE early-abort RED tests**

Abort while `acquireDshWebSidecar()` is pending; when acquisition later resolves, assert the WebSocket factory was never called and the lease was released exactly once.

- [ ] **Step 5: Implement SSE cancellation guard**

Attach the abort listener before awaiting acquisition and check cancellation again after acquisition before opening a WebSocket.

- [ ] **Step 6: Write Stop RED tests**

Prove:

```text
abortActiveRun executes even when sidecar close rejects
replacement acquire is rejected while stop is in progress
stop-during-start does not leave a replacement sidecar
response reports sidecar and platform abort outcomes separately
```

- [ ] **Step 7: Make Stop failure-independent**

Use an all-settled transition:

```ts
const [webResult, platformResult] = await Promise.allSettled([
  stopDshWebSidecar(conversationId),
  context.utils?.abortActiveRun?.(conversationId),
])
```

Return stable non-secret outcome fields; do not expose raw exception strings to the browser.

- [ ] **Step 8: Run WP3 test set and commit**

```bash
node --experimental-strip-types --test \
  tests/sidecar-lifecycle.test.ts \
  tests/proxy-stream.test.ts \
  tests/stop.test.ts
npm run typecheck
npm run test:prepared
```

```bash
git add agents tests
git commit -m "fix: make sidecar use and cancellation deterministic"
```

- [ ] **Step 9: Preview command-cancellation verification**

Run one disposable command that creates a harmless heartbeat file repeatedly, invoke Stop, and verify whether writes cease. If the platform abort contract is sufficient, record that and add no sandbox-kill fallback. If writes continue, stop and write a separate narrowly scoped design for process ownership/kill; do not improvise sandbox destruction inside this task.

---

### Task 8: WP4 Core — exact DSH wave, targeted `ws`, and native tarball integrity

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/dependency-contract.test.ts`
- Create: `scripts/lib/lock-integrity.mjs`
- Create: `tests/lock-integrity.test.ts`
- Modify: `scripts/restore-host-frontend-natives.mjs`

**Interfaces:**

```js
export function verifySubresourceIntegrity(bytes, integrity)
export function lockPackageEntry(lock, name)
```

- [ ] **Step 1: Write DSH pin contract RED test**

For every direct dependency whose name is `@deepseek-ai/dsh` or starts `@deepseek-ai/dsh-`, assert:

```ts
assert.equal(version, '0.1.0-rc.6')
assert.equal(lock.packages[`node_modules/${name}`]?.version, '0.1.0-rc.6')
```

- [ ] **Step 2: Convert only direct DSH caret specs to exact `0.1.0-rc.6`**

Run a deterministic manifest edit followed by:

```bash
npm install --package-lock-only --ignore-scripts
```

Confirm no installed DSH version moved.

- [ ] **Step 3: Extend the contract test for `ws@8.21.3` and confirm RED**

```ts
assert.equal(lock.packages['node_modules/ws']?.version, '8.21.3')
```

- [ ] **Step 4: Update only `ws`**

```bash
npm install --save-exact ws@8.21.3
```

Inspect `git diff -- package.json package-lock.json`; reject unrelated dependency churn.

- [ ] **Step 5: Write SRI verifier RED tests**

Use known bytes and SHA-512 digest; verify matching bytes pass and changed bytes throw `/integrity/i`.

- [ ] **Step 6: Implement lock-integrity verification**

Support whitespace-separated SRI candidates and `sha512`, `sha384`, `sha256`. Require at least one supported candidate to match.

- [ ] **Step 7: Verify native tarball bytes before extraction**

`restore-host-frontend-natives.mjs` must read each exceptional tarball and call `verifySubresourceIntegrity(bytes, entry.integrity)` before deleting/extracting destinations.

- [ ] **Step 8: Run dependency/build gate and commit**

```bash
npm ci
npm run prepare:dsh-web
node --experimental-strip-types --test tests/dependency-contract.test.ts tests/lock-integrity.test.ts
npm run typecheck
npm run test:prepared
npm run build:prepared
```

```bash
git add package.json package-lock.json scripts tests
git commit -m "fix: freeze reviewed dependencies and verify native integrity"
```

---

### Task 9: WP4 Core — minimize Gateway/Host public error and header exposure

**Files:**
- Modify: `agents/_gateway-proxy.ts`
- Modify: `agents/api/_proxy.ts`
- Create/Modify: `tests/gateway-proxy.test.ts`
- Create: `tests/proxy-error-policy.test.ts`
- Modify `.env.example` only if authoritative header semantics require a new explicit toggle.

**Interfaces:**

```ts
const GATEWAY_RESPONSE_HEADERS = new Set([
  'content-type',
  'cache-control',
  'retry-after',
  'x-request-id',
])

export function gatewayResponseHeaders(headers: Headers): Headers
export function publicError(code: string): { error: string }
```

- [ ] **Step 1: Write header/error RED tests**

Assert:

```text
content-type/retry-after/x-request-id preserved
server/provider diagnostics/authorization-like headers not forwarded
Gateway catch -> { error:'AI_GATEWAY_PROXY_FAILED' }
Host proxy catch -> { error:'DSH_WEB_PROXY_FAILED' }
raw exception message absent from public body
```

- [ ] **Step 2: Implement Gateway allowlist**

Copy only the reviewed response headers; preserve `text/event-stream` streaming behavior.

- [ ] **Step 3: Replace raw exception bodies**

Gateway:

```ts
console.warn('[gateway] request failed:', error instanceof Error ? error.name : 'unknown')
response.end(JSON.stringify({ error: 'AI_GATEWAY_PROXY_FAILED' }))
```

Host proxy:

```ts
return Response.json({ error: 'DSH_WEB_PROXY_FAILED' }, { status: 502 })
```

Do not log prompt bodies, API keys, workspace content, or tokenized preview URLs.

- [ ] **Step 4: Resolve the two nonstandard request headers from authoritative EdgeOne evidence**

For `x-prompt-log` and `x-gateway-quota-bypass`, record one of:

```text
CONFIRMED required internal behavior -> keep with source reference
CONFIRMED optional logging/bypass -> introduce explicit privacy-preserving toggle/default
NOT VERIFIED -> preserve current compatibility behavior and list as release limitation
```

Do not infer semantics from the header name.

- [ ] **Step 5: Run tests and commit**

```bash
node --experimental-strip-types --test tests/gateway-proxy.test.ts tests/proxy-error-policy.test.ts
npm run typecheck
npm run test:prepared
```

```bash
git add agents tests .env.example PROJECT_STATUS.md
git commit -m "fix: minimize public Gateway and proxy exposure"
```

---

### Task 10: WP5 Core — exact build identity, deployment topology, and access gate

**Files:**
- Create: `scripts/write-build-meta.mjs`
- Create: `tests/build-meta.test.ts`
- Modify: `package.json`
- Modify: `PROJECT_STATUS.md`
- Application auth files only if EdgeOne outer access is proven insufficient.

**Interfaces:**

`dist/build-meta.json`:

```json
{
  "commit": "<40-hex>",
  "tree": "<40-hex>",
  "packageVersion": "0.1.0"
}
```

- [ ] **Step 1: Write pure build-meta tests**

Export:

```js
export function buildMeta({ commit, tree, packageVersion })
```

Reject non-40-hex commit/tree values.

- [ ] **Step 2: Implement build metadata writer**

Use:

```text
git rev-parse HEAD
git rev-parse HEAD^{tree}
```

Fail the build if Git identity cannot be resolved; never emit `unknown`.

- [ ] **Step 3: Append metadata generation after Vite build**

After WP0 scripts:

```json
"build:prepared": "vite build && node scripts/write-build-meta.mjs",
"build": "npm run prepare:dsh-web && npm run build:prepared"
```

Preserve `build:makers` semantics.

- [ ] **Step 4: Verify locally**

```bash
npm run build
cat dist/build-meta.json
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
```

Expected exact parity.

- [ ] **Step 5: Inspect EdgeOne Console topology**

Record in `PROJECT_STATUS.md`:

```text
Production branch
Preview branch behavior
Production Auto Deploy on/off
Preview Auto Deploy on/off
required AI_GATEWAY_* variable presence/scope, not values
access/auth protection state and scope
current deployment ID/source SHA if available
```

- [ ] **Step 6: Apply the access decision rule**

If EdgeOne outer access control fully protects the personal app and Agent routes, document it and add no application auth.

If not, stop and implement a **single-user** gate only. The gate must protect the Agent API/Stop routes with a signed HttpOnly session and environment-held secret/password hash; it must not introduce registration, roles, users tables, OAuth, password reset, or multi-user ownership.

- [ ] **Step 7: Preview deploy and prove `/build-meta.json` parity**

Expected `commit` equals the deployed branch HEAD.

- [ ] **Step 8: Commit code/docs**

```bash
git add scripts/write-build-meta.mjs tests/build-meta.test.ts package.json PROJECT_STATUS.md
git commit -m "feat: expose and verify deployed revision"
```

If single-user auth was required, keep it in a separate reviewable commit immediately after this one.

---

### Task 11: WP5 Core — Preview smoke, native observability check, and rollback rehearsal

**Files:**
- Create: `docs/verification/2026-09-04-foundation-preview-smoke.md`
- Modify: `PROJECT_STATUS.md`
- No telemetry source change unless an actual missing critical boundary is proven.

**Interfaces:**
- Produces one release-gate evidence set tied to an exact build SHA.

- [ ] **Step 1: Run the Preview smoke matrix**

Record `PASS | FAIL | BLOCKED` for:

```text
DNS/TLS/root
/build-meta.json parity
main shell render
critical console errors
model selector
permission selector/default
session creation
minimal prompt "Reply exactly: OK"
SSE progression
workspace list/read
harmless automatic write + durable checkpoint
refresh/reopen
restricted command approval prompt without destructive content
Stop
session export
phone/tablet/desktop shell usability
logged-out/incognito access behavior
```

- [ ] **Step 2: Resolve all FAIL cases before proceeding**

BLOCKED remains BLOCKED and must carry a reason. Do not broaden the scope to cosmetic issues unrelated to the Foundation Core gate.

- [ ] **Step 3: Inspect EdgeOne native logs/metrics/traces**

Attempt to correlate:

```text
browser/Agent request
-> Host proxy
-> DSH sidecar
-> Gateway/model
-> MCP tool
-> sandbox
-> response/Stop
```

If sufficient for latency/error/correlation, document `native observability sufficient` and add no custom telemetry.

- [ ] **Step 4: Rehearse one Preview rollback/redeploy**

Use two known-good Preview commits A and B. Deploy B, return to A using the supported EdgeOne mechanism, then verify:

```text
/build-meta.json == A
shell loads
minimal session/model smoke passes
environment scope remains correct
```

- [ ] **Step 5: Record operational facts and commit docs**

```bash
git add docs/verification/2026-09-04-foundation-preview-smoke.md PROJECT_STATUS.md
git commit -m "docs: record Foundation Preview and rollback evidence"
```

---

### Task 12: WP6 Core — isolate PQG product identity and correct locale defaults

**Files:**
- Create: `config/product.mjs`
- Create: `tests/product-config.test.ts`
- Modify: `scripts/prepare-dsh-web.mjs`
- Modify: `tests/dsh-web.test.ts`
- Create: `docs/localization/vi-status.md`
- Modify generated `index.html` and `public/` only through the producer/regeneration convention.

**Interfaces:**

```js
export const product = Object.freeze({
  name: 'PQG Harness',
  shortName: 'PQG',
  repositoryUrl: 'https://github.com/thanhhaixn92/PQG-Harness',
  upstreamAdapterUrl: 'https://github.com/TencentEdgeOne/deepseek-harness',
  upstreamCoreUrl: 'https://github.com/deepseek-ai/deepseek-harness',
})
```

- [ ] **Step 1: Write product-config tests**

Assert exact name, short name, local repository and both upstream attribution URLs.

- [ ] **Step 2: Apply product metadata after upstream copy**

`prepare-dsh-web.mjs` must set:

```text
<title>PQG Harness</title>
manifest.name = PQG Harness
manifest.short_name = PQG
primary Source link = local repository
About/attribution retains both upstream references
```

- [ ] **Step 3: Replace hostname language routing with browser-language behavior**

Use a provisional resolver equivalent to:

```js
function resolveInitialLocale() {
  if (typeof window === 'undefined') return 'en'
  const tags = [...(navigator.languages ?? []), navigator.language]
  return tags.some(tag => String(tag || '').toLowerCase().split('-')[0] === 'zh') ? 'zh' : 'en'
}
```

`vi-VN` must therefore select English unless a complete stable `vi` registration path is implemented later.

- [ ] **Step 4: Inspect the exact pinned DSH locale extension API once**

Record in `docs/localization/vi-status.md`:

```text
locale registration symbol/path
namespace dictionary registration mechanism
whether an external product plugin can register vi completely
whether the Settings selector reads the registry dynamically
final decision: clean extension available OR full Vietnamese deferred
```

If no stable external seam exists, do not patch compiled translation strings.

- [ ] **Step 5: Run prepare/test/build and commit**

```bash
npm run prepare:dsh-web
npm run test:prepared
npm run build:prepared
```

```bash
git add config/product.mjs scripts/prepare-dsh-web.mjs tests docs/localization index.html public
git commit -m "feat: add stable PQG product and locale layer"
```

---

### Task 13: WP6 Core — keyboard accessibility and representative viewport verification

**Files:**
- Modify: `scripts/prepare-dsh-web.mjs`
- Modify: `tests/dsh-web.test.ts`
- Create: `docs/verification/2026-09-04-wp6-preview-ui.md`

**Interfaces:**
- PQG-owned dialog must support Escape close, focus return, and Tab/Shift+Tab focus containment.

- [ ] **Step 1: Write generated-contract RED assertions**

Require producer output to contain explicit:

```text
focusable selector
Escape handler
Tab and Shift+Tab cycle
inert handling when supported
opener focus restoration
focusin/focusout discovery for locked-state help
```

- [ ] **Step 2: Implement the smallest keyboard behavior**

On open, save `document.activeElement`, set the application root inert when supported, focus the first dialog control, and trap Tab within the card. On close, clear inert and restore the saved opener if still connected.

- [ ] **Step 3: Regenerate and run quality**

```bash
npm run prepare:dsh-web
npm run test:prepared
npm run build:prepared
```

- [ ] **Step 4: Preview viewport smoke**

Verify at minimum:

```text
390x844 phone
768x1024 tablet
1440x900 desktop
200% desktop zoom
```

Check product title, model selector, permission selector, session navigation, dialog keyboard behavior, locked-state explanation, and critical console errors.

Locale smoke:

```text
vi-VN -> English core, never hostname-driven Chinese
zh-CN -> Chinese
en-US -> English
```

- [ ] **Step 5: Commit source + verification evidence**

```bash
git add scripts/prepare-dsh-web.mjs tests/dsh-web.test.ts index.html public docs/verification/2026-09-04-wp6-preview-ui.md
git commit -m "fix: make PQG chrome keyboard-usable"
```

---

### Task 14: WP7 Core — operational docs, release checklist, integration, and Foundation Freeze

**Files:**
- Create: `SECURITY.md`
- Create: `ARCHITECTURE.md`
- Create: `RUNBOOK.md`
- Create: `CHANGELOG.md`
- Create: `docs/release/RELEASE_CHECKLIST.md`
- Create: `docs/release/KNOWN_LIMITATIONS.md`
- Modify: `PROJECT_STATUS.md`
- Modify: `README.md`
- GitHub repository settings: required `quality` rule before deployment reconnect.

**Interfaces:**
- Produces the final Personal v1 Foundation Core gate and the immutable base SHA for module development.

- [ ] **Step 1: Write `SECURITY.md` from verified boundaries only**

Required facts:

```text
project status / upstream preview dependency
supported version policy = current release only
secret handling
permission modes
Full Access meaning
sensitive automatic-file policy
Agent access state from WP5
preview credentials must not appear in issues/logs/docs
```

If access remains unresolved, write `NOT VERIFIED / Foundation Freeze blocker` rather than claiming protection.

- [ ] **Step 2: Write `ARCHITECTURE.md` for the post-WP implementation**

Document:

```text
Browser/DSH Web
EdgeOne Agent routes
per-conversation DSH sidecar
loopback Gateway
loopback MCP
EdgeOne Sandbox/Store/AI Gateway
canonical project workspace + native checkpoint lifecycle
DSH /tmp state
sidecar lifecycle/Stop
permission/sensitive-file boundary
generated-vs-source ownership
deployment responsibility
```

Include a Mermaid runtime flow and a separate persistence-boundary diagram.

- [ ] **Step 3: Write `RUNBOOK.md` from observed WP5 behavior**

Deployment:

```text
feature/fix branch -> quality -> Preview -> build-meta/smoke
-> reviewed Foundation integration PR -> main
-> Production deploy only after owner reconnect/approval
-> production build-meta/safe smoke
```

Incident triage order:

```text
build-meta SHA -> deployment/build log -> native logs/traces
-> classify frontend/Host/sidecar/Gateway/MCP/sandbox/persistence
-> stop promotion -> rollback/redeploy
```

Include credential incident and workspace recovery procedures using verified behavior only.

- [ ] **Step 4: Create the release checklist mapped to every P1**

The checklist must contain explicit rows for M01, M02, M03, M04, M05, M06, M08, M09, M10, M13 and one of:

```text
CLOSED — evidence reference
ACCEPTED RISK — owner reason + review date
```

No silent P1 omission.

- [ ] **Step 5: Create `KNOWN_LIMITATIONS.md`**

Keep only limitations still true, including where applicable:

```text
upstream DSH remains pre-release/developer-preview
Full Access runs arbitrary sandbox shell commands
native checkpoints exclude dependencies/build/cache and obey platform limits
canonical symlink policy not proven by platform APIs
full Vietnamese UI deferred if no stable locale seam
Gateway nonstandard header semantics unresolved if authoritative evidence was unavailable
multi-user ownership/RBAC is out of scope for Personal v1
```

- [ ] **Step 6: Create `CHANGELOG.md` without inventing releases**

Use:

```markdown
# Changelog

## [Unreleased]

### Added
### Changed
### Fixed
### Security
```

- [ ] **Step 7: Update README/project identity and status**

README opening:

```markdown
# PQG Harness

PQG Harness is a project derived from the TencentEdgeOne DeepSeek Harness adapter and the DeepSeek Harness ecosystem. It keeps the upstream architecture while adding PQG-specific hardening and product behavior.
```

Link `UPSTREAM.md`, `SECURITY.md`, `ARCHITECTURE.md`, `RUNBOOK.md`, and `PROJECT_STATUS.md`.

Update `package.json` repository/name/description only if WP6 product identity has already proven clean generation; retain `private:true`, MIT license, and provenance.

- [ ] **Step 8: Run the final local/CI gate on the exact candidate SHA**

```bash
npm ci
npm run prepare:dsh-web
git diff --exit-code -- index.html public agents/api
npm run typecheck
npm run test:prepared
npm run build:prepared
```

Plus focused integration tests:

```bash
node --experimental-strip-types --test \
  tests/workspace.test.ts \
  tests/sidecar-lifecycle.test.ts \
  tests/proxy-stream.test.ts \
  tests/stop.test.ts \
  tests/dependency-contract.test.ts \
  tests/lock-integrity.test.ts \
  tests/gateway-proxy.test.ts \
  tests/proxy-error-policy.test.ts \
  tests/build-meta.test.ts \
  tests/product-config.test.ts
```

Expected: PASS.

- [ ] **Step 9: Create or update `integration/foundation-core`**

The branch must contain final GREEN WP2–WP7 commits and all prior WP0/WP1 work. Do not merge temporary verification PRs.

- [ ] **Step 10: Open one final Foundation Core integration PR to `main`**

PR body must include:

```text
exact head SHA/tree
WP0-WP7 Core summary
quality run
WP2 recycle evidence
WP3 cancellation evidence
WP5 build-meta/topology/access/smoke/rollback evidence
WP6 UI/locale evidence
P1 closure table
deferred/known limitations
explicit statement that Production Auto Deploy remains disconnected until owner approval
```

- [ ] **Step 11: Configure the `main` quality safety rail before reconnecting deployment**

Required behavior:

```text
changes reach main through PR
quality status required
no direct accidental production promotion
```

If the GitHub App cannot modify repository rulesets, record the exact required owner action in `PROJECT_STATUS.md` and keep deployment reconnect blocked until it is completed.

- [ ] **Step 12: Run final Preview verification from the integration SHA**

Re-run the core smoke and verify `/build-meta.json` exactly matches the integration SHA.

- [ ] **Step 13: Declare Foundation Freeze**

Only after every Foundation Freeze row in the design spec is GREEN or explicitly owner-accepted, update `PROJECT_STATUS.md`:

```markdown
- Foundation state: FROZEN FOR PERSONAL V1 MODULE DEVELOPMENT
- Foundation SHA: `<40-char commit>`
- Foundation tree: `<40-char tree>`
```

Commit:

```bash
git add SECURITY.md ARCHITECTURE.md RUNBOOK.md CHANGELOG.md README.md PROJECT_STATUS.md docs/release
git commit -m "docs: declare Personal v1 Foundation Core readiness"
```

- [ ] **Step 14: Do not start a module in this plan**

The next design cycle begins from the Foundation Freeze SHA and covers only:

```text
Task module first
then Writing
then Support Agent v1
then Planning
then Document
then Data
```

No foundation refactor is mixed into the first module PR unless a verified Foundation gate regression blocks the module.

---

## Deferred work after Foundation Freeze

The following are explicitly not blockers for Personal v1 module development:

- full symlink/canonical-path enforcement without a verified platform primitive;
- DSH version upgrade;
- Vite/TypeScript/OTel/MCP/Zod modernization;
- broad BYOK/provider catalog redesign;
- third-party telemetry stack;
- full Vietnamese translation if no stable locale registration seam exists;
- full WCAG audit;
- multi-user identity, ownership, RBAC, registration, OAuth, password reset;
- plugin marketplace/runtime dynamic module loading;
- automated SBOM/license inventory unless public distribution is being prepared;
- enterprise release governance.

Each deferred item must be represented in `KNOWN_LIMITATIONS.md` only if it remains materially relevant to actual Personal v1 use.