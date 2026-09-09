# Audit Chatbox Agent + module Công việc — 2026-09-09

## 1. Phạm vi và baseline

Audit này rà lại luồng Support Agent/Chatbox và module Task trên `main` sau khi PR #103 (Support Agent v1) và #104 (pending prompt visibility) được merge.

Phạm vi:

- `packages/application-shell/src/client.tsx`
- `packages/application-shell/src/services.ts`
- `packages/application-shell/src/contracts.ts`
- `packages/application-shell/src/copy.ts`
- `packages/task-module/src/client.tsx`
- `packages/task-module/src/service.ts`
- `packages/task-module/src/makers.ts`
- `agents/api/pqg.tasks.ts`
- `agents/_dsh-web-sidecar.ts`
- `agents/_mcp-bridge.ts`
- focused tests liên quan
- PR #100–#104 và spec `docs/superpowers/specs/2026-09-08-support-agent-v1-design.md`

Production live **không thể xác nhận** trong môi trường audit này vì endpoint EdgeOne không phân giải qua kênh kiểm thử hiện tại. Vì vậy tài liệu phân biệt rõ `confirmed-from-source`, `risk-to-prove`, và `production-verification-required`.

Master tracking issue: #110.

## 2. Executive summary

Support Agent v1 đang tái sử dụng đúng DSH session/Approval/Makers ở tầng transport và persistence, nhưng presentation layer đã tái dựng một phần conversation semantics bằng code riêng. Đây là nguyên nhân gốc của phần lớn lỗi chatbox: queue, partial, tool-call/result và durable transcript bị trộn ở sai tầng. Song song, Task UI chưa có invalidation khi Agent mutate data, Task service chỉ đọc 100 records, và `dueDate` không có invariant chung.

Không nên sửa bằng cách tạo backend/chat store/state framework mới. Hướng đúng là quay về các seam chuẩn của DSH/Cordis đang có và giữ Task state thuộc Task module.

### Severity matrix

| ID | Mức | Trạng thái | Vấn đề | Ảnh hưởng chính | Tracking |
|---|---|---|---|---|---|
| F-01 | P0 | Confirmed | Support tự ghép `nodes + queue + partial` | sai ordering/duplication/lifecycle | #111 |
| F-02 | P0 | Confirmed | persona/module context bị nhét vào user message | sai role, queue/transcript lộ injected text | #112 |
| F-03 | P0 | Confirmed | tool-call/result/progress không được render | thao tác Agent có thể trông như “xử lý rồi trống” | #111, #113 |
| F-04 | P0 | Confirmed | Agent write không invalidate Task UI đang mở | Agent báo thành công nhưng UI cũ | #113 |
| F-05 | P1 | Confirmed | hard cap 100 Task | Task >100 có thể không list/update được | #114 |
| F-06 | P1 | Confirmed | `dueDate` không validate | dữ liệu lệch invariant, widget hôm nay sai | #114 |
| F-07 | P1 | Confirmed | Task activation fail-silent khi policy fetch lỗi tạm thời | module có thể biến mất đến reload | #114 |
| F-08 | P1 | Confirmed/UX | draft/session, scroll, usable-session predicate, error localization | nhầm session / UX kém / raw error | #115 |
| F-09 | P1 | Confirmed | regression tests thiên về source-string | test xanh vẫn lọt lifecycle race | #115 |
| F-10 | P2 | Risk to prove | Task read-modify-write có thể lost update | ghi đè concurrent edit | #116 |

## 3. Findings chi tiết

### F-01 — Support transcript đang được dựng ở sai tầng kiến trúc

**Evidence:** `SupportContent` đọc `supportSnapshot()` rồi tự tạo danh sách message bằng durable `snapshot.nodes`, append toàn bộ `snapshot.queue`, sau đó append `snapshot.partial`.

`queue` không phải durable chat history; nó là transient projection của pending next-turn messages. Việc append queue vào transcript trước partial có thể làm UI trông như assistant hiện tại đang trả lời prompt kế tiếp. Khi queue item được claim và trở thành durable input node, custom projection cũng phải tự tránh duplicate/race — logic này DSH đã sở hữu.

**Root cause:** product Shell đang làm công việc của DSH conversation assembler/UI.

**Fix direction:** #111. Reuse `ui-conversation` projection/queue dock và `ui-tool` lifecycle của đúng pinned DSH API. Nếu rc.6 không cho embed nguyên view, dùng thin adapter quanh official target/projection seams, không tiếp tục concatenate compatibility fields.

### F-02 — Product persona/module context bị serialize thành user-role text

**Evidence:** `promptSupport(value, context)` trong `packages/application-shell/src/services.ts` xây một chuỗi gồm persona PQG, module title/summary/instruction và `Yêu cầu của người dùng: ...`, rồi gửi toàn bộ bằng `session.prompt([{ type: 'text', text: contextText }], 'queue')`.

Hậu quả:

- durable user transcript không còn nguyên văn input;
- queue preview sau #104 có thể hiển thị context nội bộ như thể người dùng đã gõ;
- role semantics sai: product/system guidance đi vào user role;
- context scope dễ bị coupling với presentation code.

**Fix direction:** #112. Raw user text phải giữ nguyên. Persona đặt ở agent preset/system prompt. Dynamic module guidance đặt ở DSH system prompt/context seam có scope. Không đưa arbitrary data accessor vào Shell.

### F-03 — Tool lifecycle bị mất khỏi Support surface

**Evidence:** custom renderer chỉ nhận user/assistant text nodes và partial text; `runningCalls`, tool call nodes, tool results không được trình bày. Trong khi spec Support Agent v1 yêu cầu “tool-progress status supplied by the DSH session” và không được claim success trước tool result.

**Impact:** thao tác list/create/update Task có thể chỉ hiện generic “Đang xử lý…”; turn có tool activity nhưng final text thiếu/rỗng có thể trông như không có kết quả.

**Fix direction:** #111 + #113. DSH `ui-tool` sở hữu call/result pairing/lifecycle; Task chỉ đăng ký human-readable atomic tool views cho `pqg_task_list/create/update`.

### F-04 — Agent mutation không đồng bộ Task UI đang mở

**Evidence:** `TaskWorkspace` giữ local `tasks` state và refresh khi mount. UI create/update tự patch local state. Agent create/update chạy server-side qua Makers tool cùng Task service nhưng không có event/invalidation quay lại client store.

**Impact:** Agent có thể ghi persistence thành công nhưng danh sách Task đang mở vẫn stale; search/API có thể thấy dữ liệu mới trong khi workspace cũ.

**Fix direction:** #113. Task module sở hữu một shared client data source/cache nhỏ; Workspace/Home subscribe vào đó. Successful Task write tool-result trigger một revalidation, không polling theo token. Shell không import Task data/service.

### F-05 — Task service có hard ceiling 100 records

**Evidence:** `TASK_PAGE_LIMIT = 100`; `taskMessages()` gọi `context.store.getMessages(... limit: 100, order: 'asc')` một lần. `listTasks()` và `updateTask()` đều phụ thuộc kết quả này.

**Impact:** khi vượt 100 Task, bản ghi sau page đầu có thể không list được và `updateTask(id)` có thể trả not found dù record tồn tại.

**Fix direction:** #114. Implement bounded pagination theo Store contract, stable ordering, no duplicate, có guard chống loop.

### F-06 — `dueDate` không có invariant chung

**Evidence:** Makers schema dùng `z.string().optional()` / nullable string; HTTP API kiểm tra type; service không enforce calendar format. UI date input và Home widget lại sử dụng exact `YYYY-MM-DD` comparison.

**Impact:** Agent/API có thể lưu `tomorrow`, malformed date hoặc ngày không tồn tại; widget hôm nay và sort/filter không còn đáng tin.

**Fix direction:** #114. Shared Task-owned validator/schema; persistence boundary chỉ nhận `undefined | null | valid YYYY-MM-DD`. Natural-language date resolution thuộc Agent trước tool call, không thuộc storage.

### F-07 — Task module activation có thể fail-silent vì lỗi bootstrap tạm thời

**Evidence:** `taskModuleEnabled()` trả `false` cho non-OK/exception; `apply()` dừng đăng ký contribution. Nếu đó là network/policy request transient error thay vì policy `enabled=false`, module bị coi như disabled và không có retry/re-evaluation ngay trong lifecycle hiện tại.

**Impact:** Task navigation/Home contribution có thể biến mất đến khi reload.

**Fix direction:** #114. Tách “explicit disabled” khỏi “policy unavailable”; retry/re-evaluate bằng existing lifecycle, bảo đảm idempotent registration và vẫn fail-closed khi policy thật sự disabled.

### F-08 — Support session UX chưa đủ cứng

Các điểm cần sửa/kiểm chứng bằng test:

- draft là component-local, chưa keyed theo current session;
- custom Support view chưa có queue/conversation-owned draft behavior;
- không có explicit near-bottom auto-scroll policy;
- suggestion disable condition không hoàn toàn dùng cùng usable-session predicate với composer;
- low-level errors có thể đi qua `cause.message` và lộ tiếng Anh/infrastructure wording, trong khi UI v1 yêu cầu lỗi tiếng Việt ngắn gọn.

Tracking: #115.

### F-09 — Test coverage chưa chứng minh lifecycle thật

`tests/application-shell-contract.test.ts` chủ yếu kiểm tra source markers/strings. Kiểu test này hữu ích để khóa graph/contract nhưng không chứng minh runtime sequence `queued → running → partial/tool → complete/error/cancel`, queue claim, session switch hay Agent→Task invalidation.

Tracking: #115. Cần behavior/integration tests nhỏ quanh adapter/projection/store; source-string tests chỉ giữ vai trò structural guard.

### F-10 — Concurrent Task update có nguy cơ lost write

`updateTask()` là read → merge patch → full record update. Hai writer độc lập (UI + Agent) dựa trên cùng snapshot có thể overwrite field của nhau nếu Store không có CAS/version semantics.

Đây **chưa phải Production bug đã tái hiện**. Tracking #116 yêu cầu kiểm tra Store contract + failing concurrency test trước khi triển khai synchronization. Không thêm lock/custom DB theo suy đoán.

## 4. Những giả thuyết đã loại bỏ / chưa được phép coi là bug

### Send while running

Không coi là bug. DSH hỗ trợ queue khi turn đang chạy. Việc cần sửa là rendering/queue ownership, không phải vô hiệu hóa tính năng queue để che triệu chứng.

### Nâng DSH để “chữa tất cả”

Repo đang pin DSH `0.1.0-rc.6`. Upstream hiện đã tiến thêm, nhưng package-wave upgrade phải tách khỏi product fixes theo policy repo. Chỉ nâng trong đợt này nếu có reproduction chứng minh bug ở rc.6 là blocker và fix upstream không thể backport/adapt an toàn.

### Upstream DeepSeek adapter bug

Không gán các bug của adapter khác cho PQG nếu không có reproduction. Sidecar hiện dùng `@deepseek-ai/dsh-llm-pi-ai`; audit không có bằng chứng cho phép quy kết lỗi adapter khác.

### Direct `/api/pqg.tasks` khi module disabled

Chưa kết luận là bug. Agent tool exposure đã có module lifecycle gate; semantics của direct data API khi module disabled cần đối chiếu product policy trước khi thay đổi để tránh phá internal consumers.

## 5. Research/reuse baseline

Audit đối chiếu upstream DeepSeek Harness thay vì tự thiết kế một conversation framework mới:

- `ui-conversation`: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-conversation/README.md
  - owns target-neutral conversation assembly, queue dock, per-session draft persistence, phase/input behavior.
- client runtime queue: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/runtime/README.md
  - `ConversationSnapshot.queue` là Host-authoritative transient snapshot, không phải durable transcript.
- `ui-tool`: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-tool/README.md
  - Runtime owns call/result pairing/lifecycle; conversation owns placement; business UI chỉ đăng ký keyed tool views.
- system prompt: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/system-prompt/README.md
  - system persona/sections/context có scoped registry riêng.
- agent preset/persona: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/preset/README.md
  - per-session preset composition cho phép persona/tools/prompt scope theo agent.

**Important:** các link trên là upstream `master`, dùng để xác nhận kiến trúc/ownership. Implementation phải inspect API thực tế của `0.1.0-rc.6` đã pin trước khi gọi bất kỳ API nào; không copy signature mới một cách mù quáng.

## 6. Target architecture

```text
User input (raw text)
  │
  ├─ DSH conversation/composer service ── queue/session lifecycle ──► DSH runtime
  │                                                               │
  │                                                               ├─ system persona/context (scoped)
  │                                                               ├─ Task Makers tools
  │                                                               └─ Approval
  │
  └─ Support presentation ◄── DSH conversation target + ui-tool lifecycle
                                  │
                                  └─ Task registers keyed tool views
                                             │ successful write result
                                             ▼
                                      Task-owned client store revalidate
                                             │
                                  ┌──────────┴──────────┐
                               Workspace             Home/search
```

Boundary rules:

1. Application Shell owns generic support surface, not Task data.
2. Task owns Task domain service, validation and client cache.
3. DSH owns session/event/queue/tool lifecycle.
4. Approval remains the existing DSH decision surface.
5. No second AI proxy/chat database/runtime.

## 7. Implementation order

1. #112 — move persona/context out of user message; raw transcript invariant.
2. #111 — replace manual transcript reconstruction with DSH-native conversation/queue/tool lifecycle.
3. #113 — Task tool views + successful-write revalidation/shared Task client source.
4. #114 — pagination, due-date invariant, activation resilience.
5. #115 — session UX hardening + executable lifecycle tests + Production verification.
6. #116 — prove/eliminate concurrency lost-update risk; fix only if reproduced.

Mỗi workstream nên là PR riêng hoặc một nhóm commit độc lập có RED/GREEN proof. Không gộp DSH dependency upgrade.

## 8. Verification gates

Focused checks theo files thay đổi, sau đó required repo gates:

```bash
npm run typecheck
npm run test:prepared -- <focused files when supported by node:test invocation>
npm run prepare:dsh-web
npm run test:prepared
npm run build:makers
```

Không mặc định chạy full suite cho mỗi chỉnh sửa nhỏ; nhưng PR cuối phải đáp ứng required GitHub `quality` và generated/prepared drift policy của repo.

Production verification chỉ được ghi PASS khi có live evidence gồm build identity và smoke desktop + iPad. Nếu endpoint vẫn không truy cập được từ agent environment, trạng thái phải ghi **Không thể xác nhận**, không suy diễn từ CI.
