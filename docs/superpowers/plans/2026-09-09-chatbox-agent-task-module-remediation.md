# Chatbox Agent + Task Module — Remediation Plan v4 (Plan-first)

Tracking: #110. Audit: `docs/audit/2026-09-09-chatbox-agent-task-module-audit.md`.

## Quy tắc thực thi

- Research/reuse trước; không tự viết primitive DSH/Cordis/Makers/Store đã có.
- YAGNI/KISS; không gold-plating.
- Không code runtime trước `APPROVED/OK` cho từng task.
- Không mở rộng file/scope ngoài plan đã duyệt; nếu exact rc.6 contract buộc vượt scope thì dừng và re-plan.
- Chỉ thêm/run regression test trực tiếp cho lỗi đang sửa.
- Không package-wave upgrade DSH trong remediation này.
- Generated bundles chỉ đổi qua producer; không patch tay `public/plugins/...`.
- Production PASS cần live identity + smoke; CI/source không thay thế live evidence.

## Thứ tự canonical

`#111 → #112 → #113 → #114 → #115`

Audit vòng 4 **không đổi thứ tự**, nhưng mở rộng #111 từ “chat renderer/composer” thành **root/session/conversation composition** vì đây là prerequisite mới đã xác nhận.

---

# Task A — #111: DSH-native root/session/conversation/composer lifecycle

## KẾ HOẠCH THỰC HIỆN

· **File(s) cần sửa/tạo:** `packages/application-shell/src/client.tsx`; `scripts/prepare-dsh-web.mjs` nếu current root-suppression producer phải thay; `packages/application-shell/package.json` chỉ nếu exact rc.6 inject graph yêu cầu; `packages/application-shell/src/services.ts` chỉ nếu còn thin adapter; `tests/application-shell-contract.test.ts`; focused behavior test dự kiến `tests/support-conversation.test.ts`.

· **Hàm/phương thức thêm mới:** không mặc định thêm. Chỉ thin adapter quanh official rc.6 session/conversation face nếu slot/runtime injection không cho component gọi trực tiếp.

· **Logic chính:** trước hết khôi phục **official DSH render path** cần cho session + conversation. Current project đã remove shipped DSH root owner, trong khi exact rc.6 root sở hữu `sidebar`, `conversation`, `details`, `shell.overlay`; PQG root hiện không render các seats này. Implementation phải inspect exact rc.6 register/inject contracts và chọn phương án reuse nhỏ nhất: (A) PQG root re-declare/render official seats cần thiết trong product shell nếu được hỗ trợ; hoặc (B) preserve/reuse upstream AppFrame và đưa PQG surfaces vào official seam nếu A không khả thi. Sau khi seat graph đúng, reuse native `ui-conversation` cho transcript/queue/history/draft/send/cancel, `conversation.composer` cho normal composer + `ui-user-questions` takeover, và `ui-tool` cho tool lifecycle. Không tự viết New Session/session list/history/transcript assembler/question UI.

· **Rủi ro / phụ thuộc:** exact pinned `0.1.0-rc.6` là authority; không copy API `master`. Native composer cũng là takeover path của Approval, nên Task A phải xác nhận “một decision surface” contract nhưng **không sửa Task Approval policy** — policy vẫn ở #113. Current custom PQG navigation/Home phải giữ được; không được đổi sản phẩm thành giao diện DSH mặc định nếu chỉ cần recompose seats.

### Focused RED/GREEN

1. Root composition không còn structurally cắt official session/conversation seats cần thiết.
2. Fresh/no-current-session có official create/select session path; Support không rơi vào dead-end chỉ có disabled composer.
3. Prompt A running + B queued: queue riêng, không duplicate khi admitted.
4. Partial gắn đúng turn; tool-call/result hoặc tool-only turn vẫn visible.
5. Pending user-question takeover xuất hiện; answer settle đúng wait và same run tiếp tục.
6. Session A/B switch giữ per-session draft/question/transcript state.
7. Normal send, suggestion send và Stop dùng cùng usable-session eligibility; removed/one-shot không submit.
8. Cancel/error xong prompt sau vẫn hoạt động.
9. Prompt/open/cancel failure hiện concise Vietnamese business error; primary UI không lộ raw provider/runtime/Makers/MCP jargon.
10. Không xuất hiện hai Approval decision surfaces khi native composer path được phục hồi; nếu exact rc.6 composition tạo duplicate, dừng và re-plan phần presentation trước khi tiếp tục.

**Gate:** chờ `APPROVED/OK` trước code.

---

# Task B — #112: raw prompt + scoped PQG persona/context/time

## KẾ HOẠCH THỰC HIỆN

· **File(s) cần sửa/tạo:** `agents/_dsh-web-sidecar.ts`; `packages/application-shell/src/services.ts` chỉ phần wrapper còn tồn tại sau #111; `contracts.ts`/Task declarative context chỉ nếu official context seam cần; root `package.json/package-lock.json` chỉ nếu dùng `@deepseek-ai/dsh-time-context@0.1.0-rc.6`; focused `system-services`/sidecar prompt tests.

· **Hàm/phương thức thêm mới:** không mặc định thêm.

· **Logic chính:** authored user text phải được gửi nguyên văn qua native DSH path. Persona PQG tiếng Việt đặt ở preset/system-prompt seam; module guidance dùng official system-prompt/context scope. Nếu exact rc.6 time-context tương thích, mount đúng same-version package để hiểu “hôm nay/ngày mai”; không hardcode ngày. Guidance phân biệt `todo_write` là internal Agent checklist còn business “Công việc” chỉ dùng `pqg_task_*`.

· **Rủi ro / phụ thuộc:** preset hiện có thể phục vụ coding capability khác; không xóa `tool-todo`/coding capability tùy tiện. Context phải scope đúng session/module và không rò khi navigation đổi.

### Focused RED/GREEN

- durable/queued authored prompt đúng nguyên văn;
- persona/module context có hiệu lực nhưng không xuất hiện như user-authored text;
- context không rò khi đổi module/session;
- current time/timezone có authoritative seam cho temporal request nếu compatibility check pass;
- tool guidance không coi `todo_write` là PQG Task store.

**Gate:** chờ `APPROVED/OK` trước code.

---

# Task C — #113: Task write Approval + one decision surface + pending classification + invalidation

## KẾ HOẠCH THỰC HIỆN

· **File(s) cần sửa/tạo:** `packages/task-module/src/makers.ts`; `agents/_makers-mcp-permission.mjs` và/hoặc `_mcp-bridge.ts` chỉ phần metadata/gate cần thiết; `packages/task-module/src/client.tsx`; optional tiny `client-invalidation.ts`; `packages/application-shell/src/client.tsx/copy.ts` chỉ generic Approval/pending metric presentation; package/producer metadata chỉ nếu exact rc.6 tool/approval slot injection yêu cầu; focused permission/bridge/Task/Support tests.

· **Hàm/phương thức thêm mới:** chỉ declarative always-ask marker/rule nếu current permission contract chưa diễn đạt invariant; một Task invalidation source nhỏ nếu cần.

· **Logic chính:** `pqg_task_create/update` phải đi existing `tools/pre-execute → ask → Approval` theo Support v1 bất kể sandbox preset; list vẫn read-only. Sau #111, chọn **một** native/existing Approval decision surface — không giữ hai UI ra quyết định song song. Approval/tool outcome dùng Vietnamese business copy, không raw `mcp__`/Makers jargon. Dashboard không được coi mọi `pendingInteraction` là approval: reuse DSH classification để đếm approval thật, hoặc đổi copy thành generic “Đang chờ bạn” nếu product muốn tất cả pending. Successful settled Task write emit một invalidation; mounted Workspace/Home gọi existing refresh. Deny/error không mutate và không emit success invalidation.

· **Rủi ro / phụ thuộc:** không custom global approval registry để theo dõi session khác; reuse official session browsing/pending indicators đã khôi phục ở #111. Không Redux/Zustand/React Query/shared cache. Generic DSH `ui-tool` dùng trước; keyed Task view chỉ nếu generic primary presentation không đạt UX.

### Focused RED/GREEN

- read-only/workspace-write/danger-full-access: list đọc được; create/update đều `ask` theo v1;
- deny → Store unchanged;
- allow-once → đúng một mutation;
- đúng một Approval decision surface;
- question/plan-review không bị dashboard gắn nhãn approval;
- pending interaction session khác discoverable qua reused session UI;
- primary Approval/tool UI không raw wire/Makers jargon;
- Agent create/update success → mounted Workspace/Home refresh không reload;
- deny/error không false-success/false-invalidation;
- replay same settled call không unbounded refetch.

**Gate:** chờ `APPROVED/OK` trước code.

---

# Task D — #114: Task data correctness + Search + module/runtime consistency

## KẾ HOẠCH THỰC HIỆN

· **File(s) cần sửa/tạo:** `packages/task-module/src/service.ts`, `makers.ts`, `client.tsx`; `agents/api/pqg.tasks.ts`; `agents/api/pqg.modules.ts`; module state/lifecycle file chỉ nếu existing reconcile seam thật sự cần; `packages/application-shell/src/client.tsx/services.ts` chỉ Search error/debounce boundary; `middleware.ts`; optional Task date helper nếu dùng ở ≥2 boundary; focused Task/module/Search/product-UI tests.

· **Hàm/phương thức thêm mới:** validator ISO calendar date nhỏ nếu reuse; pagination helper chỉ khi code rõ hơn; một minimal “has mutable Task patch field” guard; debounce bằng existing React/timer primitive nếu RED test xác nhận request amplification — không dependency mới.

· **Logic chính:** paginate Store bằng `after:lastMessageId`, boundary 101 records; update dừng khi target found. Write chỉ nhận valid calendar `YYYY-MM-DD`/null/undefined; malformed legacy date vẫn đọc/sửa/clear được. **Id-only update phải reject trước Store write**; không cần reject same-value idempotent update. Task load error và empty state loại trừ nhau, gồm Workspace/Home/**Search**; fallback copy đúng operation. Search không silently biến provider failure thành valid-empty; nếu focused burst typing chứng minh mỗi keystroke gọi full Task list như source hiện tại, debounce nhỏ ở Shell search boundary để tránh pagination amplification. Policy transient bắt đầu bằng focused fail→success reproduction rồi reuse Cordis lifecycle bounded/idempotent nếu cần. Persisted module policy là source of truth; partial live propagation trả/reconcile trung thực. Bảo vệ user-authored PQG text khỏi global translation/hide observer bằng exclusion nhỏ.

· **Rủi ro / phụ thuộc:** không migration framework, polling framework, search index/cache framework, distributed transaction, pagination API riêng hay i18n rewrite. Không thêm multi-user tenancy do `TASK_CONVERSATION_ID` khi current product vẫn Personal v1 single-user.

### Focused RED/GREEN

- 101 Task list đủ, đúng order; update Task #101 `{completed:true}` thành công;
- repeated cursor không infinite loop;
- id-only PATCH/tool update reject, Store `updateMessage` không chạy;
- valid mutable patch vẫn chạy; same-value patch có thể thành công bình thường;
- reject `tomorrow`, `09/09/2026`, `2026-02-31`; accept valid leap date/null/omitted;
- malformed historical dueDate vẫn list và sửa/clear được;
- Home/Workspace GET failure không render `0 việc`/empty;
- Search provider failure không render “không có kết quả” như valid-empty;
- burst typing không tạo unbounded provider calls nếu debounce được chọn;
- GET/POST/PATCH fallback đúng thao tác;
- transient policy failure rồi recovery không duplicate contribution; explicit disabled vẫn disabled;
- policy persisted + one live-sidecar propagation failure có truthful response/reconcile semantics;
- authored exact `Plan`/`Preview` trong PQG content không bị dịch/ẩn.

**Gate:** chờ `APPROVED/OK` trước code.

---

# Task E — #115: focused integration + Production gate

## KẾ HOẠCH THỰC HIỆN

· **File(s) cần sửa/tạo:** mặc định không sửa runtime; chỉ focused tests còn thiếu từ #111–#114 và `docs/verification/...` sau live smoke.

· **Hàm/phương thức thêm mới:** không có mặc định.

· **Logic chính:** chạy cross-seam checks chứng minh các fixes phối hợp đúng; đo plugin/Task policy boot timing trước tối ưu. Sau deploy ghi exact `/build-meta.json`, rồi smoke desktop + iPad/iPhone-sized viewport. Verify-only risks chỉ được nâng thành task khi có reproduction.

· **Rủi ro / phụ thuộc:** không biến #115 thành browser-E2E framework/architecture workstream. Upstream pi-ai rc.6 max-token/retry/long-session reports chỉ được investigate nếu live symptom tương ứng reproduce. Mutable `sidecar.context` concurrency chỉ được sửa nếu focused concurrent queue/tool/Stop case chứng minh corruption.

### Focused cross-seam / Production smoke

- fresh load không treo plugin;
- **zero current session** vẫn có official create/select path;
- switch session A/B giữ scoped transcript/draft/pending state và pending interaction discoverable;
- raw Vietnamese prompt + assistant partial/final;
- pending follow-up question trả lời được;
- 2 queued prompts đúng order;
- Task list/create/update chọn đúng business tool domain;
- Approval deny không đổi data; allow-once đổi đúng một lần và UI đang mở refresh;
- không duplicate Approval surface;
- question/plan-review không bị gắn nhãn approval;
- Stop rồi prompt sau hoạt động;
- no raw infrastructure/provider jargon trong primary Support/Approval error path;
- Task/Search backend failure không giả empty;
- burst Search không page-fetch storm sau pagination;
- reload giữ durable state đúng thiết kế;
- measure policy/plugin boot timing trước mọi optimization.

Nếu không truy cập Production được: ghi **Không thể xác nhận**, không suy diễn từ CI.

**Gate:** chờ `APPROVED/OK` trước mọi runtime fix phát sinh từ verification.

---

## Deferred theo YAGNI

- #116 concurrent Task lost-write: closed `not_planned`; reopen khi có reproduction/evidence.
- multi-user tenancy redesign cho fixed Task Store conversation id khi current product là Personal v1 single-user.
- mutable sidecar-context isolation khi chưa reproduce functional corruption.
- DSH/pi-ai package-wave upgrade do upstream discussion nhưng PQG chưa reproduce.
- Task Search deep-link/focus exact row cho tới khi Search acceptance yêu cầu entity focus.
- midnight timer cho Home.
- MutationObserver performance optimization không có profile.
- multiple-approval architecture khi native session indicators đã đủ và chưa reproduce gap.
- broad browser E2E framework.
- shared Task cache/store hoặc search index.

## Definition of Done

- #111, #112, #113, #114 triển khai đúng plan đã duyệt, mỗi PR có root-cause-focused regression và required GitHub `quality` pass.
- Mỗi PR chỉ đổi files cần thiết; generated artifacts qua producer.
- Không tự viết session/conversation/question/approval primitives DSH đã có.
- #115 có focused integration evidence và Production build identity + smoke, hoặc ghi rõ `Không thể xác nhận` nếu môi trường không cho phép.