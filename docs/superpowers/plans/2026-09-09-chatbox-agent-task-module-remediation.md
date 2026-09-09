# Chatbox Agent + Task Module — Remediation Plan (Plan-first)

Tracking: #110. Audit: `docs/audit/2026-09-09-chatbox-agent-task-module-audit.md`.

## Quy tắc thực thi

- Research/reuse trước; không tự viết primitive DSH/Cordis đã có.
- YAGNI/KISS; không gold-plating.
- Không code runtime trước `APPROVED/OK` cho từng task.
- Không mở rộng file/scope ngoài plan đã duyệt; nếu buộc vượt scope thì dừng và re-plan.
- Chỉ thêm/run regression test trực tiếp cho lỗi đang sửa.
- Không package-wave upgrade DSH trong remediation này.
- Generated bundles chỉ đổi qua producer; không patch tay `public/plugins/...`.

## Thứ tự canonical

`#111 → #112 → #113 → #114 → #115`

# Task A — #111: DSH-native conversation/composer lifecycle

**KẾ HOẠCH THỰC HIỆN**

· **File(s) cần sửa/tạo:** `packages/application-shell/src/client.tsx`; `packages/application-shell/src/services.ts` chỉ nếu còn cần thin adapter; `packages/application-shell/package.json`/`scripts/prepare-dsh-web.mjs` chỉ nếu rc.6 inject graph cần bổ sung; focused test dự kiến `tests/support-conversation.test.ts` + structural guard liên quan.

· **Hàm/phương thức thêm mới:** không mặc định thêm; chỉ thin adapter quanh official rc.6 binding nếu native view không thể nhúng trực tiếp.

· **Logic chính:** bỏ manual `nodes + queue + partial`; reuse pinned `ui-conversation` cho durable conversation, queue, per-session draft/input, send/cancel và history. Reuse `conversation.composer` để `ui-user-questions` takeover khi Agent hỏi lại. Reuse `ui-tool` cho tool call/result lifecycle; không tạo chat store/assembler/question UI mới.

· **Rủi ro/phụ thuộc:** phải inspect exact exports/slot contract của DSH `0.1.0-rc.6`; không copy API `master`. Nếu full native conversation view không nhúng được vào panel, dùng thin official-target adapter, không reconstruct raw Session events.

**Focused RED/GREEN:**
- prompt A running + prompt B queued: B nằm queue riêng, không duplicate khi admitted;
- partial đúng turn;
- tool-call/result hoặc tool-only turn vẫn visible;
- pending user-question takeover xuất hiện và answer tiếp tục đúng run;
- session A/B giữ draft/question state riêng;
- cancel/error xong prompt kế tiếp vẫn dùng được;
- no-session/removed/one-shot không submit.

**Gate:** chờ `APPROVED/OK` trước code.

# Task B — #112: raw prompt + scoped PQG persona/context/time

**KẾ HOẠCH THỰC HIỆN**

· **File(s) cần sửa/tạo:** `agents/_dsh-web-sidecar.ts`; `packages/application-shell/src/services.ts` chỉ phần wrapper còn tồn tại sau #111; `contracts.ts`/Task declarative context chỉ khi contract thực sự cần; `package.json/package-lock.json` chỉ nếu dùng `@deepseek-ai/dsh-time-context@0.1.0-rc.6`; focused `system-services`/`sidecar-settings` tests.

· **Hàm/phương thức thêm mới:** không mặc định thêm.

· **Logic chính:** authored user text phải được gửi nguyên văn qua native DSH path. Persona PQG tiếng Việt đặt ở preset/system-prompt seam; module guidance dùng official system-prompt/context scope. Nếu pinned rc.6 time-context tương thích, mount đúng package cùng version để hiểu “hôm nay/ngày mai”; không hardcode ngày. Phân biệt rõ `todo_write` là checklist nội bộ Agent còn business “Công việc” dùng `pqg_task_*`.

· **Rủi ro/phụ thuộc:** preset hiện có thể phục vụ coding workflow khác; không xóa `tool-todo`/coding capability tùy tiện. Nếu cần tách persona, dùng preset/scope seam hiện có, không runtime mới.

**Focused RED/GREEN:**
- durable/queued authored prompt đúng nguyên văn;
- persona/module context có hiệu lực nhưng không xuất hiện như user-authored text;
- context không rò khi đổi module/session;
- current time/timezone có authoritative seam khi dùng temporal requests;
- tool guidance không coi `todo_write` là PQG Task store.

**Gate:** chờ `APPROVED/OK` trước code.

# Task C — #113: Task write Approval + human outcomes + UI invalidation

**KẾ HOẠCH THỰC HIỆN**

· **File(s) cần sửa/tạo:** `packages/task-module/src/makers.ts`; `agents/_makers-mcp-permission.mjs` và/hoặc `_mcp-bridge.ts` chỉ phần metadata/gate cần thiết; `packages/task-module/src/client.tsx`; optional tiny `client-invalidation.ts`; `packages/application-shell/src/client.tsx/copy.ts` chỉ generic Approval presentation/CTA; focused `mcp-permission`, `mcp-bridge`, Task/Support tests.

· **Hàm/phương thức thêm mới:** chỉ một declarative always-ask marker/rule nếu current permission contract không diễn đạt được; một Task invalidation source nhỏ nếu cần.

· **Logic chính:** `pqg_task_create/update` phải đi qua existing `tools/pre-execute → ask → Approval` theo Support v1 dù preset sandbox mode đang là `workspace-write`; list vẫn read-only. Approval/tool outcome hiển thị business copy tiếng Việt, không raw `mcp__`/Makers jargon. Sau successful settled Task write, emit một invalidation; mounted Workspace/Home gọi lại existing refresh. Deny/error không mutate và không phát success invalidation.

· **Rủi ro/phụ thuộc:** không tạo approval framework hoặc shared Task cache/store. Dùng generic DSH `ui-tool` trước; chỉ đăng ký keyed Task view tối thiểu nếu generic fallback không đạt yêu cầu “raw payload không là primary UI”.

**Focused RED/GREEN:**
- read-only/workspace-write/danger-full-access: list đọc được; create/update đều `ask` theo v1;
- deny → Store unchanged;
- allow-once → đúng một mutation;
- primary Approval/tool UI không chứa raw wire/Makers jargon;
- mounted Task surface refresh sau successful Agent write, không reload page;
- replay same settled call không gây refetch loop.

**Gate:** chờ `APPROVED/OK` trước code.

# Task D — #114: Task data correctness + module/runtime consistency

**KẾ HOẠCH THỰC HIỆN**

· **File(s) cần sửa/tạo:** `packages/task-module/src/service.ts`, `makers.ts`, `client.tsx`; `agents/api/pqg.tasks.ts`; `agents/api/pqg.modules.ts`; module state/lifecycle file chỉ nếu existing reconcile seam cần chỉnh; `middleware.ts`; optional Task date helper nếu dùng ở ≥2 boundary; focused Task/module/product-UI tests.

· **Hàm/phương thức thêm mới:** validator ISO calendar date nhỏ nếu cần reuse; pagination helper chỉ khi làm code ngắn hơn rõ ràng, không framework.

· **Logic chính:** paginate Store bằng `after:lastMessageId`, minimal boundary 101 records; `updateTask(id)` dừng khi tìm thấy. Write chỉ nhận valid calendar `YYYY-MM-DD`/null/undefined; malformed legacy date không làm list fail. Task load error và empty state loại trừ nhau; fallback message đúng GET/POST/PATCH. Policy transient không được mặc định thành permanent disabled trong page lifetime; bắt đầu bằng focused reproduction rồi reuse Cordis lifecycle để re-evaluate bounded/idempotent. Persisted module policy là source of truth; live-sidecar propagation partial phải trả/reconcile state trung thực, không giả rollback transaction. Bảo vệ user-authored PQG content khỏi global translation/hide observer bằng exclusion nhỏ.

· **Rủi ro/phụ thuộc:** không migration framework, polling framework, distributed transaction, pagination API hay i18n rewrite. Boot-time policy optimization chỉ làm khi focused measurement chứng minh cần.

**Focused RED/GREEN:**
- 101 Task list đủ, đúng order; update Task #101 thành công;
- repeated cursor không infinite loop;
- invalid date (`tomorrow`, `09/09/2026`, `2026-02-31`) reject; valid leap date/null/omitted accept;
- malformed historical dueDate vẫn list và sửa/clear được;
- GET failure không render `0 việc`/empty;
- transient policy failure rồi success không duplicate contribution; explicit disabled vẫn disabled;
- persisted policy + one sidecar propagation failure có truthful response/reconcile semantics;
- user-authored exact `Plan`/`Preview` không bị dịch/ẩn trong PQG content region.

**Gate:** chờ `APPROVED/OK` trước code.

# Task E — #115: focused integration + Production gate

**KẾ HOẠCH THỰC HIỆN**

· **File(s) cần sửa/tạo:** mặc định không sửa runtime; chỉ focused tests còn thiếu từ #111–#114 và `docs/verification/...` sau live smoke.

· **Hàm/phương thức thêm mới:** không có mặc định.

· **Logic chính:** chạy các cross-seam checks thật sự cần để bảo đảm các fix phối hợp đúng; đo plugin/Task policy boot timing thay vì đoán. Sau deploy, ghi exact `/build-meta.json` identity rồi smoke desktop + iPad/iPhone-sized viewport.

· **Rủi ro/phụ thuộc:** nếu verify-only risk fail, tạo task nhỏ riêng và quay lại Plan-first; không mở rộng #115 thành architecture/E2E framework mới. Nếu không truy cập Production được, ghi `Không thể xác nhận`.

**Focused cross-seam/Production smoke:**
- fresh load không treo plugin;
- raw Vietnamese prompt + assistant partial/final;
- pending follow-up question trả lời được;
- 2 queued prompts đúng order;
- Task list/create/update chọn đúng business tool domain;
- Approval deny không đổi data; allow-once đổi đúng một lần và UI đang mở refresh;
- Stop rồi prompt tiếp theo hoạt động;
- no raw infrastructure jargon trong primary UI;
- backend failure không giả empty;
- reload giữ durable state đúng thiết kế.

**Gate:** chờ `APPROVED/OK` trước mọi runtime fix phát sinh từ verification.

## Deferred theo YAGNI

- #116 concurrent Task lost-write: closed `not_planned`; reopen khi có reproduction/evidence.
- auto-scroll polish nếu native DSH chưa giải quyết và user thực sự gặp lỗi;
- midnight timer cho Home;
- MutationObserver performance optimization không có profile;
- multiple-approval architecture khi chưa reproduce;
- broad browser E2E framework;
- shared Task cache/store;
- DSH package-wave upgrade.

## Definition of Done

- #111, #112, #113, #114 được triển khai đúng plan đã duyệt và required GitHub `quality` pass.
- Mỗi PR chỉ đổi files cần thiết; generated artifacts qua producer.
- #115 có focused integration evidence và Production build identity, hoặc ghi rõ `Không thể xác nhận` nếu môi trường không cho phép.
