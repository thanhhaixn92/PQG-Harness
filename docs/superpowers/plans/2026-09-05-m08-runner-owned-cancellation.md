# M08 Runner-Owned Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Stop terminate the sandbox command owned by the active DSH/Makers runner without relying on process-local cross-request sandbox registries.

**Architecture:** `/stop` follows the EdgeOne dual-channel contract: the target conversation ID is carried in the body, and `context.utils.abortActiveRun(conversationId)` owns cancellation routing. The active runner observes its own `context.request.signal`; while a Makers sandbox command is in flight, that runner attaches one abort listener that calls its own `context.sandbox.kill()`. The listener is removed as soon as command execution settles, before workspace checkpoint persistence begins.

**Tech Stack:** TypeScript, Node 24, EdgeOne Makers Agent runtime, DeepSeek Harness DSH Web sidecar, MCP bridge, `node:test`.

**Spec:** Approved 2026-09-05 project decision “A — runner-owned AbortSignal → kill the runner’s own sandbox”.

## Global Constraints

- Production baseline is `main` commit `75e872e3028529d90086ec4275b414770b7c195b`.
- Do not write directly to `main`; all changes land through a protected-branch PR requiring `quality`.
- Preserve existing workspace native persist/restore semantics and do not checkpoint after an aborted/killed command.
- Do not use a process-local `Map`/registry to transfer sandbox handles between `/stop` and the runner.
- `/stop` must not kill the Stop request’s sandbox as a substitute for the runner-owned sandbox.
- Keep `stopDshWebSidecar` and `abortActiveRun` concurrent so Stop does not wait on one mechanism before starting the other.
- Do not add dependencies or reimplement EdgeOne sandbox/control-plane clients.
- Reuse upstream cancellation semantics and tests where compatible; provenance is recorded in `docs/upstream/UPSTREAM_SOURCES.md`.

---

### Task 1: Lock the runner-owned cancellation contract with RED tests

**Files:**
- Modify: `tests/workspace.test.ts`
- Modify: `tests/stop.test.ts`

**Interfaces:**
- Consumes: existing `runWorkspaceCommand(context, conversationId, command, timeout?)` and `onRequestPost(context)`.
- Produces: executable regression contract for runner-owned cancellation and Stop delegation.

- [ ] **Step 1: Add a failing workspace test for in-flight abort**

Add a test where `sandbox.commands.run()` remains pending, `context.request.signal` is aborted, and the test requires `context.sandbox.kill()` to be called exactly once before the pending command rejects. The existing implementation must fail because it never observes `context.request.signal`.

- [ ] **Step 2: Add a failing workspace test for pre-aborted entry**

Create an already-aborted `AbortController`, call `runWorkspaceCommand`, and require command dispatch to be skipped while the runner-owned sandbox is killed once. This follows DeepSeek’s pre-aborted cancellation contract.

- [ ] **Step 3: Replace Stop tests that assert cross-request sandbox registry behavior**

Require `/stop` to call `abortActiveRun(conversationId)` and sidecar shutdown, but never call `context.sandbox.kill()` on the Stop request. Remove assertions that a Stop process can see command sandbox handles through `_active-sandbox.ts`.

- [ ] **Step 4: Run the PR `quality` workflow and record RED**

Expected: at least the new runner-owned cancellation tests fail for the intended reason; generated artifacts, install, and unrelated tests remain healthy.

### Task 2: Implement the minimal runner-owned abort adapter

**Files:**
- Create: `agents/_sandbox-abort.ts`
- Modify: `agents/_workspace.ts`
- Modify: `agents/_mcp-bridge.ts`

**Interfaces:**
- Produces: `runWithSandboxAbort<T>(context, operation): Promise<T>`.
- Contract: use `context.request.signal`; abort before dispatch short-circuits; abort during operation calls `context.sandbox.kill()` once; remove listener before returning/throwing; do not expose raw kill errors to model-visible output.

- [ ] **Step 1: Implement only enough adapter code to satisfy the RED tests**

Use the active runner’s `context.request.signal` and its own injected `context.sandbox.kill()`. No registry, polling, shared state, or new dependency.

- [ ] **Step 2: Wrap `runWorkspaceCommand` shell execution only**

Keep workspace initialization before execution. Wrap only `context.sandbox.commands.run(...)`; after it settles, the abort listener is gone. Existing checkpoint persistence then runs only after a normal command settlement.

- [ ] **Step 3: Wrap `sandbox_wait` with the same adapter**

Use the shared helper around the deterministic `sleep ...` command so the M08 diagnostic tool has identical cancellation semantics.

- [ ] **Step 4: Run targeted tests and full `quality`**

Expected: new tests GREEN; all existing tests, typecheck, generated-artifact drift guard, and build GREEN.

### Task 3: Return `/stop` to the official EdgeOne responsibility boundary

**Files:**
- Modify: `agents/stop.ts`
- Modify: `agents/_mcp-bridge.ts`
- Delete: `agents/_active-sandbox.ts`
- Modify: `tests/stop.test.ts`

**Interfaces:**
- `/stop` input remains `{ conversation_id: string }`.
- `/stop` output preserves stable non-secret `sidecar` and `platform` outcomes; it no longer claims that the Stop request directly killed the runner sandbox.

- [ ] **Step 1: Remove `_active-sandbox.ts` imports and lifecycle barriers**

Delete active sandbox registration, stop barriers, and reset-on-new-MCP-bridge behavior.

- [ ] **Step 2: Simplify Stop to concurrent sidecar shutdown + platform abort**

Compute `ok` from stable sidecar/platform outcomes only. Do not touch `context.sandbox` in `/stop`.

- [ ] **Step 3: Run targeted Stop/workspace tests and full `quality`**

Expected: GREEN with no reference to the process-local active sandbox registry.

### Task 4: Upstream provenance and live M08 closure

**Files:**
- Create/Update: `docs/upstream/UPSTREAM_SOURCES.md`
- Update only after evidence: release/audit evidence file that currently tracks M08.

**Interfaces:**
- Provenance pins repo, commit SHA, source path, reused semantic, and license.

- [ ] **Step 1: Record the pinned sources**

Pin EdgeOne Makers Tools `f106ce7b9c5893cc3d4afafaec1eb67ed3f5b3c2`, TencentEdgeOne DeepSeek Harness `2110cc1bb5f6d5436593927fa6a4fa46e6f16407`, DeepSeek Harness `d347e703908d0406b7a7ef80e3a0e594d86b2215`, and TencentEdgeOne Node Agent Starter `d8f77aec75b9d887be5dc8aae049a32d87efceec`.

- [ ] **Step 2: Review and merge only after protected `quality` succeeds**

Do not weaken the existing `Protect main` ruleset.

- [ ] **Step 3: Verify deployed identity before live M08**

`/build-meta.json` must match the merged `main` commit/tree.

- [ ] **Step 4: Run the Production delayed-mutation proof**

Use a fresh marker path, run `sleep 20; printf 'SHOULD-NOT-EXIST\n' > <marker>`, press Stop while the command is visibly in flight, wait beyond 20 seconds, then verify the marker is absent. Only then close M08.
