# Chatbox Agent + Task Module — Remediation Plan (Plan-first)

Tracking: #110. Audit: `docs/audit/2026-09-09-chatbox-agent-task-module-audit.md`.

## Quy tắc thực thi

- Research/reuse trước; không tự viết primitive DSH/Cordis đã có.
- YAGNI/KISS; không gold-plating.
- Không code trước `APPROVED/OK` cho từng task.
- Không mở rộng file/scope ngoài plan đã duyệt.
- Chỉ thêm/run regression test trực tiếp cho lỗi đang sửa.
- Không nâng DSH package wave trong đợt này.

## Thứ tự

`#112 → #111 → #113 → #114 → #115`

# Task A — #112: Agent scope đúng

**KẾ HOẠCH THỰC HIỆN**

- **File(s) cần sửa/tạo:** `packages/application-shell/src/services.ts`; `agents/_dsh-web-sidecar.ts`; `package.json/package-lock.json` chỉ nếu dùng `@deepseek-ai/dsh-time-context@0.1.0-rc.6`; focused tests `system-services`, `sidecar-settings`.
- **Hàm/phương thức thêm mới:** không mặc định thêm.
- **Logic chính:** gửi raw user text; đưa persona PQG vào preset/system-prompt seam. Reuse time-context rc.6 để hiểu “hôm nay/ngày mai”. Kiểm tra `dsh-tool-todo`; nếu Support v1 không có consumer thì bỏ khỏi Support preset, không viết tool router.
- **Rủi ro/phụ thuộc:** nếu preset còn phục vụ coding workflow đã được chấp nhận thì không được xóa capability tùy tiện; phải dùng scope/preset seam có sẵn.

**Focused check:** raw prompt; persona/time context; tool roster cần thiết.

**Gate:** chờ `APPROVED/OK` trước code.

# Task B — #111: DSH-native conversation

**KẾ HOẠCH THỰC HIỆN**

- **File(s) cần sửa/tạo:** `packages/application-shell/src/client.tsx`; `services.ts` chỉ nếu thin adapter bắt buộc; producer chỉ nếu rc.6 inject graph thiếu.
- **Hàm/phương thức thêm mới:** không mặc định thêm.
- **Logic chính:** bỏ manual `nodes + queue + partial`; reuse pinned `ui-conversation` per-session draft/queue/send/cancel/history và generic `ui-tool` lifecycle. Không tạo chat store/assembler mới.
- **Rủi ro/phụ thuộc:** inspect exact rc.6 exports trước; không copy API upstream `master`.

**Focused check:** queue B không duplicate/trộn turn A; tool call/result vẫn visible.

**Gate:** chờ `APPROVED/OK` trước code.

# Task C — #113: Approval + Task refresh

**KẾ HOẠCH THỰC HIỆN**

- **File(s) cần sửa/tạo:** `packages/task-module/src/makers.ts`; `_mcp-bridge.ts` / `_makers-mcp-permission.mjs` chỉ phần metadata/gate thật sự cần; `application-shell/src/client.tsx/copy.ts`; `task-module/src/client.tsx`; focused permission/Task tests.
- **Hàm/phương thức thêm mới:** chỉ metadata `requiresApproval`/tương đương nếu current DSH gate không có declarative seam đủ dùng.
- **Logic chính:** create/update Task phải đi qua existing `tools/pre-execute → ask → Approval` ở default. Support chỉ CTA sang trang Approval; không duplicate decision buttons. Approval map Task action sang copy tiếng Việt. Sau Agent turn có khả năng mutate Task kết thúc, refresh mounted Task surfaces một lần.
- **Rủi ro/phụ thuộc:** không hứa rollback write đã commit khi Stop; giữ Full-access policy semantics theo sản phẩm.

**Reuse/YAGNI:** dùng generic `ui-tool` trước; không custom Task tool-view nếu chưa cần. Không shared Task cache/store mặc định.

**Focused check:** default write asks; reject không mutate; allow mutate; active Task UI refresh.

**Gate:** chờ `APPROVED/OK` trước code.

# Task D — #114: Task correctness / truthfulness

**KẾ HOẠCH THỰC HIỆN**

- **File(s) cần sửa/tạo:** `task-module/src/service.ts`, `makers.ts`, `client.tsx`, `agents/api/pqg.tasks.ts`, `middleware.ts`; date helper chỉ nếu dùng ở ≥2 boundary.
- **Hàm/phương thức thêm mới:** validator ISO calendar date nhỏ nếu cần.
- **Logic chính:** paginate Store đúng contract; enforce + mô tả `dueDate=YYYY-MM-DD`; tách error khỏi empty/0; fallback message theo GET/POST/PATCH; thêm exclusion nhỏ để global translator không dịch/ẩn user-authored Task/Search/Support content.
- **Rủi ro/phụ thuộc:** không xây pagination API/framework mới; không rewrite i18n.

**Focused check:** 101 Task boundary; invalid/valid date; GET error không render empty; `Plan`/`Preview` giữ nguyên.

**Verify-only:** policy bootstrap retry chỉ code nếu reproduction fail.

**Gate:** chờ `APPROVED/OK` trước code.

# Task E — #115: Focused Production verification

**KẾ HOẠCH THỰC HIỆN**

- **File(s) cần sửa/tạo:** mặc định không sửa runtime; lưu `docs/verification/...` chỉ khi cần evidence.
- **Hàm/phương thức thêm mới:** không có.
- **Logic chính:** smoke đúng build identity trên desktop + iPad, chỉ các đường #111–#114 đã đổi. Nếu verify-only risk fail thì tạo một task nhỏ riêng và quay lại Plan-first.
- **Rủi ro/phụ thuộc:** Production có thể không truy cập được từ agent environment; khi đó ghi `Không thể xác nhận`, không suy diễn từ CI.

**Focused smoke:** raw Vietnamese prompt; 2 queued prompts; Task list/create/update; Approval reject/allow; Task UI refresh; Stop rồi prompt tiếp theo; reload/iPad; không raw jargon/tool payload làm primary UI.

## Deferred theo YAGNI

- #116 concurrent Task lost-write: closed `not_planned`, reopen khi có reproduction.
- auto-scroll polish;
- broad lifecycle/E2E suite;
- shared Task cache/store;
- custom Task tool-view;
- proactive policy retry framework;
- MutationObserver perf optimization không có profile.

## Definition of Done

- #112, #111, #113, #114 merged theo plan đã được duyệt.
- Mỗi PR chỉ thay files đã duyệt hoặc dừng xin re-plan.
- Focused regression tests pass; required GitHub `quality` pass.
- #115 Production smoke có build identity hoặc ghi rõ `Không thể xác nhận`.
