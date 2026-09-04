# A04 — Workspace isolation, persistence, recovery & filesystem safety

## 1. Metadata

- **Audit ID:** A04
- **Repository:** `thanhhaixn92/PQG-Harness`
- **Canonical branch:** `main`
- **Exact audited base SHA:** `70119cfdae992a203a5e29eb24e91c7200222a7c`
- **Audit branch:** `audit/a04-workspace-persistence`
- **Production URL supplied to the audit:** `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/`
- **Scope:** workspace isolation, persistence, recovery, filesystem/path semantics, preview persistence side effects, and the interaction between the DSH sidecar workspace and the EdgeOne Makers sandbox workspace.
- **Change policy:** audit-only / docs-only. No runtime, source, dependency, configuration, generated artifact, or production data changes.
- **Verdict:** **FAIL**
- **Finding counts:** **P0: 0 · P1: 5 · P2: 3 · P3: 1**
- **Status vocabulary:** `CONFIRMED`, `INFERRED`, `NOT VERIFIED`.

The verdict is **FAIL** because the current recovery mechanism has multiple confirmed paths that can lose, omit, resurrect, or fail to restore user project files after sandbox recycling. The repository sets `agents.sandbox.timeout` to 300 seconds, while current EdgeOne Makers documentation states that sandbox instances are automatically recycled at the configured lifecycle limit and that unsaved sandbox files are not guaranteed to survive instance recreation.

## 2. Scope & Method

### In scope

Primary code reviewed at the exact base SHA:

- `agents/_workspace.ts`
- `agents/_mcp-bridge.ts`
- `agents/_dsh-web-sidecar.ts`
- `agents/api/_proxy.ts`
- `tests/workspace.test.ts`
- `tests/sidecar-settings.test.ts`
- `index.html`
- `edgeone.json`
- `README.md`
- `package.json`

The audit covered per-conversation workspace-root derivation and isolation; path normalization, traversal, backslashes, percent-encoded strings, symlinks and shell-induced paths; list/read/write semantics and ignored paths; 512 KiB read preview truncation; custom `workspaceSnapshot` persistence with its 80-file / 2 MiB limits; snapshot ordering/eviction; restore and Store failure handling; conversation bootstrap/update semantics; command-created/modified/deleted files; sandbox recycle/restart; preview files/logs/process state; concurrent writes; session isolation; data loss/recovery; and the relationship between DSH `$DSH_HOME` and the Makers sandbox workspace.

### Method

1. Verified `main` through GitHub before analysis. It resolved to the exact expected SHA `70119cfdae992a203a5e29eb24e91c7200222a7c`.
2. Read relevant files directly from GitHub at that immutable commit.
3. Cross-checked current official EdgeOne Makers documentation for Sandbox lifecycle/persistence, conversation ownership, and `context.store.updateConversation` shallow-merge behavior.
4. Per audit policy, did **not** create test files or mutate data on the supplied production URL.
5. The repository test suite was inspected statically but was **not executed** in this audit environment because a local checkout was unavailable. That limitation is recorded as `NOT VERIFIED`, not as a pass.

## 3. Evidence Inventory

### Repository evidence

All repository links are pinned to the audited SHA.

- `agents/_workspace.ts` — symbols `workspaceRoot`, `normalizeWorkspacePath`, `loadWorkspaceSnapshot`, `workspaceHasFiles`, `restoreWorkspaceSnapshot`, `saveWorkspaceSnapshotFile`, `ensureWorkspace`, `listWorkspace`, `readWorkspaceFile`, `writeWorkspaceFile`, `runWorkspaceCommand`, `publishWorkspacePreview`, `currentPreview`  
  https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/agents/_workspace.ts
- `agents/_mcp-bridge.ts` — symbol `createMcpServer`, registrations for `workspace_list_files`, `workspace_read_file`, `workspace_write_file`, `workspace_run_command`, `publish_preview`  
  https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/agents/_mcp-bridge.ts
- `agents/_dsh-web-sidecar.ts` — symbols `dshHomeFor`, `restoreDshSettingsYaml`, `snapshotDshSettingsYaml`, `startSidecar`, `getDshWebSidecar`  
  https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/agents/_dsh-web-sidecar.ts
- `agents/api/_proxy.ts` — symbols `snapshotSettingsAfterWrite`, `proxy`  
  https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/agents/api/_proxy.ts
- `tests/workspace.test.ts` — lexical traversal rejection, root sanitization, conversation bootstrap, persistence-failure tolerance  
  https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/tests/workspace.test.ts
- `tests/sidecar-settings.test.ts` — settings YAML restore/snapshot only  
  https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/tests/sidecar-settings.test.ts
- `index.html` — bootstrap uses `crypto.randomUUID()` and injects `makers-conversation-id`  
  https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/index.html
- `edgeone.json` — `agents.sandbox.timeout: 300`  
  https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/edgeone.json
- `README.md` — describes per-conversation sidecar, `$DSH_HOME`, workspace, MCP bridge and settings snapshotting  
  https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/README.md

### Platform evidence

Official EdgeOne Makers documentation consulted on 2026-09-04:

- Sandbox overview — one conversation per sandbox, physical isolation, lifecycle recycling, `persist()` / `restore()`, 25 MiB checkpoint limit, and non-persistence of process/preview state: https://pages.edgeone.ai/document/sandbox-overview
- Agent quick start — `conversation_id` drives sandbox ownership and a UUID is sufficient: https://pages.edgeone.ai/document/agents-quick-start
- Conversation storage — cross-instance Store persistence and `updateConversation` metadata shallow merge, with identical keys overwritten: https://pages.edgeone.ai/document/agents-conversation-storage
- `edgeone.json` guide — `agents.sandbox.timeout` is sandbox-instance lifetime: https://pages.edgeone.ai/document/edgeone-json
- Vibe Coding — project files must be persisted for cross-instance continuation and preview addresses become invalid on sandbox reclamation: https://pages.edgeone.ai/document/vibe-coding

## 4. Architecture & Persistence Model Observed

### 4.1 EdgeOne Makers sandbox workspace

`workspaceRoot(conversationId)` returns `projects/<safeSegment(conversationId)>/workspace`. Makers MCP file operations call `ensureWorkspace()` and then use `context.sandbox.files.*` or `context.sandbox.commands.run(..., { cwd: root })`.

`normalizeWorkspacePath()` is lexical. It trims input, converts backslashes to `/`, removes one leading `./`, rejects absolute paths, NUL, empty components, `.`, and `..` components, then joins the remaining components.

### 4.2 Custom persistence layer

The audited workspace code does **not** call the platform's `context.sandbox.persist()` or `context.sandbox.restore()` APIs. Instead, `writeWorkspaceFile()` writes into the live sandbox and then calls `saveWorkspaceSnapshotFile()`. That function serializes UTF-8 file content into `conversation.metadata.workspaceSnapshot`, retaining at most 80 files and 2 MiB total. `restoreWorkspaceSnapshot()` recreates those files only when `workspaceHasFiles()` says the root is empty except for a top-level `preview` entry.

### 4.3 DSH sidecar workspace

Separately, `dshHomeFor(conversationId)` creates `/tmp/dsh-makers-web/<safeSegment(conversationId)>`. `startSidecar()` starts `dsh web` with `DSH_HOME`/`DSH_CWD` under that local sidecar area, creates `/tmp/dsh-makers-web/<safeSegment(conversationId)>/workspace`, and sends that local path to DSH Host `workspace.create`.

This is not the same physical path or filesystem API surface as the Makers MCP sandbox workspace `projects/<safeSegment(conversationId)>/workspace`.

### 4.4 Conversation/session isolation

The browser stores a `crypto.randomUUID()` and adds it as `makers-conversation-id` to same-origin API/RPC calls. Backend state is keyed by `context.conversation_id`. Current EdgeOne documentation states that different conversations receive physically isolated sandbox instances.

**Result:** no cross-conversation sandbox leakage was confirmed in the supported UUID flow. The material A04 risks are persistence/recovery correctness and the absence of a canonical single workspace filesystem.

## 5. Findings

### A04-01 — Command-created/modified/deleted files are outside the custom snapshot, and native sandbox checkpointing is unused

- **Severity:** P1
- **Status:** CONFIRMED
- **Evidence:** `agents/_workspace.ts` → `writeWorkspaceFile()` calls `saveWorkspaceSnapshotFile()`; `runWorkspaceCommand()` only executes shell text with `cwd: root` and never snapshots/checkpoints. No `context.sandbox.persist()` / `restore()` call appears in the audited workspace flow. `agents/_mcp-bridge.ts` directs dependency installation, builds, tests and diagnostics through `workspace_run_command`. `edgeone.json` sets sandbox timeout to 300 seconds. Official Sandbox docs say unsaved files are not guaranteed across expiry/reclaim/kill.
- **Technical analysis:** The custom snapshot is updated only by `workspace_write_file`. A shell command that creates source, rewrites a lockfile, formats/codegens, moves, or deletes a file does not reconcile `workspaceSnapshot`. A deleted file can remain in the old snapshot and be resurrected; a modified file can roll back; a command-created file can disappear after recycle.
- **Impact:** Silent project rollback/data loss after sandbox recreation.
- **Recommendation:** Use one authoritative whole-workspace checkpoint lifecycle after mutation batches, preferably platform-native sandbox persistence. Treat command mutations/deletions as dirty state; surface persistence failures; do not persist after a failed restore.
- **Dependency / interaction:** A06 command permissions; A09 recycle/recovery tests.

### A04-02 — The 80-file / 2 MiB snapshot silently evicts or omits project files while writes still report success

- **Severity:** P1
- **Status:** CONFIRMED
- **Evidence:** `SNAPSHOT_FILE_LIMIT = 80`, `SNAPSHOT_BYTE_LIMIT = 2 * 1024 * 1024`; `saveWorkspaceSnapshotFile()` sorts by `updatedAt` descending and silently `continue`s entries that exceed limits; `writeWorkspaceFile()` still returns success; restore sees only the bounded metadata. EdgeOne's native sandbox checkpoint documents a 25 MiB archive limit with dependency/build/cache exclusions.
- **Technical analysis:** More than 80 files necessarily drops older entries. The aggregate byte cap can omit files below the count cap. A single direct write over 2 MiB is live but absent from the recovery copy. No completeness manifest, omitted-file list, warning, or durable-state indicator exists.
- **Impact:** A healthy live repository can restore only a subset with no prior warning.
- **Recommendation:** Make checkpoint completeness atomic and explicit. Never report durable recovery when the checkpoint omitted content; preserve the last known-complete checkpoint until a new complete checkpoint succeeds.
- **Dependency / interaction:** Amplified by A04-01, A04-03, A04-04, A04-05.

### A04-03 — `loadWorkspaceSnapshot()` converts every Store read failure into an empty snapshot and can destroy recovery history

- **Severity:** P1
- **Status:** CONFIRMED
- **Evidence:** `loadWorkspaceSnapshot()` catches all exceptions and returns `{}`. `saveWorkspaceSnapshotFile()` then performs read-modify-write of the entire `workspaceSnapshot`. Official Store docs state `updateConversation` shallow-merges metadata but overwrites an identical key.
- **Technical analysis:** Missing conversation, transient Store failure, auth/network error or unexpected schema error are indistinguishable from a legitimate empty snapshot. Restore silently no-ops. More critically, if a read fails but the following metadata update succeeds, the new snapshot is built from `{}` plus the current file and replaces the old `workspaceSnapshot` key.
- **Impact:** A transient read-side error can become durable loss of recovery history.
- **Recommendation:** Distinguish `not_found` from transient/system failures. Do not overwrite a prior checkpoint after an untrusted/failed load. Use versioned/atomic checkpoint semantics and fail the durability step closed.
- **Dependency / interaction:** A04-02/A04-05; A09 should test read-failure-then-write-success.

### A04-04 — Any top-level non-`preview` entry suppresses restore; restore is not transactional or retry-safe

- **Severity:** P1
- **Status:** CONFIRMED
- **Evidence:** `workspaceHasFiles()` runs `find . -mindepth 1 -maxdepth 1 ! -name preview -print -quit`; `restoreWorkspaceSnapshot()` immediately returns if this is true; restore writes entries sequentially with no staging/completion marker/rollback.
- **Technical analysis:** A single top-level artifact other than `preview` blocks recovery, including a partial source file, empty directory, cache/build dir, `.git`, or junk. The guard is not aligned with `listWorkspace()` ignore rules. If restore fails after writing one file, the next `ensureWorkspace()` sees a non-empty root and skips retry.
- **Impact:** A valid snapshot can exist yet never be applied, or only a prefix can be restored.
- **Recommendation:** Use an explicit restore state/generation. Restore into a clean/staging target and mark ready only after validation; retry failed restores rather than inferring validity from non-emptiness.
- **Dependency / interaction:** A04-01/A04-03.

### A04-05 — Concurrent `workspace_write_file` calls can lose persisted updates through last-writer-wins snapshot replacement

- **Severity:** P1
- **Status:** CONFIRMED
- **Evidence:** `saveWorkspaceSnapshotFile()` reads the entire snapshot, changes one path, then writes the entire object. No mutex, queue, version, compare-and-swap, transaction, or conflict retry exists. EdgeOne Store docs say identical metadata keys are overwritten.
- **Technical analysis:** Two calls can both read S, produce S+A and S+B, then write the same `workspaceSnapshot` key. The later update overwrites the earlier one even if both physical sandbox writes succeeded. Millisecond timestamps also lack a deterministic tie-breaker near eviction boundaries.
- **Impact:** Live workspace correct, recovery copy incomplete; loss appears after recycle.
- **Recommendation:** Serialize checkpoint commits per conversation or use one atomic workspace checkpoint. If metadata remains, add generation/version validation and retry.
- **Dependency / interaction:** A04-02/A04-03; A09 concurrency tests.

### A04-06 — Filesystem confinement is lexical for file APIs and absent for shell commands; symlink target enforcement is not established

- **Severity:** P2
- **Status:** INFERRED
- **Evidence:** `normalizeWorkspacePath()` rejects literal absolute/`.`/`..` paths and converts backslashes before checking; existing tests cover `../secret` and `/tmp/file`. Percent-encoded `%2e%2e` is not decoded by this helper. `runWorkspaceCommand()` only sets `cwd`. `listWorkspace()` accepts `find` kind `l` and maps every non-directory to `type: 'file'`. `readWorkspaceFile()` / `writeWorkspaceFile()` do not call `lstat`, `realpath`, or enforce post-resolution root containment. EdgeOne docs state conversation sandboxes are physically isolated.
- **Technical analysis:** Direct file paths have useful lexical traversal defenses. The workspace root is not a canonical filesystem boundary: an authorized shell can write `..`, absolute same-sandbox paths or create symlinks. Whether `context.sandbox.files.read/write` follows a symlink outside the requested root is **NOT VERIFIED**. No evidence supports cross-conversation escape because platform sandbox isolation is separate.
- **Impact:** Potential same-sandbox project-root escape/semantic mismatch; cross-conversation impact not established.
- **Recommendation:** Decide whether commands are whole-sandbox or workspace-root authority. If root confinement is required, enforce canonical post-resolution containment and an explicit symlink policy; keep shell escalation in the permission layer rather than relying on `cwd`.
- **Dependency / interaction:** A06 permissions; A03 trust boundary.

### A04-07 — DSH Host and Makers MCP use two distinct physical workspace layers with no synchronization in audited code

- **Severity:** P2
- **Status:** CONFIRMED
- **Evidence:** `workspaceRoot()` uses `projects/<safe id>/workspace` via `context.sandbox`; `dshHomeFor()` uses `/tmp/dsh-makers-web/<safe id>`; `startSidecar()` creates `<DSH_HOME>/workspace` and calls DSH Host `workspace.create` with it. No copy/mount/bind/synchronization was found.
- **Technical analysis:** DSH Web/Host workspace state and files manipulated by Makers MCP are rooted in different filesystem surfaces. The sidecar is runtime-local under `/tmp`; the coding project is in the per-conversation EdgeOne sandbox. The extent to which upstream DSH treats its local workspace as logical session grouping versus direct file semantics is **NOT VERIFIED**.
- **Impact:** Risk of semantic drift and split recovery policy: UI/session APIs may reference one path while coding tools mutate another.
- **Recommendation:** Establish/document one canonical project filesystem. If DSH local workspace is intentionally logical-only, make that contract explicit; if physical file semantics are required, bridge to the Makers sandbox.
- **Dependency / interaction:** A02 runtime architecture; A10 Workspace UI semantics.

### A04-08 — Preview persistence metadata can outlive the preview process and URL after sandbox recycle

- **Severity:** P2
- **Status:** CONFIRMED
- **Evidence:** `publishWorkspacePreview()` starts the preview process in the sandbox, logs to `/tmp/dsh-preview.log`, creates a top-level `preview` symlink for static serving, and stores `preview: { published: true, framework, updatedAt }` in conversation metadata. `currentPreview()` trusts that durable flag and can synthesize a URL without checking port 3000. Official Sandbox docs say running processes, temporary state and preview URLs are not guaranteed to persist and must be restarted/refreshed after restore; Vibe Coding docs say preview addresses expire when the sandbox is reclaimed.
- **Technical analysis:** Durable metadata and ephemeral process state have different lifetimes. After recycle, metadata can still say `published: true` although no service is listening. The log is outside the project root and is ephemeral.
- **Impact:** Stale “published” state/non-working preview URL and lost diagnostics after lifecycle transition.
- **Recommendation:** Tie preview state to sandbox instance identity/health. Mark stale on recreation and restart the service to obtain a new URL; persist source, not process state.
- **Dependency / interaction:** A12 black-box preview/recycle; A09 recovery tests.

### A04-09 — Workspace listing and text preview silently omit/flatten filesystem information

- **Severity:** P3
- **Status:** CONFIRMED
- **Evidence:** `listWorkspace()` uses max depth 6 and `.slice(0, 400)` without returning a listing-truncated flag; top-level ignore pruning does not necessarily prune nested ignored directories during traversal; symlink kind `l` is returned as generic `file`; `readWorkspaceFile()` decodes as UTF-8 and truncates visible content at 512 KiB of bytes with no binary indicator.
- **Technical analysis:** Deep files and entries beyond 400 can disappear from the view without completeness metadata. Symlinks are flattened into files, binary files are treated as text, and a byte cut can fall inside a multibyte UTF-8 code point, causing a replacement character in the preview while stored data remains unchanged.
- **Impact:** Observability/UX risk that can mislead agent/user decisions but does not itself mutate files.
- **Recommendation:** Return explicit listing/preview completeness metadata, expose file/symlink type and binary state, and align ignore pruning at any depth.
- **Dependency / interaction:** A10 file-tree UI.

## 6. Required Questions — Direct Answers

1. **Can traversal occur through encoding, backslashes, symlinks, or shell-induced paths?**  
   - Literal absolute paths and `..`: **CONFIRMED rejected** by direct file helper.  
   - Backslashes: **CONFIRMED normalized** before checks.  
   - `%2e%2e`: **CONFIRMED not decoded by this helper**; full alternate upstream decoding is **NOT VERIFIED**.  
   - Shell paths: **CONFIRMED possible within the same sandbox** because `workspace_run_command` only sets `cwd`.  
   - Symlink escape: **INFERRED risk / NOT VERIFIED runtime behavior**; no canonical root check exists, but `context.sandbox.files` symlink-follow semantics were not destructively tested.  
   - Cross-conversation traversal: **not confirmed**; platform docs state physical sandbox isolation.

2. **Does the snapshot cover files generated by `workspace_run_command`?**  
   **No — CONFIRMED.** Only `writeWorkspaceFile()` updates the custom snapshot.

3. **Can 80-file / 2 MiB limits cause silent partial restore?**  
   **Yes — CONFIRMED.** Entries are skipped/evicted without a durability warning, and restore can only recreate retained entries.

4. **Can concurrent writes cause last-write-wins/lost-update?**  
   **Yes — CONFIRMED at algorithm level.** Each writer replaces the whole same metadata key. Production load reproduction is **NOT VERIFIED**.

5. **Impact of `loadWorkspaceSnapshot()` swallowing errors?**  
   **CONFIRMED material.** Restore can silently do nothing; a later successful save after a failed load can replace the old snapshot with only the current file.

6. **Can `workspaceHasFiles()` skip restore because of junk/partial state?**  
   **Yes — CONFIRMED.** Any top-level entry except exactly `preview` suppresses restore.

7. **Are workspace root and DSH `$DSH_HOME` workspace the same physical workspace?**  
   **No; two layers — CONFIRMED.** Makers MCP uses EdgeOne sandbox `projects/<id>/workspace`; DSH Host uses sidecar-local `/tmp/dsh-makers-web/<id>/workspace`, with no synchronization found.

## 7. Test Matrix

| Check | Result | Status | Evidence / note |
|---|---|---|---|
| Canonical `main` SHA | `70119cfdae992a203a5e29eb24e91c7200222a7c` | CONFIRMED | GitHub branch API |
| Direct `../` / absolute rejection | Rejected | CONFIRMED | helper + existing unit tests |
| Backslash traversal form | Normalized then validated | CONFIRMED | `normalizeWorkspacePath` |
| Percent-encoded traversal | Literal at helper layer | CONFIRMED | alternate upstream decoding NOT VERIFIED |
| Symlink handling | Listed as file; no canonical containment | CONFIRMED | actual sandbox-files symlink following NOT VERIFIED |
| Command path confinement | `cwd` only | CONFIRMED | `runWorkspaceCommand` |
| Direct write persistence | Custom snapshot attempted | CONFIRMED | `writeWorkspaceFile` |
| Command mutation persistence | Not snapshotted | CONFIRMED | `runWorkspaceCommand` |
| Native sandbox checkpoint usage | Absent in audited flow | CONFIRMED | source inspection |
| Snapshot bounds | 80 files / 2 MiB | CONFIRMED | constants/bounding loop |
| Restore on junk/non-empty root | Skipped | CONFIRMED | `workspaceHasFiles` |
| Store read failure handling | Returns empty snapshot | CONFIRMED | `loadWorkspaceSnapshot` |
| Concurrent snapshot safety | No lock/version/CAS | CONFIRMED | source + Store same-key overwrite semantics |
| Sandbox isolation by conversation | Physical isolation documented | CONFIRMED | EdgeOne docs |
| Client conversation ID | UUID | CONFIRMED | `index.html` |
| DSH vs Makers workspace | Two roots | CONFIRMED | sidecar vs workspace helper |
| Preview survives recycle | Process/URL not guaranteed | CONFIRMED platform semantics | source + official docs |
| Existing tests cover limits/recycle/concurrency/symlinks | No | CONFIRMED | static test inspection |
| Full repository test suite executed here | No | NOT VERIFIED | no local checkout; no PASS claimed |
| Production destructive/recycle smoke | Not performed | NOT VERIFIED | audit policy forbids production test files/mutations |
| Production URL maps to exact base SHA | Not established in A04 | NOT VERIFIED | deployment provenance not gathered |

## 8. Good Controls Already Present

- Direct file APIs reject absolute paths, NUL, empty components, `.` and `..` components.
- Backslashes are normalized before path validation.
- Normal browser flow generates a UUID conversation ID and sends it consistently.
- EdgeOne sandbox ownership is keyed to `conversation_id`; official docs state different conversations are physically isolated.
- Conversation bootstrap handles missing conversation before metadata writes.
- Snapshot ordering attempts to retain recently updated files first.
- `readWorkspaceFile()` reports full byte size and whether its visible preview was truncated.
- Settings YAML has a separate Store persistence path and tests; separate metadata keys are retained by shallow-merge semantics.

These controls are **not** a global PASS because they do not provide a complete, atomic, recoverable project checkpoint.

## 9. Recommendations & Remediation Order

No fix is implemented by this audit. Recommended follow-up order:

1. **P1:** establish one authoritative workspace checkpoint/recovery lifecycle: restore before use on a new sandbox and persist complete source state after successful mutation batches and before stop/release boundaries.
2. **P1:** eliminate silent partial durability; distinguish live-write success from durable-checkpoint success and preserve the last known-complete checkpoint.
3. **P1:** make restore atomic/retryable; do not infer validity from directory non-emptiness and do not overwrite a known-good checkpoint after failed restore.
4. **P1:** serialize or version checkpoint commits to eliminate lost updates.
5. **P2:** define filesystem authority for shell commands, canonical paths, and symlink policy.
6. **P2:** reconcile/document DSH local workspace versus Makers project filesystem.
7. **P2:** make preview instance-scoped and restart it after restore/recycle.
8. **P3:** expose file-tree/preview truncation, symlink/file type, binary state and ignore/depth limits.
9. **Verification:** add deterministic tests for >80 files, >2 MiB, one >2 MiB file, command create/modify/delete, interrupted restore, transient Store read failure, concurrent writes, recycle/restore, preview restart, and symlink behavior.

## 10. Dependencies & Residual Risk

### Cross-audit handoffs

- **A02:** DSH sidecar/Host ownership and local `/tmp/.../workspace` lifecycle.
- **A03:** trust in `makers-conversation-id` and cross-tenant boundary assumptions beyond platform sandbox isolation.
- **A06:** whether commands outside coding root are intentionally authorized and how approval modes communicate authority.
- **A09:** missing regression tests for persistence completeness, races, restore failures, recycle and preview restart.
- **A10:** Workspace/file-tree/preview UI representation of truncation/stale state/two workspace concepts.
- **A12:** non-destructive production verification of recycle/recovery if a safe fixture/environment is later authorized.

### Residual risk

Some runtime semantics require controlled integration testing. Symlink behavior in `context.sandbox.files.*`, exact concurrent Store timing under load, and upstream DSH dependence on its local workspace path were not exercised. They remain `NOT VERIFIED` and are not treated as passing.

## 11. Appendix

### A. Explicit `NOT VERIFIED` items

1. Whether `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/` currently serves a build from exact SHA `70119cfdae992a203a5e29eb24e91c7200222a7c`.
2. Full test-suite execution in this audit environment.
3. End-to-end sandbox recycle/recovery smoke; no production file was created/modified/deleted.
4. Whether `context.sandbox.files.read/write` follows a symlink outside the requested workspace root.
5. Whether any alternate upstream parser URL-decodes `%2e%2e` before the MCP helper; no such decoding was found in the reviewed MCP path.
6. Production concurrency reproduction of the confirmed read-modify-write race.
7. Whether all upstream DSH components use `<DSH_HOME>/workspace` only as logical/session metadata or also directly operate on files there.
8. Abrupt sidecar-runtime termination behavior when graceful `close()` is not invoked.
9. Production preview health after recycle versus retained `published` metadata.

### B. Severity summary

- **P0:** 0
- **P1:** 5 — A04-01 through A04-05
- **P2:** 3 — A04-06 through A04-08
- **P3:** 1 — A04-09

### C. Final audit statement

At base SHA `70119cfdae992a203a5e29eb24e91c7200222a7c`, the workspace has useful per-conversation sandbox isolation and direct-path lexical checks, but the custom metadata snapshot is not a complete or atomic persistence mechanism for a coding workspace. Command mutations are outside snapshot coverage, bounded snapshots silently omit data, restore can be suppressed by partial state, Store errors can collapse recovery history, and concurrent writers can lose persisted updates. **A04 verdict is FAIL** until these persistence/recovery semantics are redesigned and verified under sandbox recreation.
