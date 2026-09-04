# PQG-Harness WP2 Workspace Durability & Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bounded conversation-metadata file snapshot as the durability authority with EdgeOne Sandbox native `persist({ path })` / `restore({ path })`, while safely migrating existing legacy snapshots and making durability failures explicit.

**Architecture:** The EdgeOne sandbox project directory `projects/<conversation>/workspace` becomes the canonical coding filesystem. A persisted `.pqg-workspace-ready` marker prevents repeated restore into a live workspace. Native checkpoints are serialized per conversation/process and executed after file writes and shell commands. Legacy `workspaceSnapshot` is read only for one-time migration when no native checkpoint exists, then retired.

**Tech Stack:** EdgeOne Makers Sandbox `persist/restore`, TypeScript, Node test runner.

**Spec:** `docs/audit/phase-1/PHASE-1B-coordinator-consolidation.md` — M01 and M16. EdgeOne official Sandbox API documents `context.sandbox.persist({ path, timeout })` and `context.sandbox.restore({ path, timeout })`, 25 MiB checkpoint limit, automatic exclusion of dependencies/build/cache directories, and recommends restore before use and persist after important changes.

## Global Constraints

- Do not invent a second external database for source-code persistence.
- Do not persist runtime processes/browser state/preview URL as if they were files.
- If restore fails for reasons other than `not_found`, do **not** persist that incomplete workspace in the same round.
- Sensitive-file policy from WP1 remains enforced for automatic file tools.
- Legacy metadata snapshot is migration-only after this WP; it is not the ongoing source of truth.
- No DSH dependency upgrade in this WP.

---

## File map

**Modify:**
- `agents/_workspace.ts` — native checkpoint lifecycle, legacy migration, explicit persistence result, preview health.
- `agents/_mcp-bridge.ts` — surface persistence failure as tool error.
- `tests/workspace.test.ts` — native restore/persist, migration, command persistence, concurrency, failure behavior.

**Optional small test helper create:**
- `tests/helpers/fake-sandbox.ts` if repeated mocks make `tests/workspace.test.ts` hard to read.

---

### Task 1: Define native checkpoint interfaces and a single persistence queue

**Files:**
- Modify: `agents/_workspace.ts`
- Modify: `tests/workspace.test.ts`

**Interfaces:**

```ts
export interface WorkspaceCheckpoint {
  size: number
  sha256: string
  etag: string
  persistedAt: string
}

export interface WorkspacePersistenceStatus {
  persisted: boolean
  checkpoint?: WorkspaceCheckpoint
  error?: string
}
```

Internal API:

```ts
async function persistWorkspaceCheckpoint(
  context: any,
  conversationId: string,
  root: string,
): Promise<WorkspaceCheckpoint>
```

- [ ] **Step 1: Write a failing serialization test**

Build a fake sandbox whose `persist()` increments an active counter, awaits a controlled promise, and records max concurrency. Trigger two `persistWorkspaceCheckpoint` calls for the same conversation and assert max active calls is `1` and call count is `2`.

- [ ] **Step 2: Run focused test and verify failure**

```bash
node --experimental-strip-types --test tests/workspace.test.ts
```

Expected: FAIL because native persistence queue does not exist.

- [ ] **Step 3: Implement per-conversation queue**

Use a module-level map:

```ts
const workspacePersistQueues = new Map<string, Promise<WorkspaceCheckpoint>>()

async function persistWorkspaceCheckpoint(context: any, conversationId: string, root: string) {
  const previous = workspacePersistQueues.get(conversationId)
  const next = (previous ? previous.catch(() => undefined) : Promise.resolve())
    .then(() => context.sandbox.persist({ path: root, timeout: 180 }))
    .then((result: any) => ({
      size: Number(result.size),
      sha256: String(result.sha256 || ''),
      etag: String(result.etag || ''),
      persistedAt: String(result.persistedAt || ''),
    }))
  workspacePersistQueues.set(conversationId, next)
  try {
    return await next
  } finally {
    if (workspacePersistQueues.get(conversationId) === next) workspacePersistQueues.delete(conversationId)
  }
}
```

Do not catch/convert the persistence error here; callers decide how to surface it.

- [ ] **Step 4: Run focused test/typecheck**

```bash
node --experimental-strip-types --test tests/workspace.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agents/_workspace.ts tests/workspace.test.ts
git commit -m "feat: add serialized workspace checkpoints"
```

---

### Task 2: Restore native checkpoint once per sandbox and migrate legacy snapshot only on `not_found`

**Files:**
- Modify: `agents/_workspace.ts`
- Modify: `tests/workspace.test.ts`

**Interfaces:**
- Marker: `.pqg-workspace-ready` inside the workspace root.
- `ensureWorkspace()` never uses directory non-emptiness as a recovery-validity test.
- Legacy snapshot restore is private migration-only.

- [ ] **Step 1: Write failing tests**

Add cases:

1. `restore()` returns `{ restored: true, ... }` → no legacy metadata read/write; marker written.
2. `restore()` returns `{ restored: false, reason: 'not_found' }` and legacy snapshot exists → legacy files restored, native `persist()` called once, legacy snapshot cleared only after native persist succeeds.
3. `restore()` throws → `ensureWorkspace()` rejects; marker is not written; `persist()` is never called.
4. marker already exists → `restore()` is not called again on a live sandbox.
5. partial junk file without marker does **not** suppress restore.

- [ ] **Step 2: Replace `workspaceHasFiles()` restore gate**

Introduce:

```ts
const WORKSPACE_READY_MARKER = '.pqg-workspace-ready'

async function workspaceReady(context: any, root: string): Promise<boolean> {
  return Boolean(await context.sandbox.files.exists(`${root}/${WORKSPACE_READY_MARKER}`))
}

async function markWorkspaceReady(context: any, root: string): Promise<void> {
  await context.sandbox.files.write(`${root}/${WORKSPACE_READY_MARKER}`, 'v1\n')
}
```

- [ ] **Step 3: Preserve legacy loader but stop swallowing all errors**

Refactor legacy metadata read to return a discriminated result:

```ts
type LegacySnapshotLoad =
  | { kind: 'found'; snapshot: WorkspaceSnapshot }
  | { kind: 'missing' }

async function loadLegacyWorkspaceSnapshot(context: any, conversationId: string): Promise<LegacySnapshotLoad> {
  try {
    const conversation = await getConversation(context, conversationId)
    const snapshot = conversation?.metadata?.workspaceSnapshot
    if (!snapshot || typeof snapshot !== 'object' || Object.keys(snapshot).length === 0) return { kind: 'missing' }
    return { kind: 'found', snapshot: snapshot as WorkspaceSnapshot }
  } catch (error) {
    if (isMissingConversation(error)) return { kind: 'missing' }
    throw error
  }
}
```

- [ ] **Step 4: Implement restore state machine**

Use this ordering:

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

Important: if `restore()` throws, nothing calls persist. If legacy restore/persist fails, do not clear the legacy snapshot.

- [ ] **Step 5: Change `ensureWorkspace()`**

```ts
export async function ensureWorkspace(context: any, conversationId: string): Promise<string> {
  const root = workspaceRoot(conversationId)
  await context.sandbox.files.makeDir(root)
  await initializeWorkspace(context, conversationId, root)
  return root
}
```

Delete `workspaceHasFiles()` after all references are removed.

- [ ] **Step 6: Run tests/typecheck**

```bash
node --experimental-strip-types --test tests/workspace.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add agents/_workspace.ts tests/workspace.test.ts
git commit -m "fix: restore workspace from native sandbox checkpoint"
```

---

### Task 3: Persist after every automatic file write and every shell command

**Files:**
- Modify: `agents/_workspace.ts`
- Modify: `agents/_mcp-bridge.ts`
- Modify: `tests/workspace.test.ts`

**Interfaces:**

`writeWorkspaceFile` returns:

```ts
{ path: string; bytes: number; persisted: true; checkpoint: WorkspaceCheckpoint }
```

`runWorkspaceCommand` returns:

```ts
{
  command: string
  stdout: string
  stderr: string
  exitCode: number
  persistence: WorkspacePersistenceStatus
}
```

- [ ] **Step 1: Write failing tests**

Add cases:
- direct write calls `persist()` after `files.write`;
- direct write persistence failure rejects with message containing `checkpoint persistence failed`;
- command exit 0 calls `persist()`;
- command exit nonzero still calls `persist()` because the command may have modified files before failing;
- command persistence failure returns `persistence.persisted === false` rather than pretending durable success.

- [ ] **Step 2: Implement direct-write persistence**

Replace legacy `saveWorkspaceSnapshotFile` call with:

```ts
await context.sandbox.files.write(`${root}/${path}`, content)
let checkpoint: WorkspaceCheckpoint
try {
  checkpoint = await persistWorkspaceCheckpoint(context, conversationId, root)
} catch (error) {
  throw new Error(`Workspace write completed but checkpoint persistence failed: ${error instanceof Error ? error.message : String(error)}`)
}
return { path, bytes: new TextEncoder().encode(content).byteLength, persisted: true, checkpoint }
```

Stop updating the legacy snapshot on normal writes.

- [ ] **Step 3: Persist after command regardless of exit code**

After `commands.run`:

```ts
let persistence: WorkspacePersistenceStatus
try {
  const checkpoint = await persistWorkspaceCheckpoint(context, conversationId, root)
  persistence = { persisted: true, checkpoint }
} catch (error) {
  persistence = { persisted: false, error: error instanceof Error ? error.message : String(error) }
}
```

Return this field with command output.

In MCP bridge, set tool error if either command failed or durability failed:

```ts
isError: result.exitCode !== 0 || result.persistence.persisted !== true
```

- [ ] **Step 4: Run tests/typecheck**

```bash
node --experimental-strip-types --test tests/workspace.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agents/_workspace.ts agents/_mcp-bridge.ts tests/workspace.test.ts
git commit -m "fix: persist workspace after mutations"
```

---

### Task 4: Make preview state health-based, not metadata-only

**Files:**
- Modify: `agents/_workspace.ts`
- Modify: `tests/workspace.test.ts`

**Interfaces:**
- `currentPreview()` returns `published:false` if port 3000 is not healthy on the current sandbox instance, even if old metadata says published.
- It never assumes a process/URL survives restore.

- [ ] **Step 1: Write failing tests**

Cases:
- metadata says published, health command/curl fails → `{ published:false }`;
- metadata says published, health passes → tokenized browser-only URL returned;
- a newly restored workspace does not claim preview until `publishWorkspacePreview()` restarts service.

- [ ] **Step 2: Add health check**

Inside `currentPreview()` before returning URL:

```ts
const health = await context.sandbox.commands.run(
  "curl -fsS http://127.0.0.1:3000/preview/ >/dev/null 2>&1 || curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1",
  { timeout: 5 },
)
if (health.exitCode !== 0) return { published: false }
```

If health fails, best-effort update metadata to `preview: { published:false, updatedAt:Date.now() }` but do not let metadata failure turn a correct health result into an exception.

- [ ] **Step 3: Run focused tests**

```bash
node --experimental-strip-types --test tests/workspace.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add agents/_workspace.ts tests/workspace.test.ts
git commit -m "fix: derive preview state from live sandbox health"
```

---

### Task 5: Improve listing completeness metadata without changing file authority

**Files:**
- Modify: `agents/_workspace.ts`
- Modify: `agents/_mcp-bridge.ts`
- Modify: `tests/workspace.test.ts`

**Interfaces:**

Change list result from raw array to:

```ts
export interface WorkspaceListing {
  items: WorkspaceItem[]
  truncated: boolean
  limit: number
}
```

- [ ] **Step 1: Write failing test for >400 entries**

Mock command output with 401 valid files and assert the result has 400 items and `truncated:true`.

- [ ] **Step 2: Implement listing envelope**

Parse all valid rows to `parsed`, then:

```ts
const limit = 400
return {
  items: parsed.slice(0, limit),
  truncated: parsed.length > limit,
  limit,
}
```

Update MCP tool serialization accordingly.

Do not attempt symlink-following/canonical path enforcement in this task; shell authority and symlink policy require a separate design decision after native durability is stable.

- [ ] **Step 3: Run tests/typecheck**

```bash
node --experimental-strip-types --test tests/workspace.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add agents/_workspace.ts agents/_mcp-bridge.ts tests/workspace.test.ts
git commit -m "feat: expose workspace listing completeness"
```

---

### Task 6: Recycle/recovery integration test in EdgeOne Preview

**Files:**
- No source changes expected.

- [ ] **Step 1: Deploy WP2 branch to Preview through existing EdgeOne Git integration**

Confirm Preview only.

- [ ] **Step 2: Create four non-secret files**

Use automatic file tools for two files and an approved shell command for two files. Modify one shell-created file and delete another.

- [ ] **Step 3: Force a new sandbox instance safely**

Use the documented sandbox lifecycle in Preview: either wait for/reach recycle or use a controlled test-only mechanism. Do not run this destructive lifecycle test against Production.

Record old/new `instanceId` if available via `context.sandbox.getInfo()` diagnostics.

- [ ] **Step 4: Reopen same conversation ID and verify exact expected workspace**

Expected:
- direct-write files survive;
- command-created and command-modified files survive;
- deleted file remains deleted;
- dependencies/build/cache need not survive because native checkpoint excludes them;
- preview must be republished/restarted.

- [ ] **Step 5: Verify legacy migration separately using a synthetic test conversation**

Seed only non-secret legacy metadata snapshot data, then verify first native restore migrates and future restore uses native checkpoint.

---

## WP2 acceptance criteria

- [ ] Native Sandbox checkpoint is the durability authority.
- [ ] Restore error never triggers persist of an incomplete workspace.
- [ ] `workspaceHasFiles()` non-empty-directory heuristic is gone.
- [ ] Legacy snapshots migrate only when native checkpoint is absent.
- [ ] Legacy snapshot is not cleared until native persist succeeds.
- [ ] Direct writes and shell mutations are persisted.
- [ ] Concurrent same-process persists serialize.
- [ ] Durability failures are visible to the tool/user.
- [ ] Preview state is live-health-based and republished after recycle.
- [ ] Preview recycle integration test proves command-created/modified/deleted state behavior.

## Rollback

Keep the legacy migration reader for at least one release after native persistence ships. If Preview reveals an EdgeOne native checkpoint regression, revert WP2 commits as a unit to the previous snapshot mechanism; do not partially combine native restore with legacy per-file save logic.