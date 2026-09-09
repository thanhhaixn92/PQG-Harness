# Chatbox Agent + Task Module Remediation Plan

> Tracking: #110. Audit: `docs/audit/2026-09-09-chatbox-agent-task-module-audit.md`.

## Goal

Sửa các lỗi Chatbox/Support Agent và module Công việc đã xác nhận sau PR #103/#104 mà không tạo framework/runtime/store hệ thống thứ hai. Tận dụng DSH/Cordis seams hiện hữu, giữ business ownership của Task, và triển khai theo PR nhỏ có regression proof rõ ràng.

## Constraints

- DSH packages hiện pin `0.1.0-rc.6`; kiểm tra API rc.6 trước khi coding.
- Không gộp package-wave DSH upgrade vào các product-fix PR.
- Không làm Shell import Task service/data.
- Không bypass Approval.
- Không disable queue chỉ để che lỗi transcript.
- TDD/focused verification: chỉ chạy test liên quan ở từng PR; full/repository-wide checks chỉ khi required gate/integration cần.
- Generated files phải sửa qua producer (`packages/...`, `scripts/prepare-dsh-web.mjs`, product-layer producer), không patch generated bundle bằng tay.

---

## PR sequence / dependency graph

```text
PR-A #112 raw user prompt + scoped persona/context
       │
       ▼
PR-B #111 DSH-native conversation/queue/tool lifecycle
       │
       ▼
PR-C #113 Task tool views + Task client revalidation
       │
       ├──────────────┐
       ▼              ▼
PR-D #114 data      PR-E #115 UX/lifecycle tests
correctness            │
       │                │
       └───────┬────────┘
               ▼
       Production verification
               │
               ▼
PR-F #116 concurrency investigation/fix only if reproduced
```

# Task 1 — PR-A: raw user message + scoped PQG persona/module context (#112)

## Files

- Modify: `packages/application-shell/src/services.ts`
- Review/modify if contract needs it: `packages/application-shell/src/contracts.ts`
- Modify: `agents/_dsh-web-sidecar.ts`
- Modify only declarative context if needed: `packages/task-module/src/client.tsx`
- Test: `tests/system-services.test.ts`
- Test: `tests/sidecar-settings.test.ts` (or the existing nearest sidecar/preset test file)
- Producer/prepared files only through `npm run prepare:dsh-web` if injection graph/config changes

## Step 1.1 — RED: raw prompt invariant

Add a test around `ShellSystemServices.promptSupport()` / mocked session proving:

```ts
await services.promptSupport('Tạo việc họp lúc 9 giờ', taskContext)
expect(receivedParts).toEqual([{ type: 'text', text: 'Tạo việc họp lúc 9 giờ' }])
expect(receivedText).not.toContain('Bạn là Trợ lý')
expect(receivedText).not.toContain('Yêu cầu của người dùng')
```

Run focused:

```bash
node --experimental-strip-types --test tests/system-services.test.ts
```

Expected: FAIL on current implementation.

## Step 1.2 — Inspect pinned rc.6 prompt seams before implementation

Use installed source/bundle/dependency types for `@deepseek-ai/dsh-system-prompt@0.1.0-rc.6` and preset/persona composition. Verify actual available API/config. Do **not** assume current upstream `master` signatures.

Decision order:

1. agent preset persona row if already shipped in rc.6;
2. scoped `systemPrompt.section/context` if available and mountable in the current sidecar composition;
3. minimal rc.6-compatible preset/config adaptation.

If none exists in rc.6, stop implementation of context injection and document the exact seam gap; do not put context back into user text.

## Step 1.3 — GREEN: move persona to agent scope

Replace generic Makers coding persona in `agents/_dsh-web-sidecar.ts` for the PQG Support session/preset with Vietnamese PQG work-assistant persona while preserving coding/Makers capabilities needed elsewhere only if they share the same preset intentionally. If one preset currently serves both product Support and coding workspace, split **preset composition**, not runtime, so persona is scoped correctly.

Required behavior:

- user text remains raw;
- persona is not rendered as user input;
- support output defaults Vietnamese;
- no claim of successful mutation before tool result;
- no internal Makers/MCP/plugin wording in primary answer.

## Step 1.4 — GREEN: module context is scoped, declarative and disposable

`ShellSupportContext` may keep module title/summary/system instruction as declarative data. Mount it into the active agent/system-prompt scope using the rc.6 seam. When active module changes, previous contribution must dispose/shadow cleanly.

Do not add direct Task data accessor or arbitrary tool callback.

## Step 1.5 — Error localization

Normalize known `no current session`, prompt failure and setup failure to stable error codes/typed errors in services, then map them to `pqgCopy` Vietnamese UI strings. Preserve original cause for logs/tests, not primary UI.

## Step 1.6 — Verify

```bash
node --experimental-strip-types --test tests/system-services.test.ts <nearest-sidecar-test-file>
npm run typecheck
```

Run `npm run build:makers` only if sidecar/Makers packaged output changed; otherwise defer exact Makers build to the PR where sidecar actually changes.

Commit suggestion:

```text
fix(agent): keep support prompts raw and scope PQG context
```

Acceptance: #112.

---

# Task 2 — PR-B: replace manual Support transcript projection with DSH conversation seams (#111)

## Files

- Modify: `packages/application-shell/src/client.tsx`
- Modify only thin adapter if required: `packages/application-shell/src/services.ts`
- Modify dependency injection metadata if required: `packages/application-shell/package.json`
- Modify producer only if graph changes: `scripts/prepare-dsh-web.mjs`
- Test: `tests/application-shell-contract.test.ts`
- Test: add a focused behavior test file, e.g. `tests/support-conversation.test.ts`, if no suitable executable test exists

## Step 2.1 — RED: model current failure cases as data, not source strings

Create deterministic fixtures for these sequences:

1. durable user A → assistant partial A → queued user B;
2. queued B claimed → durable user B without duplicate;
3. assistant tool-call → running → tool-result → final text;
4. tool-call/result with no final assistant text;
5. cancel during partial;
6. prompt error then successful next prompt.

Assertions must verify ordered visible rows and queue separation. Avoid checking only that `snapshot.queue` string appears in source.

Focused command:

```bash
node --experimental-strip-types --test tests/support-conversation.test.ts tests/application-shell-contract.test.ts
```

Expected: at least ordering/tool-lifecycle cases FAIL on current custom renderer.

## Step 2.2 — Inspect rc.6 client UI contract

Before coding inspect actual bundled/pinned exports for:

- `ui-conversation` binding/target/view/queue surfaces;
- `ui-tool` slot/view registration;
- session-scoped conversation service;
- per-session draft/input primitives.

Reuse priority:

1. embed/reuse official target projection + view pieces inside Support panel;
2. if official full shell cannot be nested, consume official target-neutral conversation binding and render through registered Chat/tool nodes;
3. only as last resort write a thin adapter around official projection; never reconstruct raw session events or concatenate compatibility fields.

## Step 2.3 — Remove manual `nodes + queue + partial` concatenation

Delete the custom code path that treats `snapshot.queue` as durable message rows. Queue must render in its own transient area/dock.

Do not manually pair tool calls/results. DSH runtime/UI-tool remains authoritative.

## Step 2.4 — Keep compact PQG Support UX as presentation only

Retain PQG panel/drawer sizing, header, suggestions and compact visual language, but wire them to DSH-owned conversation state.

Behavior requirements:

- current durable conversation is visible;
- partial assistant response appears in correct turn;
- queued next-turn prompt is visually separate;
- queue item does not duplicate when admitted;
- Stop remains `session.cancel()`/DSH service;
- send while running still supports Queue Send semantics.

## Step 2.5 — Draft/session ownership

If rc.6 official conversation input store can be shared by the compact panel, use it. Otherwise create only a presentation-level per-session draft store keyed by sessionId; do not keep one unkeyed `useState` draft across session transitions.

## Step 2.6 — Producer update if needed

If adding `dsh-client-ui-conversation`/`dsh-client-ui-tool` injection to the application-shell plugin graph, update source package declarations / `scripts/prepare-dsh-web.mjs`, then regenerate. Never patch `public/plugins/.../client.js` by hand.

## Step 2.7 — Verify

```bash
node --experimental-strip-types --test tests/support-conversation.test.ts tests/application-shell-contract.test.ts tests/system-services.test.ts
npm run typecheck
```

If plugin graph/producer changed:

```bash
npm run prepare:dsh-web
node --experimental-strip-types --test tests/application-shell-contract.test.ts
```

Commit suggestion:

```text
fix(shell): use DSH conversation lifecycle in support panel
```

Acceptance: #111.

---

# Task 3 — PR-C: Task tool views + shared client revalidation (#113)

## Files

- Modify: `packages/task-module/src/client.tsx`
- Add if needed: `packages/task-module/src/client-store.ts`
- Modify package client inject metadata if DSH tool slot required: `packages/task-module/package.json`
- Modify generic Support only if a slot host is missing: `packages/application-shell/src/client.tsx`
- Producer: `scripts/prepare-dsh-web.mjs` only if graph registration changes
- Test: `tests/task-module.test.ts`
- Test: `tests/support-conversation.test.ts` or a focused integration file

## Step 3.1 — RED: Agent mutation leaves active Task UI stale

Model Task client data source with initial list, then simulate a successful `pqg_task_create`/`pqg_task_update` tool result that writes through server service. Assert active Task subscriber refreshes without remount/reload.

Also test:

- Approval denied → no revalidation-as-success/no data change;
- tool error → no success badge/state;
- repeated same completion event does not cause unbounded refetch.

## Step 3.2 — Introduce Task-owned observable data source

Prefer existing DSH/runtime observable store primitive or `useSyncExternalStore`-compatible source already used in repo. The Task module owns:

- cached current list;
- `refresh()` with in-flight dedupe;
- local UI mutation helpers or invalidate-then-refresh;
- subscriptions.

Do not introduce Redux/Zustand/React Query solely for this module unless already available as an approved repo primitive.

Workspace/Home/search should converge on the same module-owned read source where practical. Search may still fetch on query if contract requires it, but must not become contradictory after a write.

## Step 3.3 — Register Task-specific tool views

Using the rc.6 `ui-tool` keyed slot seam, register views by wire names:

- `pqg_task_list`
- `pqg_task_create`
- `pqg_task_update`

Primary UI examples:

- `Đang đọc danh sách công việc…`
- `Đã tạo công việc: <title>`
- `Đã cập nhật công việc: <title>`
- `Không thể cập nhật công việc.`

Do not display raw input/output JSON as the main row. Details may remain available through generic DSH disclosure if it already exists.

## Step 3.4 — Revalidate exactly on successful write result

Create/update tool view/lifecycle hook calls `taskStore.invalidate()/refresh()` once when successful result becomes durable/observed. Do not parse assistant prose. Do not refetch every token/partial.

If tool-view components should remain pure presentation in rc.6, use a Task-owned tool lifecycle contribution/effect tied to the same DSH call/result event and then render through tool view; preserve ownership.

## Step 3.5 — Verify

```bash
node --experimental-strip-types --test tests/task-module.test.ts tests/support-conversation.test.ts
npm run typecheck
```

If client plugin graph changed:

```bash
npm run prepare:dsh-web
node --experimental-strip-types --test tests/task-module.test.ts tests/application-shell-contract.test.ts
```

Commit suggestion:

```text
fix(task): sync agent writes with task client state
```

Acceptance: #113.

---

# Task 4 — PR-D: Task data correctness and activation resilience (#114)

## Files

- Modify: `packages/task-module/src/service.ts`
- Modify: `packages/task-module/src/makers.ts`
- Modify: `agents/api/pqg.tasks.ts`
- Modify: `packages/task-module/src/client.tsx`
- Add optional shared schema: `packages/task-module/src/schema.ts`
- Test: `tests/task-module.test.ts`
- Test nearest module-policy/lifecycle file only if activation behavior changes

## Step 4.1 — RED: pagination >100

Add Store fake/fixture supporting cursor/page semantics and seed 205 Task records.

Assert:

```ts
expect((await listTasks(ctx)).length).toBe(205)
expect(await updateTask(ctx, idOf205, { status: 'done' })).toMatchObject({ status: 'done' })
```

Current code should fail after first 100.

## Step 4.2 — Implement bounded pagination

Follow exact `context.store.getMessages()` contract available in Makers environment. Requirements:

- continue until no next page / short page / explicit cursor exhaustion;
- stable ascending order;
- dedupe by message/task id defensively only if Store page contract can overlap;
- finite page/record guard to avoid accidental infinite loop;
- no arbitrary 100-record product limit.

Do not load unrelated conversations; keep `TASK_CONVERSATION_ID` scope.

## Step 4.3 — RED: date invariant

Test at service/Makers/API boundaries:

Reject:

- `tomorrow`
- `09/09/2026`
- `2026-02-31`
- malformed values

Accept:

- valid `YYYY-MM-DD`
- `null` for clear on update
- omitted value
- valid leap date.

## Step 4.4 — Centralize Task schema

Create one Task-owned date parser/validator reused by service, Makers adapter and HTTP API. Do calendar validation after structural match. Return stable validation error/code; map API status consistently.

Agent natural language is resolved before tool call. Storage must not guess timezone/locale.

## Step 4.5 — RED: transient policy failure

Test sequence:

1. `/api/pqg.modules` request fails transiently;
2. later policy read succeeds with Task enabled;
3. Task contribution registers once without full page reload;
4. explicit `enabled=false` leaves Task absent/tools disabled.

## Step 4.6 — Harden activation without duplicate registration

Use existing Cordis/module lifecycle/effect semantics. Distinguish:

- explicit disabled → no contribution;
- request unavailable/transient → retry/re-evaluate on existing lifecycle signal/session change with bounded strategy;
- enabled → register exactly once.

Do not invent a second plugin registry.

## Step 4.7 — Verify

```bash
node --experimental-strip-types --test tests/task-module.test.ts <nearest-module-policy-test-file-if-changed>
npm run typecheck
```

Run exact Makers build because Makers schemas/API changed:

```bash
npm run build:makers
```

Commit suggestion:

```text
fix(task): remove data ceiling and enforce task invariants
```

Acceptance: #114.

---

# Task 5 — PR-E: Support UX hardening + lifecycle regression suite + Production gate (#115)

## Files

- Modify: `packages/application-shell/src/client.tsx`
- Modify: `packages/application-shell/src/copy.ts`
- Modify: `packages/application-shell/src/services.ts` only if typed error mapping still needed
- Test: `tests/support-conversation.test.ts`
- Test: `tests/application-shell-contract.test.ts`
- Test: `tests/system-services.test.ts`
- Test: `tests/task-module.test.ts` for cross-module write invalidation case
- Add after deployment: `docs/verification/2026-09-xx-support-agent-task-production.md`

## Step 5.1 — Session-safe composer UX

Use official DSH per-session draft/input state from #111 where available. Otherwise ensure session-keyed draft and cleanup. One session’s unsent text must never silently become another session’s input.

Unify one `usableSession` predicate across:

- Send;
- suggestion buttons;
- Stop;
- error/unavailable state.

## Step 5.2 — Scroll policy

Implement/retain latest-turn auto-scroll only if viewer is near bottom. If the user has scrolled upward to read history, new token/queue updates must not yank viewport.

Test scroll helper separately if practical; do not introduce heavy browser E2E just for arithmetic.

## Step 5.3 — Vietnamese error surface

Add copy for common states:

- no usable session;
- send failed;
- stream/session failed;
- stop failed;
- tool failure;
- module temporarily unavailable.

Primary UI must not expose `MCP`, `Makers`, plugin ids, raw stack traces or English transport text. Keep stable diagnostic code/cause internally.

## Step 5.4 — Lifecycle regression matrix

Executable behavior tests must cover:

- idle → submit → queued → running → partial → complete;
- second prompt queued while running;
- queue claim without duplicate;
- tool-call → Approval allow → result → final;
- Approval deny → data unchanged;
- cancel → stable stopped state → next prompt succeeds;
- prompt/session error → panel remains usable;
- current session switch → transcript/draft scoped correctly;
- Agent Task write → active Task UI reflects data without reload.

Keep source-string tests only for plugin graph/DOM data-hook invariants.

Focused commands:

```bash
node --experimental-strip-types --test \
  tests/support-conversation.test.ts \
  tests/application-shell-contract.test.ts \
  tests/system-services.test.ts \
  tests/task-module.test.ts
npm run typecheck
```

## Step 5.5 — Prepared/generated verification only for affected graph

If any producer/client plugin graph changed during P0/P1:

```bash
npm run prepare:dsh-web
node --experimental-strip-types --test \
  tests/application-shell-contract.test.ts \
  tests/task-module.test.ts
```

Do not run the unrelated full suite merely by habit. Required GitHub `quality` remains mandatory before merge.

## Step 5.6 — Production smoke after deploy

On deployed build, record exact `/build-meta.json` identity first. Then verify desktop and iPad/mobile-sized viewport:

1. fresh load completes; plugin loading does not hang;
2. Home + Task nav/card present;
3. open Support, raw Vietnamese prompt displays exactly as typed;
4. assistant partial/final appears in correct turn;
5. submit a second prompt while first runs; queue separate and ordered;
6. Task list through Agent;
7. Agent create Task → Approval deny → no data change;
8. Agent create Task → Approval allow → active Task UI updates without reload;
9. Agent complete/update Task → UI updates;
10. Stop active run → next prompt works;
11. reload preserves intended durable Task/conversation state;
12. no raw tool JSON/infrastructure jargon as primary UI.

If environment cannot reach Production, write `Không thể xác nhận` with reason and leave gate open. Never infer Production PASS from CI.

Commit suggestion:

```text
test(agent): cover support lifecycle and production gates
```

Acceptance: #115.

---

# Task 6 — PR-F: prove/eliminate Task lost-update risk (#116)

## Files

- Inspect: installed Store types/runtime used by Makers
- Test: `tests/task-module.test.ts`
- Modify only if reproduction fails correctly: `packages/task-module/src/service.ts`

## Step 6.1 — Inspect Store write semantics

Determine whether `updateMessage()` exposes/implements any of:

- version/revision;
- ETag/CAS;
- transaction;
- serialized write guarantee.

Document exact evidence in issue #116.

## Step 6.2 — Write concurrency test before any lock

Two writers start from same initial Task:

- A changes `status`;
- B changes `title`.

Run concurrently/interleaved so stale read is possible. Assert final record contains both independent changes if product semantics require patch merge.

## Step 6.3 — Branch on evidence

- If Store already protects updates and test passes: keep test, close #116 as risk eliminated.
- If lost update reproduces and CAS exists: implement bounded CAS retry on latest record.
- If lost update reproduces and no CAS exists: minimal Task/taskId-scoped serialization or latest-read merge immediately before write; no global lock framework.

## Step 6.4 — Verify

```bash
node --experimental-strip-types --test tests/task-module.test.ts
npm run typecheck
```

Commit only if code change is needed:

```text
fix(task): prevent concurrent task patch loss
```

Acceptance: #116.

---

# Merge strategy

Recommended merge order: #112 → #111 → #113 → #114 → #115. #116 can run after #114 unless a concurrency reproduction blocks earlier correctness.

Each PR body must include:

- issue number;
- root cause addressed;
- exact RED test/reproduction;
- focused GREEN commands actually run;
- generated/producer impact;
- explicit “DSH dependency upgrade: none” unless it is a dedicated package-wave PR;
- Production gate status (`pending`, `PASS with build identity`, or `Không thể xác nhận`).

Do not merge a PR solely because source/string tests are green when its acceptance requires runtime lifecycle behavior.

# Definition of Done for master #110

- [ ] #112 raw user text + scoped persona/module context
- [ ] #111 DSH-native conversation/queue/tool lifecycle
- [ ] #113 Task tool outcome visible + Agent write revalidation
- [ ] #114 no 100-record ceiling + valid date invariant + resilient module activation
- [ ] #115 lifecycle regression suite + Vietnamese UX + Production desktop/iPad evidence
- [ ] #116 concurrency risk proved safe or fixed
- [ ] required GitHub `quality` checks green on every merged implementation PR
- [ ] Production verification records exact deployed build identity; no source-only inference
