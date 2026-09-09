# Audit Chatbox Agent + module Công việc — vòng 2 — 2026-09-09

## 1. Phạm vi và nguyên tắc

Baseline: `main` sau PR #103/#104. Tracking: #110.

Audit áp dụng các nguyên tắc bắt buộc:

- research upstream/related implementation trước khi đề xuất;
- reuse primitive đang có, hạn chế tối đa code mới;
- YAGNI/KISS, không gold-plating;
- chỉ test đúng regression cần chứng minh;
- không code trước khi plan được `APPROVED/OK`;
- phân biệt rõ `confirmed`, `verify-only`, `ruled-out`;
- không dùng CI/source green để suy diễn Production PASS.

Các vùng đã rà:

- `packages/application-shell/src/{client,services,contracts,copy,tokens}.tsx/.ts`
- `packages/task-module/src/{client,service,makers}.ts/.tsx`
- `agents/api/pqg.tasks.ts`
- `agents/{_dsh-web-sidecar,_mcp-bridge,_makers-mcp-permission,_module-policy,_module-state}.ts/.mjs`
- `middleware.ts`, `scripts/prepare-dsh-web.mjs`
- focused tests hiện có
- Support Agent v1 spec
- pinned/generated DSH rc.6 conversation UI
- upstream DSH `ui-conversation`, `ui-tool`, tools/approval, `dsh-tool-todo`, `dsh-time-context`, Cordis lifecycle.

Production live chưa được xác nhận từ môi trường audit này.

---

## 2. Kết luận ưu tiên

### P0 — phải xử lý trước MVP

| ID | Vấn đề | Evidence chính | Tracking |
|---|---|---|---|
| F-01 | Support tự ghép transcript từ `nodes + queue + partial` | `application-shell/src/client.tsx` | #111 |
| F-02 | Tool call/result/Markdown/non-text bị bỏ khỏi custom chat | `application-shell/src/client.tsx` | #111 |
| F-03 | Persona/module context bị serialize vào user-role text | `application-shell/src/services.ts::promptSupport()` | #112 |
| F-04 | Preset vẫn là coding agent, không phải PQG work assistant | `agents/_dsh-web-sidecar.ts` | #112 |
| F-05 | `dsh-tool-todo` checklist nội bộ collision với business `pqg_task_*` | sidecar preset + upstream todo contract | #112 |
| F-06 | Không có authoritative runtime clock cho prompt “hôm nay/ngày mai” | current composition + upstream time-context | #112 |
| F-07 | Task create/update bypass Approval ở default `workspace-write` | `makers.ts`, `_makers-mcp-permission.mjs`, tests | #113 |
| F-08 | Support không dẫn user tới Approval; Approval lộ tool/reason kỹ thuật | `application-shell/src/client.tsx` + spec | #113 |
| F-09 | Agent write không refresh Task UI đang mount | `task-module/src/client.tsx` | #113 |

### P1 — correctness / truthfulness

| ID | Vấn đề | Evidence chính | Tracking |
|---|---|---|---|
| F-10 | hard ceiling 100 Task | `task-module/src/service.ts` | #114 |
| F-11 | `dueDate` không enforce/describe ngày thật `YYYY-MM-DD` | service/Makers/API | #114 |
| F-12 | Task GET lỗi nhưng UI vẫn báo empty/0 | Workspace/Home client state | #114 |
| F-13 | fallback lỗi GET/POST/PATCH đều nói “Không thể cập nhật” | `taskRequest()` | #114 |
| F-14 | localization MutationObserver có thể dịch/ẩn user-authored text | `middleware.ts` | #114 |

### Verify-only — không mặc định code

| ID | Rủi ro | Quyết định |
|---|---|---|
| V-01 | policy fetch fail-close có thể làm Task không mount / chậm bootstrap | chỉ sửa khi reproduction |
| V-02 | generic MCP wrapper dùng sandbox-kill cancellation cả cho Store-only module tools | chỉ sửa khi reproduction |
| V-03 | Home “hôm nay” không tự rerender qua nửa đêm | defer theo YAGNI |
| V-04 | đổi desktop/Drawer có thể remount custom Support draft | kỳ vọng #111 tự giải quyết bằng DSH draft |
| V-05 | MutationObserver toàn DOM có thể tạo perf cost | chỉ profile nếu live vẫn chậm |
| V-06 | read-modify-write concurrent Task có thể lost update | #116 đóng `not_planned` đến khi có reproduction |

---

## 3. Findings chi tiết

### F-01/F-02 — custom conversation renderer đang làm sai ownership

`SupportContent` hiện tự:

1. đọc durable `snapshot.nodes`;
2. append `snapshot.queue` như user rows;
3. append `snapshot.partial` như assistant row;
4. chỉ lấy text user/assistant.

Hậu quả:

- queue transient bị trộn vào durable transcript;
- queue item có thể duplicate khi được claim thành durable node;
- tool-call/result/running state biến mất;
- Markdown/non-text/historical attachment content bị mất hoặc giảm cấp;
- product Shell phải tự xử lý lifecycle mà DSH đã xử lý.

**Research/reuse:** pinned bundle `public/plugins/@deepseek-ai/dsh-client-ui-conversation/client.js` đã có per-session chat store, persisted draft, queue read face, `ConversationController.send()`, `cancel()`, `loadOlder()`; upstream `ui-tool` sở hữu call/result pairing.

**Kết luận:** #111 phải reuse DSH surface/projection. Không viết conversation assembler thứ hai.

### F-03 — injected context đang mang role người dùng

`promptSupport()` gói persona, module summary/instruction và user text vào một text block rồi `session.prompt(..., 'queue')`.

Hậu quả:

- transcript không còn nguyên văn;
- queue preview có thể lộ context nội bộ;
- product/system policy nằm sai role;
- khó scope/dispose module context đúng session/module.

**Kết luận:** raw user text giữ nguyên; persona/context đi qua preset/system-prompt seam của rc.6.

### F-04 — persona hiện tại sai sản phẩm

Sidecar preset hiện dùng thông điệp “coding agent running on EdgeOne Makers”. Support v1 lại là trợ lý công việc PQG tiếng Việt.

Đây không phải lỗi wording thuần túy: persona coding làm tăng xác suất model ưu tiên workspace/coding tools thay vì Task business tools.

### F-05 — `todo_write` và `pqg_task_*` là hai domain khác nhau nhưng cùng model-visible

Preset hiện mount `@deepseek-ai/dsh-tool-todo`.

Upstream xác định `todo_write` là whole-list checklist để **Agent tự lập kế hoạch trong một session**, không phải danh sách công việc nghiệp vụ của người dùng. PQG Task là Store-backed business data có id/dueDate/completed.

**Rủi ro:** user nói “tạo việc/đánh dấu việc xong”, model có hai tool domain gần nghĩa; `todo_write` thành công nhưng PQG Task UI không đổi.

**YAGNI decision:** nếu Support v1 không có consumer rõ ràng cho agent-internal todo, bỏ tool khỏi Support preset. Không viết router/classifier mới.

### F-06 — “hôm nay/ngày mai” thiếu clock context

Task Support có suggestion `Tóm tắt các công việc cần làm hôm nay.` nhưng current composition không có `dsh-time-context`/clock section.

Upstream `@deepseek-ai/dsh-time-context` tồn tại để giải đúng bài toán current zoned time; npm có version `0.1.0-rc.6`, cùng version family repo đang pin.

**Decision:** inspect API rc.6 trước. Nếu tương thích, mount đúng package rc.6; không hard-code ngày hiện tại vào persona và không nâng package wave.

### F-07 — Task write hiện không bắt Approval ở default

Task Makers adapters:

- list → `read-only`;
- create/update → `workspace-write`.

Permission plugin:

- default mode = `workspace-write`;
- required rank <= current rank → `allow`.

Test hiện còn khẳng định `makersToolGate('workspace-write', 'pqg_task_create') === 'allow'`.

Trong khi Support v1 spec yêu cầu write request đi qua existing Approval và reject phải giữ data unchanged.

**Kết luận:** đây là P0 contract violation. Reuse DSH `tools/pre-execute → {kind:'ask'} → approval`; không tạo approval subsystem mới.

### F-08 — Approval flow chưa đúng UX spec

Support panel hiện không có pending-approval callout/CTA dẫn tới trang `Phê duyệt`.

Approval page hiển thị trực tiếp:

- `approval.toolName`;
- `approval.reason`.

Task approval có thể vì vậy lộ `pqg_task_create`, `pqg_task_update`, `Makers`, permission labels tiếng Anh.

**KISS fix:** chỉ map Task write action/reason sang copy tiếng Việt và dẫn sang existing Approval page. Không duplicate allow/reject buttons trong Support.

### F-09 — Agent write và Task UI không đồng bộ

Task Workspace/Home load qua HTTP khi mount; direct UI mutation tự patch local state. Agent mutation chạy server-side qua Makers, không phát signal cho mounted Task UI.

**Plan cũ quá nặng:** shared cache/store + custom tool view ngay từ đầu là không cần thiết.

**KISS direction:** sau Agent turn có khả năng mutate Task kết thúc, trigger một refresh tối thiểu của mounted Task surfaces bằng lifecycle/session signal sẵn có. Chỉ thêm shared cache nếu duplicate fetch/thrashing thực sự xuất hiện.

### F-10 — 100 Task boundary

`TASK_PAGE_LIMIT = 100` và service chỉ gọi `getMessages()` một lần. `updateTask()` cũng chỉ tìm trong page này.

**Minimal regression:** 101 records là đủ chứng minh boundary; test 205 records trong plan cũ là thừa.

### F-11 — dueDate contract chưa khép kín

UI dùng native date và Home compare exact `YYYY-MM-DD`, nhưng:

- service chỉ trim string;
- HTTP chỉ type-check;
- MCP Zod chỉ `string`;
- tool schema không nói model phải gửi ISO calendar date.

**Fix:** một validator/helper nhỏ dùng tại ≥2 boundary; Makers schema phải mô tả/enforce format. Reject ngày không tồn tại như `2026-02-31`.

### F-12/F-13 — lỗi bị trình bày thành “không có dữ liệu” và message sai thao tác

Workspace khi GET fail:

- set error;
- `tasks` vẫn `[]`;
- sau loading có thể vẫn render `Chưa có công việc nào.`

Home khi GET fail:

- chỉ `setLoaded(true)`;
- render `0 việc` + `Không có việc đến hạn hôm nay.`

Ngoài ra `taskRequest()` fallback mọi method bằng `Không thể cập nhật công việc`.

**Impact:** UI khẳng định sai trạng thái dữ liệu.

**Fix:** error/empty mutually exclusive; fallback theo operation.

### F-14 — localization layer đụng user-authored content

`middleware.ts` cài MutationObserver + global text replacement. Exclusion hiện tập trung vào DSH message/markdown/input selectors, không bao phủ đầy đủ PQG Task/Home/Search/custom Support output.

Các exact labels như `Plan`, `Preview`, `Save`, `Stop` có thể bị dịch; `hideExactLabel('Preview')` còn có thể ẩn element.

**KISS fix:** thêm exclusion nhỏ cho vùng user-authored PQG content. Không rewrite i18n system trong workstream này.

---

## 4. Verify-only findings

### V-01 — Task policy bootstrap

`taskModuleEnabled()` trả false cho network/non-OK và `apply()` return luôn. Đây là source risk, nhưng chưa cần retry framework.

**Rule:** chỉ sửa khi focused/live reproduction chứng minh module mất sau transient error hoặc startup bị block đáng kể.

### V-02 — cancellation scope của module tools

`register()` trong MCP bridge áp `runWithSandboxCancellationScope()` cho mọi handler; module Task cũng đi qua wrapper này dù chỉ dùng Store. On abort, wrapper có thể `sandbox.kill()`; Store promise không tự bị Promise.race cancel.

**Rule:** verify Stop-during-Task-write. Chỉ tách wrapper nếu có ảnh hưởng thực tế; không hứa rollback side effect đã commit.

### V-03 — midnight freshness

Home widget tính `localDateKey()` trên render nhưng không có timer đến nửa đêm. Defer theo YAGNI trừ khi app thực tế cần page mở xuyên ngày.

### V-04 — responsive remount/draft

Custom Support element đổi từ Aside sang Drawer theo breakpoint. DSH per-session draft ở #111 có thể tự loại bỏ vấn đề; không viết thêm draft map trước.

### V-05 — MutationObserver performance

Global DOM walk có thể tốn chi phí nhưng chưa có profile. Không optimize bằng suy đoán.

### V-06 — concurrent Task write

Rủi ro read-modify-write đã biết nhưng chưa tái hiện. #116 đóng `not_planned` theo YAGNI.

---

## 5. Những giả thuyết đã loại bỏ

- **Send while running:** không phải bug; DSH hỗ trợ queue.
- **IME Enter-submit:** current Support textarea không bind Enter-to-send, nên không có bug này hiện tại.
- **Draft mất khi prompt submit fail:** current code chỉ clear draft sau successful receipt.
- **Browser local date = UTC bug:** `localDateKey()` dùng local `getFullYear/getMonth/getDate`, không phải UTC.
- **Thiếu Makers conversation header ở Task client:** existing design/test cố ý để page bootstrap routing xử lý; chưa có bằng chứng lỗi.
- **Direct `/api/pqg.tasks` khi module disabled:** chưa có product policy chứng minh API phải bị khóa; không tự thay.
- **Nâng DSH để chữa chung:** không cần; reuse rc.6 trước.
- **Concurrency fix:** chưa cần đến khi có reproduction.

---

## 6. Kế hoạch đã được tinh giản

Thứ tự:

1. #112 — raw prompt + PQG persona + temporal context + loại tool collision nếu không có consumer.
2. #111 — reuse DSH conversation/queue/tool lifecycle.
3. #113 — enforce existing Approval + minimal Task refresh.
4. #114 — Task pagination/date/error truthfulness/localization exclusion.
5. #115 — focused Production smoke; chỉ mở code cho verify-only failure.

Đã loại khỏi active MVP plan:

- shared Task cache/store mặc định;
- custom Task tool views mặc định;
- broad lifecycle/E2E suite;
- auto-scroll polish;
- proactive concurrency/CAS/lock;
- retry framework cho policy bootstrap khi chưa reproduce.

## 7. Testing rule

Mỗi implementation PR chỉ thêm/run regression test trực tiếp cho lỗi nó sửa, cộng typecheck/build path bắt buộc khi file server/Makers/generated graph bị đổi. Không mặc định chạy/viết full suite ngoài required GitHub `quality` gate.

## 8. Plan-first gate

Trước mỗi issue phải gửi plan ngắn theo đúng cấu trúc:

`Files cần sửa/tạo | Hàm/phương thức mới | Logic chính | Rủi ro/phụ thuộc`

Chỉ code sau khi user trả `APPROVED` hoặc `OK`. Nếu implementation buộc vượt file/scope đã duyệt: dừng và xin điều chỉnh plan.
