# PQG-Harness WP3 Sidecar Lifecycle & Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make per-conversation DSH sidecar startup, idle reaping, cleanup, context use, SSE cancellation, and Stop behavior deterministic and failure-independent.

**Architecture:** Replace the bare `Map<string, Promise<DshWebSidecar>>` lifecycle with an explicit per-conversation entry carrying state, active-use count and a stopping tombstone. Centralize resource cleanup in one idempotent close path. Keep the current child-process/loopback architecture, but make startup retries bounded and cleanup complete. Stop runs platform abort and sidecar close independently; sandbox-command cancellation is verified against EdgeOne before choosing whether sandbox kill is required.

**Tech Stack:** Node child processes/HTTP/WebSocket, TypeScript, EdgeOne Makers Agent runtime, Node test runner.

**Spec:** `docs/audit/phase-1/PHASE-1B-coordinator-consolidation.md` — M06, M07, M08.

## Global Constraints

- Do not replace the DSH sidecar architecture.
- Preserve loopback binding.
- Do not kill a sandbox merely to simplify Stop until the Preview cancellation contract test proves it is necessary.
- WP2 native workspace persistence must be in place before any fallback that may kill/recreate a sandbox.
- Sidecar cleanup must be idempotent.
- Stop must never skip `abortActiveRun()` because sidecar shutdown failed.

---

## File map

**Modify:**
- `agents/_dsh-web-sidecar.ts` — lifecycle entry, retries, cleanup, active-use lease, context provider.
- `agents/api/_proxy.ts` — acquire/release sidecar leases; SSE cancellation before/after startup.
- `agents/_gateway-proxy.ts` — resolve current context per request instead of capturing first invocation.
- `agents/_mcp-bridge.ts` — resolve current context per request instead of capturing first invocation.
- `agents/stop.ts` — stopping tombstone and failure-independent abort/close.
- `tests/config.test.ts` — remove obsolete source assumptions only where behavior tests supersede them.

**Create:**
- `tests/sidecar-lifecycle.test.ts` — deterministic lifecycle/concurrency/fault tests.
- `tests/stop.test.ts` — stop ordering/all-settled behavior.
- `tests/proxy-stream.test.ts` — cancellation before sidecar readiness and SSE close semantics.

---

### Task 1: Introduce explicit sidecar entries and idempotent close

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
```

Exports used by later tasks:

```ts
export interface DshWebSidecarLease {
  sidecar: DshWebSidecar
  release(): void
}

export async function acquireDshWebSidecar(context: any): Promise<DshWebSidecarLease>
export async function stopDshWebSidecar(conversationId: string): Promise<{ found: boolean; closed: boolean; error?: string }>
```

- [ ] **Step 1: Write failing lifecycle tests**

Test these invariants with injected/fake sidecar starters rather than spawning production DSH:

```ts
// two concurrent acquires for the same conversation call starter once
// release is idempotent and never drives activeUsers below 0
// stop marks entry stopping before awaiting pending startup
// acquire while stopping rejects with a stable SIDE_CAR_STOPPING error
// close called twice invokes child/gateway/mcp cleanup only once
```

To make testing possible, export a narrow test seam:

```ts
export function __setSidecarStarterForTests(
  starter: ((context: any, conversationId: string) => Promise<DshWebSidecar>) | undefined,
): void
```

Production default remains `startSidecar`.

- [ ] **Step 2: Run and verify failure**

```bash
node --experimental-strip-types --test tests/sidecar-lifecycle.test.ts
```

Expected: FAIL because lease/state APIs do not exist.

- [ ] **Step 3: Replace the map value type**

Use:

```ts
const sidecars = new Map<string, SidecarEntry>()
let sidecarStarter = startSidecar
```

`acquireDshWebSidecar(context)`:

1. resolve/validate `conversationId`;
2. sweep only entries safe to reap;
3. reject if existing entry is `stopping`;
4. create one `starting` entry if absent;
5. await `entry.pending`;
6. set state ready only if the map still points to this entry;
7. update `lastUsedAt` **before** returning;
8. increment `activeUsers`;
9. return one-shot `release()`.

- [ ] **Step 4: Make `DshWebSidecar.close()` idempotent**

Inside the sidecar object keep:

```ts
let closePromise: Promise<void> | undefined

async close() {
  closePromise ??= closeSidecarResources(...)
  return closePromise
}
```

Centralize child termination + gateway/mcp close in `closeSidecarResources()`.

- [ ] **Step 5: Run test/typecheck**

```bash
node --experimental-strip-types --test tests/sidecar-lifecycle.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add agents/_dsh-web-sidecar.ts tests/sidecar-lifecycle.test.ts
git commit -m "refactor: model sidecar lifecycle explicitly"
```

---

### Task 2: Make startup cleanup complete and bounded-retry port collisions

**Files:**
- Modify: `agents/_dsh-web-sidecar.ts`
- Modify: `tests/sidecar-lifecycle.test.ts`

**Interfaces:**
- `startSidecar()` performs at most 3 start attempts when the DSH child exits/bind fails during boot.
- Every failed attempt terminates child and closes Gateway/MCP.
- A successful readiness probe requires the child to remain alive through a short stability check before `workspace.create` is accepted.

- [ ] **Step 1: Write failing fault tests**

Use fake process/server dependencies by extracting a testable helper:

```ts
export async function startSidecarAttempt(
  context: any,
  conversationId: string,
  deps: SidecarStartDependencies = defaultSidecarStartDependencies,
): Promise<DshWebSidecar>
```

Test:
- `workspace.create` failure kills child and closes gateway/mcp;
- child exits during readiness → all companion resources close;
- first attempt gets bind/start failure, second succeeds → exactly two port allocations/children;
- three failures → final error and zero leaked companion servers.

- [ ] **Step 2: Implement a single failed-attempt cleanup function**

Use:

```ts
async function terminateChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise<void>(resolve => child.once('exit', () => resolve())),
    new Promise<void>(resolve => setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
      resolve()
    }, 3_000)),
  ])
}

async function cleanupAttempt(child, gateway, mcp) {
  await Promise.allSettled([terminateChild(child), gateway.close(), mcp.close()])
}
```

Use it in every startup catch and unexpected-exit resource path.

- [ ] **Step 3: Add bounded start retries**

Wrap attempt creation:

```ts
const START_ATTEMPTS = 3
let lastError
for (let attempt = 1; attempt <= START_ATTEMPTS; attempt++) {
  try { return await startSidecarAttempt(context, conversationId) }
  catch (error) {
    lastError = error
    if (attempt < START_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, 100 * attempt))
  }
}
throw lastError
```

Do not retry after a sidecar has reached ready state and later crashes; only startup attempts are retried.

- [ ] **Step 4: Harden readiness identity as far as current DSH interface permits**

After the first successful `GET /`, require:

```ts
await new Promise(resolve => setTimeout(resolve, 100))
if (child.exitCode !== null) throw new Error(...)
```

Then run `workspace.create` and check again that child is alive before returning. Document in code that the CLI does not expose an inherited-listener/nonce handshake; the retry/stability check mitigates but does not mathematically eliminate release-before-bind TOCTOU. Do not claim otherwise.

- [ ] **Step 5: Unexpected child exit closes companions**

Change the exit listener to delete its matching entry and invoke idempotent `sidecar.close()`/companion cleanup without attempting to kill an already-exited child.

- [ ] **Step 6: Run tests**

```bash
node --experimental-strip-types --test tests/sidecar-lifecycle.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add agents/_dsh-web-sidecar.ts tests/sidecar-lifecycle.test.ts
git commit -m "fix: clean up failed sidecar starts"
```

---

### Task 3: Reap only truly idle, unused sidecars

**Files:**
- Modify: `agents/_dsh-web-sidecar.ts`
- Modify: `agents/api/_proxy.ts`
- Modify: `tests/sidecar-lifecycle.test.ts`

**Interfaces:**
- A sidecar is reaping-eligible only when state=`ready`, activeUsers=`0`, and `lastUsedAt < cutoff`.
- Unary requests and SSE streams hold a lease until completion/close.

- [ ] **Step 1: Add fake-clock tests**

Test:
- first acquire after 25+ minutes does not sweep itself before touch;
- active lease blocks reap even with stale clock;
- after release and cutoff, sweep removes/closes entry;
- SSE lease keeps `activeUsers > 0` until stream closes/cancels.

- [ ] **Step 2: Implement safe sweep**

```ts
function sweepIdleSidecars(now = Date.now()): void {
  const cutoff = now - SIDECAR_IDLE_MS
  for (const [id, entry] of sidecars) {
    if (entry.state !== 'ready' || entry.activeUsers !== 0 || entry.lastUsedAt >= cutoff) continue
    entry.state = 'stopping'
    sidecars.delete(id)
    void entry.pending.then(sidecar => sidecar.close()).catch(() => undefined)
  }
}
```

Call sweep **after** resolving current entry identity or before creation only when the current requested entry is explicitly excluded; simplest safe rule: acquire current entry/create first, touch it, then sweep other eligible entries.

- [ ] **Step 3: Update unary proxy to release lease in `finally`**

Replace direct `getDshWebSidecar()` with:

```ts
const lease = await acquireDshWebSidecar(context)
try {
  const sidecar = lease.sidecar
  // existing proxy work
} finally {
  lease.release()
}
```

Ensure binary export/settings paths still release.

- [ ] **Step 4: Update event stream lease lifetime**

The SSE stream owns the lease until socket close/cancel/error. Do not release immediately after WebSocket creation.

- [ ] **Step 5: Run tests**

```bash
node --experimental-strip-types --test tests/sidecar-lifecycle.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add agents/_dsh-web-sidecar.ts agents/api/_proxy.ts tests/sidecar-lifecycle.test.ts
git commit -m "fix: keep active sidecars out of idle reaping"
```

---

### Task 4: Resolve current context per Gateway/MCP request

**Files:**
- Modify: `agents/_dsh-web-sidecar.ts`
- Modify: `agents/_gateway-proxy.ts`
- Modify: `agents/_mcp-bridge.ts`
- Modify: `tests/sidecar-lifecycle.test.ts`
- Modify/Create gateway/MCP focused tests as needed.

**Interfaces:**

Introduce:

```ts
export type MakersContextProvider = () => any
```

Change constructors:

```ts
startLocalGatewayProxy(getContext: MakersContextProvider, conversationId: string)
startLocalMcpBridge(getContext: MakersContextProvider, conversationId: string)
```

The sidecar keeps one mutable `currentContext` reference updated at every acquire; Gateway/MCP resolve it at request handling time.

- [ ] **Step 1: Write failing context-refresh tests**

Construct provider context A then update to B. Assert a later Gateway/MCP request uses B's `env`, `sandbox`, `store`, `tools`, not A's.

- [ ] **Step 2: Change sidecar state**

Instead of exposing writable `sidecar.context`, store:

```ts
let currentContext = context
const getCurrentContext = () => currentContext
```

Add method:

```ts
setContext(next: any) { currentContext = next }
```

`acquireDshWebSidecar` calls `sidecar.setContext(context)` before returning lease.

- [ ] **Step 3: Update local Gateway/MCP constructors**

Inside every incoming HTTP request handler:

```ts
const context = getContext()
```

Do not retain the first request object in closures beyond the provider function.

- [ ] **Step 4: Settings close uses the same provider**

Close-time settings snapshot resolves current context via `getCurrentContext()` rather than an unrelated mutable public property.

- [ ] **Step 5: Run tests/typecheck**

```bash
npm run typecheck
npm run test:prepared
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add agents/_dsh-web-sidecar.ts agents/_gateway-proxy.ts agents/_mcp-bridge.ts tests
git commit -m "fix: resolve current Makers context per sidecar request"
```

---

### Task 5: Close SSE cancellation timing gap

**Files:**
- Modify: `agents/api/_proxy.ts`
- Create: `tests/proxy-stream.test.ts`

**Interfaces:**
- Aborted request before sidecar readiness never opens a WebSocket afterward.
- Lease is released exactly once on abort/error/close/cancel.

- [ ] **Step 1: Extract a small testable cancellation guard**

Use local state:

```ts
let cancelled = Boolean(signal?.aborted)
let releaseLease: (() => void) | undefined
const cancel = () => {
  cancelled = true
  if (socket?.readyState === WebSocket.CONNECTING || socket?.readyState === WebSocket.OPEN) socket.close()
  releaseLease?.()
  releaseLease = undefined
}
```

- [ ] **Step 2: Write tests**

Test abort while `acquireDshWebSidecar()` promise is pending; after it resolves, assert WebSocket factory was never called and lease released. Test abort after open closes socket once and releases once.

- [ ] **Step 3: Implement checks before and after acquire**

```ts
if (cancelled || signal?.aborted) return closeControllerSafely()
const lease = await acquireDshWebSidecar(context)
releaseLease = lease.release
if (cancelled || signal?.aborted) {
  cancel()
  return closeControllerSafely()
}
```

Attach abort listener before awaiting sidecar acquisition.

- [ ] **Step 4: Run test/typecheck**

```bash
node --experimental-strip-types --test tests/proxy-stream.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agents/api/_proxy.ts tests/proxy-stream.test.ts
git commit -m "fix: cancel SSE before sidecar connection"
```

---

### Task 6: Make Stop failure-independent and block replacement sidecars during stop

**Files:**
- Modify: `agents/_dsh-web-sidecar.ts`
- Modify: `agents/stop.ts`
- Create: `tests/stop.test.ts`

**Interfaces:**

`stopDshWebSidecar()` returns structured outcome; `stop.ts` always calls both cancellation layers.

- [ ] **Step 1: Write failing stop tests**

Cases:
- sidecar close rejects but `abortActiveRun` still executes;
- `abortActiveRun` rejects but sidecar close still executes;
- both succeed → response fields report both;
- acquire during stop receives `SIDE_CAR_STOPPING` until stop settles;
- startup promise rejects during stop → platform abort still runs.

- [ ] **Step 2: Implement stopping tombstone**

Do not delete entry at stop start. Set:

```ts
entry.state = 'stopping'
```

Only delete in `finally` after pending sidecar close settles.

- [ ] **Step 3: Run cancellation phases independently**

In `stop.ts`:

```ts
const [webResult, platformResult] = await Promise.allSettled([
  stopDshWebSidecar(conversationId),
  context.utils?.abortActiveRun?.(conversationId),
])
```

Return HTTP 200 with stable structured fields if at least the endpoint itself executed; report per-phase errors as codes, not raw stack/internal messages.

Example shape:

```ts
{
  ok: webResult.status === 'fulfilled' && platformResult.status === 'fulfilled',
  conversation_id: conversationId,
  web: { ok: ..., closed: ... },
  platform: { ok: ..., aborted: ... }
}
```

- [ ] **Step 4: Run tests/typecheck**

```bash
node --experimental-strip-types --test tests/stop.test.ts tests/sidecar-lifecycle.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agents/_dsh-web-sidecar.ts agents/stop.ts tests/stop.test.ts
git commit -m "fix: make stop failure independent"
```

---

### Task 7: Determine actual EdgeOne sandbox command cancellation contract in Preview

**Files:**
- No code change in the verification step.
- Conditional fallback files only if the documented test fails: `agents/_mcp-bridge.ts`, `agents/stop.ts`, `tests/stop.test.ts`.

- [ ] **Step 1: Deploy WP3 branch to Preview**

Use the existing `sandbox_wait` tool with 20 seconds. Start it, wait until it is running, press Stop after ~2 seconds.

- [ ] **Step 2: Observe both Agent and sandbox command**

Use EdgeOne logs/trace and a second safe probe after stop. Pass criterion: the `sleep` process no longer executes/does not emit `WAIT_FINISHED` after Stop, within 3 seconds.

- [ ] **Step 3A: If the command is cancelled by platform semantics, record evidence and do not add sandbox kill**

Update the eventual `RUNBOOK.md`/architecture evidence in WP7, not source here.

- [ ] **Step 3B: If `WAIT_FINISHED` occurs after Stop, implement the explicit fallback**

Because EdgeOne's documented `commands.run()` options do not expose an AbortSignal/process handle, use the only documented hard cancellation primitive: `context.sandbox.kill()`.

Before kill, require WP2 checkpoint to have completed for the latest mutation boundary. In `stop.ts`, add the sandbox kill as a third independent `Promise.allSettled` phase **only when a module-level active-command registry reports an in-flight `workspace_run_command`/`sandbox_wait` for that conversation**. Do not kill for ordinary idle conversations.

Add in `_mcp-bridge.ts`:

```ts
const activeSandboxCommands = new Map<string, number>()
export function hasActiveSandboxCommand(conversationId: string): boolean
```

Increment/decrement in `try/finally` around `commands.run` for `sandbox_wait` and `workspace_run_command`.

In stop fallback:

```ts
if (hasActiveSandboxCommand(conversationId)) {
  phases.push(context.sandbox.kill())
}
```

Add tests proving idle stop does not kill sandbox and active-command stop does.

- [ ] **Step 4: Re-run Preview recycle recovery after any sandbox-kill fallback**

Expected: source workspace restores from WP2 native checkpoint; preview/background service requires republish; no post-stop command side effect continues.

---

## WP3 acceptance criteria

- [ ] No request can create a replacement sidecar while stop is in progress.
- [ ] Sidecar startup failures close child/Gateway/MCP resources.
- [ ] Startup collision gets bounded retry rather than a leaked/falsely-ready child.
- [ ] Active SSE/unary requests prevent idle reap.
- [ ] Gateway/MCP use current context through one explicit provider contract.
- [ ] Abort before readiness never opens a late WebSocket.
- [ ] Stop executes platform abort and sidecar close independently.
- [ ] Preview test establishes whether sandbox commands actually stop; fallback kill is added only if needed and only for active commands.
- [ ] All new lifecycle tests pass.

## Rollback

Each lifecycle task is independently reviewable, but Tasks 1–6 should remain coherent before merging to `main`. If the active-command sandbox-kill fallback is needed and causes unacceptable recycle latency, revert only the fallback and mark Stop semantics as a known limitation; never silently claim command cancellation that was not observed.