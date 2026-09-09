# Audit Chatbox Agent + module Công việc — vòng 3 — 2026-09-09

Tracking: #110. Baseline: `main` sau PR #103/#104.

## 1. Nguyên tắc audit

- Research/reuse trước khi đề xuất code mới.
- Ưu tiên seam hiện có của DSH/Cordis/Makers/Store.
- YAGNI/KISS; không gold-plating.
- Chỉ coi là lỗi khi có bằng chứng từ source/spec/contract hoặc reproduction rõ ràng.
- Rủi ro chưa chứng minh được xếp `verify-only`/deferred, không mặc định code.
- Chỉ test regression trực tiếp; required GitHub `quality` là merge gate cuối.
- Không code runtime trước khi plan từng task được `APPROVED/OK`.
- Production chỉ PASS khi có live build identity + smoke evidence; hiện chưa thể xác nhận live từ môi trường audit.

Phạm vi đã rà:

- `packages/application-shell/src/{client,services,contracts,copy,tokens}.ts/.tsx`
- `packages/task-module/src/{client,service,makers}.ts/.tsx`
- `agents/api/{pqg.tasks,pqg.modules}.ts`
- `agents/{_dsh-web-sidecar,_mcp-bridge,_makers-mcp-permission,_module-policy,_module-state,_sandbox-abort}.ts/.mjs`
- `src/pqg-module-settings-client.ts`
- `middleware.ts`, `scripts/prepare-dsh-web.mjs`
- focused tests hiện có
- Support Agent v1 spec
- generated/pinned DSH `0.1.0-rc.6`
- upstream DSH `ui-conversation`, `ui-tool`, `ui-user-questions`, system prompt, time-context, tool todo và Cordis lifecycle.

---

## 2. Kết luận ưu tiên

### P0 — blocker cho Support Agent/Task MVP

| ID | Vấn đề | Tracking |
|---|---|---|
| F-01 | Support tự ghép `nodes + queue + partial`, sai ownership conversation lifecycle | #111 |
| F-02 | Support dùng custom textarea, không mount DSH `conversation.composer`; pending user-question có thể không có đường trả lời | #111 |
| F-03 | Tool call/result/non-text bị mất khỏi custom Support transcript | #111 |
| F-04 | Persona/module context bị nối vào chính user-role text | #112 |
| F-05 | Preset hiện là coding agent; `todo_write` có semantic overlap với business `pqg_task_*` | #112 |
| F-06 | Prompt “hôm nay/ngày mai” thiếu authoritative runtime time context | #112 |
| F-07 | `pqg_task_create/update` auto-allow ở default `workspace-write`, trái Support v1 Approval acceptance | #113 |
| F-08 | Approval primary UI có thể lộ raw tool name/reason kỹ thuật | #113 |
| F-09 | Agent write thành công nhưng Task Workspace/Home đang mount không được refresh | #113 |

### P1 — data correctness / UI truthfulness

| ID | Vấn đề | Tracking |
|---|---|---|
| F-10 | Task service chỉ đọc tối đa 100 record | #114 |
| F-11 | `dueDate` write không enforce ngày thật `YYYY-MM-DD`; legacy malformed data cần đọc an toàn | #114 |
| F-12 | Task load failure bị trình bày như empty/0 task | #114 |
| F-13 | `taskRequest()` fallback lỗi không đúng thao tác GET/POST/PATCH | #114 |
| F-14 | Module policy fetch transient có thể làm Task client contribution không mount trong page lifetime | #114 |
| F-15 | Module toggle persist policy trước rồi propagate nhiều live sidecar; propagation partial có thể trả 503 dù state đã đổi một phần | #114 |
| F-16 | Global localization MutationObserver có thể dịch/ẩn user-authored PQG text như `Plan`/`Preview` | #114 |

### Verify-only / deferred

| ID | Rủi ro | Quyết định |
|---|---|---|
| V-01 | Store-only module tool vẫn đi qua sandbox cancellation wrapper | verify Stop-during-write; chỉ sửa khi reproduction |
| V-02 | Home không tự đổi “hôm nay” qua nửa đêm nếu page mở xuyên ngày | defer YAGNI |
| V-03 | MutationObserver có thể gây perf cost | profile chỉ nếu live còn chậm |
| V-04 | Nhiều approval đồng thời | chỉ mở scope nếu reproduction |
| V-05 | UI + Agent concurrent Task update có thể lost write | #116 closed `not_planned` đến khi có evidence |
| V-06 | DSH version mới hơn có thể chứa cải tiến | không package-wave upgrade trong remediation này |

---

## 3. Findings chi tiết

### F-01/F-03 — Support đang làm lại việc của DSH conversation

`SupportContent` hiện đọc durable `snapshot.nodes`, append `snapshot.queue` thành user rows, rồi append `snapshot.partial`. Renderer chỉ lấy text user/assistant.

Hậu quả:

- queue transient bị trộn với durable history;
- queue item có thể duplicate/race khi được admitted;
- partial có thể đặt sai ngữ cảnh turn;
- tool call/result/running/interrupted state không có presentation chuẩn;
- non-text/Markdown/attachment semantics bị giảm cấp;
- Shell phải tự xử lý lifecycle mà DSH đã có.

**Reuse evidence:** pinned rc.6 `ui-conversation` đã có per-session draft store, queue projection, `ConversationController.send()`, `cancel()`, `loadOlder()`; `ui-tool` sở hữu call/result pairing và lifecycle.

**Decision:** #111 phải reuse native conversation target/input/queue/tool path; không viết transcript assembler khác.

### F-02 — Agent follow-up có thể bị kẹt vì Support không dùng native composer takeover

Prepared app đã có `@deepseek-ai/dsh-client-ui-user-questions`. DSH thiết kế pending user question bằng cách takeover `conversation.composer`, giữ request/draft theo Session và trả structured response cho wait đang chờ.

PQG Support hiện dùng custom `<textarea>` và `session.prompt()` mới, không phải question response surface. Vì Support v1 yêu cầu Agent hỏi lại khi thiếu thông tin tạo/cập nhật Task, đây là architecture mismatch trực tiếp: một pending structured question có thể tồn tại nhưng Support không đưa ra UI trả lời tương ứng.

**Decision:** #111 reuse `conversation.composer`/`ui-user-questions`; tuyệt đối không viết custom question framework.

### F-04 — authored prompt không còn nguyên văn

`promptSupport()` hiện ghép persona, module title/summary/instruction và `Yêu cầu của người dùng: ...` vào cùng một text block gửi bằng `session.prompt()`.

Hậu quả: durable transcript/queue preview không còn nguyên văn authored text và product context nằm sai ownership.

**Decision:** authored text đi qua native DSH send path nguyên văn. Persona dùng preset/system-prompt seam. Dynamic module context dùng official system-prompt/context seam của pinned rc.6; không concatenate vào authored message.

### F-05 — persona và tool-domain ambiguity

Sidecar preset hiện ghi “coding agent running on EdgeOne Makers” và mount `@deepseek-ai/dsh-tool-todo`. DSH `todo_write` là checklist nội bộ của Agent trong session; PQG Task là business data Store-backed có id/dueDate/completed.

Hai domain gần nghĩa có thể làm model chọn nhầm tool khi user nói “tạo việc”, nhưng chưa có reproduction chứng minh phải xóa `tool-todo`.

**Decision:** #112 trước hết sửa persona/tool guidance và scope preset đúng seam. Không gỡ `tool-todo` nếu preset còn phục vụ coding workflow hoặc chưa có evidence cần thiết.

### F-06 — thiếu authoritative time context

Task suggestion dùng “hôm nay”, user có thể nói “ngày mai”, nhưng current sidecar không mount time context. Model không nên tự đoán ngày hoặc timezone.

**Reuse:** `@deepseek-ai/dsh-time-context` tồn tại trong cùng family; implementation phải inspect exact `0.1.0-rc.6` API trước. Nếu compatible, dùng đúng package rc.6. Không hardcode ngày hiện tại vào persona.

### F-07 — Task write bypass Approval

Task Makers metadata hiện:

- `pqg_task_list` → `read-only`;
- `pqg_task_create/update` → `workspace-write`.

Permission plugin default là `workspace-write` và auto-allows tool khi current rank >= required rank. Test hiện còn khóa `makersToolGate('workspace-write', 'pqg_task_create') === 'allow'`.

Support v1 spec lại yêu cầu write đi qua existing Approval và deny giữ dữ liệu nguyên vẹn.

**Decision:** #113 reuse existing `tools/pre-execute → ask → Approval` seam. Cần một rule/metadata tối thiểu để Task create/update luôn ask theo v1; không tạo approval subsystem mới.

### F-08 — Approval presentation lộ infrastructure vocabulary

`ApprovalView` render trực tiếp `approval.toolName` và `approval.reason`. Với MCP tools, primary UI có thể hiện wire name/permission jargon, trái spec “không trình bày Makers/MCP/runtime/plugin terminology trong primary UI”.

**Decision:** business action/reason phải có Vietnamese presentation. Không duplicate decision controls trong Support; vẫn dùng một Approval decision surface.

### F-09 — Agent write không đồng bộ mounted Task UI

Workspace/Home fetch khi mount; direct UI mutations tự patch local state. Agent mutation qua Makers không có client invalidation signal.

**KISS:** Task sở hữu một invalidation source nhỏ. Mounted surfaces subscribe và gọi lại existing load/refresh. Chỉ successful settled Task write phát invalidation một lần. Không tạo shared cache/store mới nếu chưa cần.

### F-10 — hard ceiling 100

`TASK_PAGE_LIMIT = 100`; service chỉ gọi `getMessages()` một lần. `updateTask()` cũng tìm trong page này.

Store contract/fake test đã có cursor `after`. Minimal proof chỉ cần 101 records.

**Decision:** page `order:'asc', limit:100`, tiếp tục bằng `after:lastMessageId`; guard repeated cursor. `updateTask(id)` dừng ngay khi tìm thấy target.

### F-11 — dueDate write/read contract

Service chỉ trim dueDate; HTTP chỉ type-check; Makers Zod chỉ string. UI lại dùng native date và Home exact-compare ISO key.

**Decision:** một validator nhỏ nếu thực sự reuse ở >=2 boundary; write chỉ nhận valid calendar `YYYY-MM-DD`/null/undefined. Legacy malformed stored value không được làm list fail; Task vẫn visible để user sửa/clear. Không migration framework.

### F-12/F-13 — error bị giả thành empty và copy sai operation

Workspace GET fail để `tasks=[]`, nên có thể vừa hiện lỗi vừa “Chưa có công việc nào”. Home fail chỉ set loaded và để tasks rỗng, nên hiển thị `0 việc`/“Không có việc”. `taskRequest()` còn dùng cùng fallback “Không thể cập nhật công việc” cho mọi method.

**Decision:** error/empty mutually exclusive; copy theo thao tác.

### F-14 — Task activation fail-silent

`taskModuleEnabled()` trả false cho exception/non-OK; `async apply()` return. Một transient bootstrap failure vì vậy có thể bị hiểu như explicit disabled trong page lifetime.

Đây là deterministic source behavior; implementation vẫn phải bắt đầu bằng focused RED test. Nếu current Cordis lifecycle cho phép re-evaluate đơn giản, reuse nó; không polling framework.

### F-15 — module toggle có partial-commit semantics

`PUT /api/pqg.modules` persist policy trước, sau đó gọi `applyModuleEnabledToLiveSidecars()`. Ready sidecars được propagate song song bằng `Promise.all`. Một sidecar fail có thể làm API trả 503 dù policy đã persist và các sidecar khác đã đổi.

**Decision:** persisted policy là source of truth. Response/UI phải nói đúng “đã lưu nhưng runtime chưa đồng bộ hoàn toàn” hoặc reconcile bằng seam hiện có. Không rollback giả transaction sau partial propagation.

### F-16 — global localization có thể sửa nội dung do người dùng tạo

`middleware.ts` dùng MutationObserver + exact text replacement/hide trên DOM. Exclusion hiện tập trung vào DSH message/markdown/input selectors, chưa bao phủ chắc chắn PQG Task/Search/custom Support content.

Một Task/title/user text exact `Plan`, `Save`, `Stop`, `Preview` có thể bị dịch hoặc `Preview` bị ẩn.

**Decision:** thêm exclusion nhỏ cho user-authored PQG regions cần bảo vệ; không rewrite i18n system trong workstream này.

---

## 4. Những giả thuyết đã loại bỏ / chưa được phép sửa

- Send while running: DSH hỗ trợ queue; không disable queue để che bug.
- Current Support IME Enter-submit: textarea hiện không bind Enter-to-send; không có bug đó ở code hiện tại.
- Draft mất khi prompt admission fail: current code chỉ clear draft sau successful receipt.
- Browser local-date là UTC bug: `localDateKey()` dùng local `getFullYear/getMonth/getDate`.
- Task client thiếu Makers conversation header: existing design/test cố ý để page bootstrap routing xử lý; chưa có evidence lỗi.
- Direct `/api/pqg.tasks` khi module disabled: chưa có product policy chứng minh phải block.
- Nâng DSH để chữa chung: không cần; reuse pinned rc.6 trước.
- Concurrent lost-update: #116 closed `not_planned` theo YAGNI.

---

## 5. Canonical remediation order

1. **#111** — native DSH conversation/composer/queue/tool + user-question lifecycle.
2. **#112** — raw authored prompt + scoped PQG persona/module/time/tool-domain guidance.
3. **#113** — Task write Approval invariant + human presentation + minimal Task invalidation.
4. **#114** — pagination/date/error/localization + module activation/reconcile correctness.
5. **#115** — focused cross-seam verification + Production desktop/iPad smoke.

#116 đã đóng `not_planned`; không nằm trong active MVP path.

Lý do #111 đứng trước #112: native DSH composer/send path đã sở hữu raw authored message. Sửa `promptSupport()` trước rồi thay bằng native path ở PR kế tiếp sẽ tạo code tạm và vi phạm YAGNI.

---

## 6. Testing policy

Mỗi implementation PR:

1. viết một RED reproduction đúng lỗi của PR;
2. chỉ chạy focused test files liên quan;
3. typecheck khi TypeScript contract đổi;
4. `prepare:dsh-web`/generated verification chỉ khi client graph/producer đổi;
5. `build:makers` chỉ khi sidecar/Makers/server path đổi;
6. required GitHub `quality` phải green trước merge.

Không thêm broad E2E framework, shared state framework, migration framework, distributed transaction hay DSH package-wave nếu task hiện tại không bắt buộc.
