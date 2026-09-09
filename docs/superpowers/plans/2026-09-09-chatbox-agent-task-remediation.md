# Chatbox Agent + Task Remediation Implementation Plan

> **Execution rule:** triển khai reuse-first trên DSH/Cordis/MCP/EdgeOne Makers hiện có. Không thêm agent framework, permission engine, session backend hoặc Task database thứ hai. Mỗi phase phải có focused test trước khi chạy gate tích hợp; không chạy full suite sau từng chỉnh sửa nhỏ.

**Goal:** đưa Chatbox/Support Agent và mô-đun Công việc về trạng thái MVP dùng được: chat không tự bung, phản hồi tiếng Việt ổn định, session tự recovery, transcript/tool action hiển thị đúng, Agent tạo/cập nhật Task thật, Task UI phản ánh ngay dữ liệu, và không mất task khi vượt 100 bản ghi.

**Baseline:** `main@e945004d1c8484f7c58b0755d0ee126371bd9981`.

**Audit:** `docs/audit/2026-09-09-chatbox-agent-task-audit.md`.

---

## A. Nguyên tắc kiến trúc khóa trước khi code

1. **Conversation ownership:** DSH runtime + `ui-conversation`/target view là nguồn chuẩn cho transcript/replay/streaming ordering. Product Shell không trực tiếp ghép `snapshot.nodes`, `snapshot.chat.legacy.nodes`, `queue`, `partial` thành một transcript riêng nếu seam native rc.6 có thể reuse.
2. **Tool ownership:** dùng `ui-tool`/tool-view seam của DSH cho call/result/running/error. Task plugin chỉ đăng ký view/lifecycle cho `pqg_task_*`, không tự pair call/result.
3. **Session ownership:** dùng `ISessions` + `IWorkspaces`; bounded recovery. Không tạo Support session store thứ hai.
4. **Business ownership:** `packages/task-module/src/service.ts` là authoritative Task service. Home/Search/Support/UI không sở hữu database riêng.
5. **Prompt ownership:** user message phải giữ nguyên văn. Persona, language policy và dynamic context phải đi qua runtime/system/persona seam; không nhét internal instruction vào user bubble.
6. **Store correctness:** tôn trọng EdgeOne Store page limit 100 và distributed runtime semantics. Không coi in-process mutex là distributed atomicity.
7. **Generated artifacts:** chỉ sửa source; chạy `npm run prepare:dsh-web` để regenerate `public/plugins/*`, `index.html`, API route artifacts. Không hand-edit generated bundle.

---

# Phase 0 — Chặn merge sai và ổn định integration base

## Task 0.1 — Không merge PR #107 nguyên trạng

**Files/PR:** PR #107; `packages/application-shell/src/client.tsx`; `packages/application-shell/src/services.ts`; `tests/task-module.test.ts`; `tests/system-services.test.ts`.

### Steps

1. Giữ phần `IWorkspaces.connectWorkspace()` + bounded retry của #107 như candidate patch.
2. Bỏ/không merge phần đổi transcript carrier sang `snapshot.chat.legacy.nodes`; transcript sẽ xử lý ở Phase 1.
3. Sửa integration fixture trong `tests/task-module.test.ts` để Application Shell có dependency `workspaces` đúng runtime contract.
4. Nếu runtime thực tế luôn inject `workspaces`, **ưu tiên sửa test fixture**, không làm dependency optional chỉ để test xanh.
5. Thay `.includes('not found')` bằng helper duy nhất, ví dụ `isMissingSupportSessionError(error)`. Trước tiên kiểm tra rc.6 có stable error code/type hay không; nếu có dùng code/type. Chỉ fallback exact message matcher khi không có API ổn định.

### Focused tests

- `node --experimental-strip-types --test tests/system-services.test.ts tests/task-module.test.ts`
- Cases mới:
  - missing Host session => reconnect + retry đúng 1 lần;
  - non-session error có chữ tương tự nhưng khác code => không retry;
  - replacement prompt fail => surface exact product-safe error;
  - Task slots vẫn register khi không có active DSH session.

### Commit

`fix: stabilize Support session recovery integration`

### Exit

- PR #107 hoặc PR thay thế không còn raw transcript change.
- Focused tests xanh.
- Full quality chưa cần chạy cho đến Phase 2 integration boundary nếu các phase được gom cùng integration branch; **nhưng tuyệt đối không merge vào `main` khi current quality đỏ**.

---

# Phase 1 — Thay manual transcript bằng DSH native conversation/tool seams

## Task 1.1 — Compatibility spike trên DSH rc.6

**Inspect only first:**

- `node_modules/@deepseek-ai/dsh-client-*` sau `npm ci`/`prepare:dsh-web`;
- generated client plugin graph;
- `packages/application-shell/src/client.tsx`.

### Steps

1. Xác định package/export/slot thực tế của rc.6 tương ứng với:
   - active Conversation view / Chat target;
   - message/stream rendering;
   - tool call/result renderer;
   - composer/input orchestration nếu reuse được.
2. Viết một focused contract test chứng minh seam rc.6 có thể render/replay:
   - user text;
   - assistant text;
   - streaming partial;
   - one tool call + result.
3. Không dùng API chỉ có trên upstream `master` nếu rc.6 không export.
4. Nếu rc.6 không expose full native React surface để embed trực tiếp, tạo **một version-locked adapter module nhỏ** ở Application Shell, chịu trách nhiệm chuyển native rc.6 view model sang PQG presentation. Chỉ adapter đó được biết shape rc.6; `SupportContent` không được biết raw snapshot internals.

### Proposed file if needed

`packages/application-shell/src/support-conversation-adapter.ts`

### Test

`tests/application-shell-contract.test.ts` hoặc file mới `tests/support-conversation.test.ts` nếu runtime fixture đủ lớn để xứng đáng tách file.

### Commit

`test: lock Support conversation seam to DSH rc6`

## Task 1.2 — Render transcript/tool lifecycle qua seam native

**Modify:** `packages/application-shell/src/client.tsx` and adapter from Task 1.1 if needed.

### Steps

1. Xóa logic product-level tự duyệt `snapshot.nodes`/`snapshot.chat.legacy.nodes` để build durable transcript.
2. Xóa logic tự append queue/partial vào cùng array nếu native Conversation view đã chịu trách nhiệm.
3. Embed/reuse native Chat view hoặc adapter output trong `SupportContent`.
4. Reuse tool renderer để `pqg_task_list/create/update/delete` có trạng thái:
   - đang thực hiện;
   - thành công;
   - lỗi;
   - tên action thân thiện tiếng Việt ở Task-specific atomic view nếu rc.6 hỗ trợ registration.
5. Generic tool vẫn dùng upstream fallback, không clone generic tool card.

### Regression tests

- transcript không duplicate queue + durable user turn;
- partial biến thành final mà không tạo hai assistant bubbles;
- tool-only step có visible progress/result;
- reload/reconnect replay giữ ordering.

### Commit

`refactor: reuse DSH conversation and tool presentation`

---

# Phase 2 — Persona tiếng Việt và prompt semantics đúng

## Task 2.1 — Đưa PQG Support persona xuống runtime layer

**Modify:** `agents/_dsh-web-sidecar.ts`.

### Steps

1. Tách coding-agent persona hiện tại thành capability/runtime instruction và product persona.
2. Product persona tối thiểu:
   - trả lời tiếng Việt mặc định;
   - vai trò trợ lý văn phòng của PQG Harness;
   - khi intent thuộc module có Makers tools, ưu tiên gọi tool chính thức;
   - không tuyên bố tạo/cập nhật thành công nếu chưa nhận tool success;
   - thiếu field bắt buộc thì hỏi một câu ngắn gọn;
   - không hướng dẫn người dùng tự thao tác nếu Agent có tool phù hợp và được phép gọi.
3. Giữ Makers sandbox safety/permission instructions hiện hữu; không xóa các invariant bảo vệ sandbox.
4. Không đưa module-specific business data vào static persona.

### Test

Add source/config contract in `tests/dsh-web.test.ts` or closest sidecar config test:

- persona contains Vietnamese product behavior;
- Makers safety/tool permission instructions vẫn còn;
- no second provider/runtime introduced.

### Commit

`fix: give Support Agent a Vietnamese product persona`

## Task 2.2 — Giữ nguyên user message và đưa dynamic module context đúng layer

**Modify:** `packages/application-shell/src/services.ts`, possibly `contracts.ts`, sidecar/request adapter only if needed by rc.6 seam.

### Steps

1. `promptSupport(value, context)` không được ghép internal paragraph vào `value` rồi gửi như user content.
2. User content gửi vào conversation phải bằng đúng `value.trim()`.
3. Dynamic context (`title`, `summary`, allowed capability hints) đi qua:
   - preferred: DSH system/persona/request-context extension seam;
   - fallback: a dedicated non-user-visible model request adapter validated against rc.6.
4. Context Task không được chứa một bản sao business state lớn; chỉ capability/active-module context.
5. Add test snapshot/receipt assertion: user turn text bằng chính text người dùng nhập.

### Focused tests

`tests/system-services.test.ts`:

- Home/global Support uses Vietnamese product policy from runtime, không cần fake wrapper;
- Task context does not alter user message text;
- missing title for create results in follow-up question behavior contract at Agent smoke layer.

### Commit

`refactor: separate Support context from user prompts`

---

# Phase 3 — Session lifecycle hoàn chỉnh

## Task 3.1 — `ensureSupportSession()` và single-flight recovery

**Modify:** `packages/application-shell/src/services.ts`; `packages/application-shell/src/client.tsx` injection if required.

### Steps

1. `createShellSystemServices(sessions, workspaces)` owns one helper `ensureSupportSession()`.
2. Cases:
   - current binding usable => return it;
   - current id exists nhưng Host missing => reconnect workspace, open replacement, return replacement;
   - no current id => choose/connect the existing current product workspace using native DSH workspace contract; do not invent a parallel hidden workspace;
   - no usable workspace => return product-safe unavailable state with retry action.
3. Guard reconnect with one in-flight promise so two quick sends do not create two replacement sessions.
4. Retry the original prompt at most once after recovery.
5. `subscribeSupport()` rebinds after session replacement.
6. `stopSupport()` targets replacement current session, not stale binding.

### Tests

`tests/system-services.test.ts`:

- no current session;
- stale current session;
- two simultaneous recovery callers share one reconnect;
- current session works: zero reconnect;
- non-recoverable error: zero retry;
- Stop after recovery cancels replacement session.

### Commit

`fix: make Support session lifecycle self-healing`

---

# Phase 4 — Chatbox UX state và approval visibility

## Task 4.1 — Không tự bung chatbox

**Modify:** `packages/application-shell/src/client.tsx`, `tokens.ts` only if layout widths need adjustment.

### Recommended product behavior

- Initial Support state = `collapsed` ở mọi viewport.
- User bấm nút `Trợ lý` => mở **expanded usable chat** ngay; không mở compact-first.
- `compact` chỉ là trạng thái người dùng chủ động chọn `Thu gọn`, không phải default/open target.
- Mobile/iPad dùng Drawer nhưng vẫn single-click to usable composer.

### Tests

`tests/application-shell-contract.test.ts`:

- desktop 1600 initial collapsed;
- 1366 initial collapsed;
- iPad 1024 initial collapsed;
- one header action => expanded;
- compact only via explicit compact control.

### Commit

`fix: keep Support collapsed until user opens it`

## Task 4.2 — Approval CTA trong Support

**Modify:** `packages/application-shell/src/client.tsx` using existing `services.currentApproval()`; no new permission engine.

### Steps

1. Khi current run có pending approval, chatbox hiện một status row: `Đang chờ bạn phê duyệt`.
2. CTA `Mở Phê duyệt` gọi existing navigation target `approval`.
3. Khi approval settled, status tự biến mất nhờ existing subscription.
4. Không auto-approve từ chatbox.

### Tests

- pending approval visible;
- CTA navigates existing approval surface;
- no duplicate approval state/store.

### Commit

`feat: surface pending approval in Support`

---

# Phase 5 — Task Store correctness: pagination và validation

## Task 5.1 — Cursor pagination đầy đủ

**Modify:** `packages/task-module/src/service.ts`.

### Implementation

Replace one-shot `taskMessages()` with bounded cursor loop:

1. request `limit: 100`, `order: 'asc'`;
2. append page;
3. if page `< 100`, stop;
4. else set `after` = last `messageId` and fetch next page;
5. reject/stop defensively if last id missing or cursor does not advance;
6. respect platform conversation max rather than an arbitrary 100 item product cap.

If the exact Store runtime returns explicit cursor metadata instead of raw array in deployed SDK, adapt to the **actual installed API contract**. Do not assume docs shape when local/runtime type differs.

### Tests

`tests/task-module.test.ts`:

- 0 tasks;
- 1 task;
- exactly 100;
- 101;
- 250;
- `updateTask` finds and updates task index 101/250;
- malformed page without advancing cursor fails safely, not infinite loop.

### Commit

`fix: paginate Task store beyond 100 records`

## Task 5.2 — Shared validation schema

**Modify:** `packages/task-module/src/service.ts`, `packages/task-module/src/makers.ts`, `agents/api/pqg.tasks.ts`.

**Recommended new file:** `packages/task-module/src/schema.ts`.

### Schema

- `title`: trim, 1..500 Unicode chars;
- `dueDate`: `YYYY-MM-DD` and calendar-valid, nullable only for update clearing;
- `completed`: boolean;
- `id`: non-empty Store message id string.

### Steps

1. Define schema/normalizers once.
2. Service is final validation authority.
3. API maps validation errors to stable 400 product-safe code.
4. Makers `inputSchema` reuses the same schema or schema-derived field definitions rather than drifting.
5. UI displays returned validation error without inventing a second rule set.

### Tests

- whitespace title reject;
- title >500 reject;
- `2026-09-09` accept;
- `2026-02-30`, `tomorrow`, `2026-99-99` reject;
- clearing dueDate works.

### Commit

`fix: validate Task input consistently`

---

# Phase 6 — Task activation và client state đồng bộ

## Task 6.1 — Bỏ activation fail-silent

**Modify:** `packages/task-module/src/client.tsx`; possibly module catalog/service contract if a reactive enabled-state source already exists.

### Preferred implementation order

1. **Reuse existing module policy/catalog observable nếu có trong prepared client graph.** Task contribution should react to installed+enabled state instead of doing its own one-shot HTTP probe.
2. Nếu rc.6/product layer chưa expose reactive catalog, add a small shared Shell module-state service rather than each module polling separately.
3. Temporary fallback only: retry `/api/pqg.modules` with bounded exponential backoff and visible unavailable state; do not silently return forever.

### Required behavior

- transient failure does not permanently remove Task until full reload;
- disabled policy does not register Task slots;
- enable/disable updates navigation predictably through existing reload/policy flow until reactive lifecycle is available.

### Tests

- first module-state GET fails, second succeeds => Task registers;
- explicit disabled => no Task slots;
- persistent error => visible diagnostic/retry, not fake absence.

### Commit

`fix: make Task activation resilient`

## Task 6.2 — One shared client resource for Task surfaces

**New file recommended:** `packages/task-module/src/client-store.ts`.

**Modify:** `packages/task-module/src/client.tsx`.

### Responsibilities

- cache one current task list;
- `subscribe()` / immutable snapshot;
- `load/revalidate()` single-flight;
- mutation helpers call existing `/api/pqg.tasks`, then update or invalidate the same cache;
- expose loading/error/lastUpdated states.

### Consumers

- Task Workspace;
- Task Home widget;
- Task Search provider;
- Task-specific tool success hook/invalidation.

No new server database or Redux-like global dependency is required.

### Agent mutation invalidation — preferred path

1. If rc.6 `ui-tool` allows business atomic tool-view registration/lifecycle callbacks, register Task views for `pqg_task_*` and invalidate `client-store` on successful settled result.
2. If no lifecycle callback seam exists in rc.6, fallback to revalidate when Support run transitions `running -> idle`, scoped to installed Task module; document this as compatibility bridge.
3. Do not add blind permanent polling.

### Tests

- create in Workspace updates Home and Search source;
- Agent tool success invalidates/reloads once;
- failed Agent tool does not claim local mutation;
- two consumers share one in-flight load.

### Commit

`refactor: share Task client resource across surfaces`

## Task 6.3 — Home error state đúng

**Modify:** Task Home widget in `client.tsx` using shared store.

### Behavior

- loading => `Đang tải…`;
- success empty => `Không có việc đến hạn hôm nay.`;
- error => `Không thể tải công việc` + `Thử lại`;
- never map error to `0 việc`.

### Test

Explicit rejected fetch case.

### Commit

`fix: distinguish Task Home errors from empty state`

---

# Phase 7 — Task update concurrency design

## Task 7.1 — Verify Store atomic capability before choosing storage mutation model

**Research/inspect installed Makers API first.** Do not write locking code before this spike.

### Decision tree

1. If deployed Store exposes CAS/version/conditional update on message: use it with retry-on-conflict and explicit version.
2. If no CAS/transaction exists:
   - do **not** rely on process mutex as correctness mechanism;
   - migrate Task mutations to append-only patch events (create snapshot + field-level update events) or another EdgeOne primitive with documented atomic merge semantics;
   - fold events through the same paginated Task service;
   - keep backward reader for current `pqg-task` snapshot messages during migration.

### Required test

Simulate two concurrent patches from same base:

- patch A: `completed=true`;
- patch B: `dueDate=2026-09-10`;
- final task must contain both changes.

### Commit

`fix: prevent concurrent Task field loss`

> If concurrency model migration materially expands MVP risk, this task may ship immediately after the P0/P1 functional release **only if** the product is temporarily constrained to serialized single-actor writes and the limitation is explicitly documented. Because Agent + UI are already two actors, do not silently close this finding.

---

# Phase 8 — Delete semantics / MVP contract cleanup

## Task 8.1 — Resolve #78 CRUD ambiguity

**Decision recommended:** add delete so CRUD has conventional meaning.

**Modify:**

- `packages/task-module/src/service.ts` — `deleteTask`;
- `agents/api/pqg.tasks.ts` — `DELETE` or explicit operation route consistent with existing API conventions;
- `packages/task-module/src/makers.ts` — `pqg_task_delete`;
- `packages/task-module/src/client.tsx` — delete action with confirmation only if product UX requires it;
- tests.

### Permission

Delete is materially destructive: map it to an existing DSH approval/permission mode appropriate for destructive module mutation. Do not create a new approval system.

### Commit

`feat: complete Task CRUD with delete`

If product owner explicitly decides MVP excludes delete, update #78 acceptance wording to `create/edit/complete` and do not claim full CRUD.

---

# Phase 9 — Module adapter diagnostics

## Task 9.1 — Keep failure isolation but expose evidence

**Modify:** `agents/_module-adapters.ts`; relevant module adapter tests.

### Steps

1. Keep `try/catch` so one broken module adapter does not kill Makers core tools.
2. On failure, structured log with:
   - stable event code;
   - module id;
   - phase `resolve/import/apply` if distinguishable;
   - sanitized error class/message (no secrets/tokens).
3. Continue `bridge.removeModule(module.id)` rollback.
4. Optional: expose read-only diagnostic summary through existing operator diagnostics surface if one already exists; do not create a parallel monitoring product just for this.

### Test

Broken Task adapter => core Makers tools still present + structured diagnostic emitted + Task tools absent.

### Commit

`fix: diagnose failed Makers module adapters`

---

# Phase 10 — Focused integration test: Agent → Task tool → Store → UI

## Task 10.1 — Build one real product-path integration test

**Prefer existing DSH test harness; do not introduce Playwright solely for this unless repository already has browser E2E infrastructure or DOM interaction cannot be covered otherwise.**

### Scenario

1. Shell + Task module active.
2. Support receives user message `Tạo công việc Hoàn thiện báo cáo tuần, hạn 2026-09-10`.
3. Agent path invokes `pqg_task_create` through existing MCP bridge/permission stack.
4. Store receives one Task record/event.
5. Tool result settles.
6. Task client resource invalidates/reloads.
7. Workspace/Home/Search see the new task without browser reload.
8. Assistant reply in Vietnamese confirms only after tool success.

### Additional negative scenario

Tool returns error => no success confirmation; UI does not invent task.

### Files

- `tests/system-services.test.ts`;
- `tests/task-module.test.ts`;
- add one integration test file only if keeping this scenario isolated improves maintainability.

### Commit

`test: cover Support to Task end-to-end flow`

---

# Phase 11 — Release gates

## Gate A — Focused functional tests

Run once after Phases 0–10 integration:

```bash
node --experimental-strip-types --test \
  tests/application-shell-contract.test.ts \
  tests/system-services.test.ts \
  tests/task-module.test.ts
```

Add any new focused file from Phase 1/10.

Expected: all pass, no skipped blocker case.

## Gate B — Typecheck + generated drift

```bash
npm run prepare:dsh-web
npm run typecheck
git diff --exit-code -- index.html public agents/api
```

Generated source must be committed if `prepare:dsh-web` legitimately changes it; after commit the drift check must be clean.

## Gate C — Existing GitHub `quality`

Use the repository's existing workflow once on the consolidated PR to `main`:

`install -> prepare:dsh-web -> generated drift -> typecheck -> test:prepared -> build:makers`

**Required:** green. Do not waive the Task activation test or skip Makers production build.

## Gate D — Production smoke after deploy

Test exact deployed SHA and `/build-meta.json` first.

### Desktop >=1440

- app loads, Support collapsed;
- click Support once => full usable chat;
- Home message in Vietnamese => answer stays Vietnamese;
- exact user text visible, no internal instruction wrapper;
- Task page renders;
- create task via Agent; tool progress visible; Task appears without reload;
- update/complete via Agent; Workspace/Home refresh;
- Stop works during a long run;
- simulated/reproduced stale session recovers once;
- Task module disable/enable follows existing module policy.

### iPad ~1024 width

- Support initially collapsed;
- one tap opens Drawer/composer;
- keyboard/composer usable;
- Task create/edit controls do not overflow;
- close/reopen preserves session and data.

### Data boundary

Automated test already proves 101+/250 task pagination; do not pollute Production with hundreds of throwaway tasks unless using a disposable test account/environment.

## Gate E — GitHub evidence

Before closing master remediation issue, attach:

- green quality run URL;
- exact merge SHA;
- deployed build-meta SHA;
- focused Production smoke checklist result;
- status of each finding AG/TK/OP/CI/QA/GOV.

---

# Recommended branch/PR sequence

To minimize conflicts and get a usable MVP fastest:

1. `fix/support-runtime-foundation`
   - Phase 0 + Phase 1 + Phase 3.
2. `fix/support-product-behavior`
   - Phase 2 + Phase 4.
3. `fix/task-data-correctness`
   - Phase 5.
4. `fix/task-client-sync`
   - Phase 6 + Phase 10.
5. `fix/task-concurrency-crud`
   - Phase 7 + Phase 8 if included in same release.
6. `fix/module-adapter-diagnostics`
   - Phase 9.
7. Consolidate on one integration branch, run Gates A–C once, then one PR to `main` if branch protection/workflow economics favor grouped integration.

Do not let several branches independently hand-edit generated `public/plugins` artifacts; regenerate only at integration boundary to reduce merge conflicts.

---

# Definition of Done

Chatbox/Task remediation is complete only when all are true:

- [ ] Support never auto-expands on initial load.
- [ ] One explicit user action opens a usable composer.
- [ ] Vietnamese product persona applies outside Task context too.
- [ ] User message remains exact; internal instructions are not user content.
- [ ] Fresh and stale session paths both recover/use DSH native session lifecycle.
- [ ] Transcript/tool status uses native/version-locked DSH conversation/tool seam; no product code guesses between `.nodes` and `.chat.legacy.nodes`.
- [ ] Agent can create/update a Task through `pqg_task_*` and only confirms after tool success.
- [ ] Workspace/Home/Search share one Task client resource and refresh after Agent mutation.
- [ ] Home errors are not shown as `0 việc`.
- [ ] Task list/update works beyond 100 records.
- [ ] `dueDate` validation is consistent across Service/API/MCP/UI.
- [ ] Concurrent Task patches cannot silently lose independent fields, or the remaining limitation is explicitly gated and tracked.
- [ ] Module adapter failure is diagnosable without killing core MCP tools.
- [ ] PR #107 is either superseded or reduced to the verified session-recovery change; no red CI remains.
- [ ] Existing GitHub `quality` is green including exact Makers build.
- [ ] Desktop + iPad Production smoke passes on the deployed commit SHA.
- [ ] GitHub master issue contains evidence for closure.
