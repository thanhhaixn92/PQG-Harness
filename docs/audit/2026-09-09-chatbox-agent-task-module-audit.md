# Audit Chatbox Agent + module Công việc — vòng 4 — 2026-09-09

Tracking: #110. Baseline runtime: `main` sau PR #103/#104. Canonical remediation plan: `docs/superpowers/plans/2026-09-09-chatbox-agent-task-module-remediation.md`.

## 1. Nguyên tắc audit

- Research/reuse trước khi đề xuất code mới; ưu tiên DSH/Cordis/Makers/Store đã có.
- YAGNI/KISS; không tạo framework mới để chữa lỗi cục bộ.
- Chỉ nâng thành finding khi có bằng chứng source/spec/contract đủ rõ; phần chưa chứng minh để `verify-only`.
- Generated DSH bundle chỉ dùng để xác minh exact pinned `0.1.0-rc.6`; implementation phải sửa producer/source, không patch tay `public/plugins/...`.
- Chỉ test regression trực tiếp; required GitHub `quality` là merge gate cuối.
- Không runtime code trước khi plan task tương ứng được `APPROVED/OK`.
- Production chỉ PASS khi có exact deployed build identity + live smoke; source/CI không thay thế được live evidence.

### Phạm vi đã rà vòng 4

Ngoài phạm vi vòng 3, audit thêm:

- exact generated `@deepseek-ai/dsh-client-ui-layout@0.1.0-rc.6`;
- exact generated `ui-sidebar`, `ui-conversation`, `ui-user-questions` rc.6;
- root/slot ownership tests trong `tests/application-shell-contract.test.ts`;
- Search provider/cost/error path;
- Task empty-update semantics qua HTTP + Makers + service;
- Home pending-interaction metric;
- multi-session/session-entry discoverability;
- sidecar mutable request-context handoff;
- upstream `dsh-llm-pi-ai` rc.6 failure reports chỉ ở mức verify-only nếu chưa reproduce trên PQG.

---

## 2. Kết luận ưu tiên

### P0 — blocker cho Support Agent/Task MVP

| ID | Vấn đề | Tracking |
|---|---|---|
| F-01 | Support tự ghép `nodes + queue + partial`, sai ownership conversation lifecycle | #111 |
| F-02 | Support dùng custom textarea, không mount `conversation.composer`; pending question có thể không có đường trả lời | #111 |
| F-03 | Tool call/result/non-text bị mất khỏi custom transcript | #111 |
| F-04 | Persona/module context bị nối vào authored user message | #112 |
| F-05 | Preset hiện là coding agent; `todo_write` overlap ngữ nghĩa với business `pqg_task_*` | #112 |
| F-06 | “hôm nay/ngày mai” thiếu authoritative runtime time context | #112 |
| F-07 | `pqg_task_create/update` auto-allow ở default `workspace-write`, trái Support v1 Approval acceptance | #113 |
| F-08 | Approval primary UI có thể lộ raw tool/wire/Makers terminology | #113 |
| F-09 | Agent write thành công nhưng mounted Task Workspace/Home không refresh | #113 |
| **F-17** | **PQG đã loại shipped DSH root owner và không render lại native `sidebar/conversation/...` seats; các plugin conversation/composer/question/session đã cài nhưng normal mount path bị cắt** | **#111** |

### P1 — correctness / UX truthfulness / bounded cost

| ID | Vấn đề | Tracking |
|---|---|---|
| F-10 | Task service chỉ đọc tối đa 100 record | #114 |
| F-11 | `dueDate` write không enforce ngày thật `YYYY-MM-DD`; legacy malformed cần đọc an toàn | #114 |
| F-12 | Task load failure có thể bị trình bày như empty/0 | #114 |
| F-13 | `taskRequest()` fallback lỗi không đúng GET/POST/PATCH | #114 |
| F-14 | Module policy transient failure có thể thành permanent-disabled trong page lifetime | #114 |
| F-15 | Module toggle persist trước, propagate sau; partial propagation có thể trả 503 dù state đã đổi một phần | #114 |
| F-16 | Global localization MutationObserver có thể dịch/ẩn user-authored PQG text | #114 |
| **F-18** | **PATCH/`pqg_task_update` chỉ có `id` vẫn trả success dù không có mutable field nào** | **#114** |
| **F-19** | **Home metric coi mọi `pendingInteraction` là “phê duyệt”, dù DSH còn có question/plan-review** | **#113** |
| **F-20** | **Search vừa false-empty khi provider lỗi, vừa gọi full Task load trên mỗi keystroke; sau pagination có thể khuếch đại Store reads** | **#114** |
| **F-21** | **Support suggestion eligibility không dùng cùng predicate với send/composer: removed/one-shot snapshot vẫn có thể click suggestion** | **#111** |
| **F-22** | **Support primary UI/notification có thể hiện raw runtime/provider error strings** | **#111** |

### Verify-only / deferred

| ID | Rủi ro | Quyết định |
|---|---|---|
| V-01 | Store-only module tool vẫn đi qua sandbox cancellation scope | reproduce Stop-during-write trước khi sửa |
| V-02 | Home không tự rollover “hôm nay” qua nửa đêm | defer YAGNI |
| V-03 | MutationObserver perf cost | profile nếu live còn chậm |
| V-04 | Nhiều approval đồng thời | chỉ scope nếu reproduce |
| V-05 | UI + Agent concurrent Task update có thể lost-write | #116 closed `not_planned`; reopen khi có evidence |
| V-06 | DSH version mới có cải tiến | không package-wave upgrade trong remediation |
| **V-07** | **`TASK_CONVERSATION_ID` cố định có thể thành tenancy concern nếu sản phẩm multi-user** | current product là Personal v1 single-user; không thêm tenancy framework |
| **V-08** | **Live sidecar giữ mutable `sidecar.context`, các request cùng conversation có thể overwrite context trước tool/Gateway read** | structural risk có thật nhưng chưa có functional corruption; chỉ reproduce concurrent request/Stop nếu còn anomaly |
| **V-09** | **Upstream rc.6 `dsh-llm-pi-ai` có report replay-state lỗi sau max-token + tool-call truncation** | chỉ kiểm tra nếu PQG reproduce; không quy kết symptom hiện tại và không upgrade package wave |
| **V-10** | **Upstream pi-ai có reports liên quan retry/long-session streaming cost** | chỉ profile/reproduce khi live evidence yêu cầu |

---

## 3. Findings P0 chi tiết

### F-01/F-03 — Support đang làm lại việc của DSH conversation

`SupportContent` lấy text từ durable nodes, append queue thành user rows, rồi append partial. Queue là transient pending-next-turn projection, không phải durable transcript. Renderer cũng bỏ tool call/result, structured/non-text content và lifecycle mà `ui-tool`/`ui-conversation` đã sở hữu.

**Decision:** #111 bỏ transcript assembler; reuse exact rc.6 conversation projection/render path.

### F-02 — pending user-question có thể bị kẹt

Prepared app có `ui-user-questions`; exact rc.6 dùng `conversation.composer` takeover và trả structured answer vào chính pending wait. Custom PQG textarea chỉ tạo một prompt mới, không settle wait đó.

**Decision:** #111 reuse native composer chain; không viết custom question UI.

### F-17 — root slot graph đã bị cắt, đây là root cause architecture mới của vòng 4

Current contract test chủ động xác nhận Makers patch **remove shipped DSH root owner** và yêu cầu PQG là root registration duy nhất. Exact generated rc.6 `AppFrame` gốc lại là owner khai báo/render:

- `sidebar`;
- `conversation`;
- `details`;
- `shell.overlay`.

Exact rc.6 `ui-sidebar` có New Session và workspace/session browsing. PQG root hiện chỉ khai báo các `pqg.shell.*` seats, không render native `sidebar/conversation`. Vì slot declaration/ownership bị cắt, việc boot graph vẫn chứa `ui-conversation`, `ui-user-questions`, `ui-approval`, `ui-sidebar` **không đảm bảo các UI này có normal render path**.

Hậu quả thực tế cần coi là P0:

- native conversation/composer/tool/question không thể chỉ “tự xuất hiện” vì plugin đã cài;
- fresh state không có current session có thể rơi vào dead-end: Support disabled nhưng official New Session/session browsing cũng không được PQG root expose;
- pending interaction ở session khác khó discover;
- thay riêng textarea/transcript mà không sửa root composition vẫn có thể thất bại.

**Decision #111 — reuse first:**

1. inspect exact rc.6 root/slot/inject contracts trước code;
2. ưu tiên để PQG product shell **re-declare/render các official seats cần thiết** (`conversation` và official session-browsing surface) nếu rc.6 hỗ trợ composition này;
3. nếu không khả thi, preserve/reuse upstream AppFrame và đưa PQG surfaces vào seam chính thức thay vì tự viết session manager;
4. tuyệt đối không tự viết New Session/session list/history/composer/tool lifecycle;
5. vì native composer còn là takeover path của Approval, #111 phải làm rõ single-decision-surface contract để #113 không tạo approval UI trùng.

### F-04 — authored prompt không còn nguyên văn

`promptSupport()` ghép persona/module copy + yêu cầu người dùng rồi gửi tất cả dưới role user. Queue/durable authored message vì vậy sai semantic ownership.

**Decision:** sau #111, authored text raw qua native send. #112 đưa persona/context vào official system-prompt/context seam.

### F-05/F-06 — persona/tool-domain/time

- Sidecar persona vẫn coding-centric.
- `todo_write` là internal Agent checklist, không phải PQG business Task.
- Task UX cho phép temporal wording nhưng sidecar chưa có authoritative time context.

**Decision:** #112 sửa persona/tool guidance; chỉ mount exact same-version `dsh-time-context@0.1.0-rc.6` sau compatibility check. Không hardcode ngày, không gỡ `tool-todo` chỉ vì overlap nếu còn consumer hợp lệ.

### F-07/F-08/F-09 — write Approval + presentation + invalidation

Task create/update đang `workspace-write`; current default permission cũng `workspace-write`, nên gate auto-allows. Custom Approval view còn render raw tool/reason. Agent mutation thành công không invalidates Task local surfaces.

**Decision:** #113 reuse existing `tools/pre-execute → ask → Approval`; business Vietnamese presentation; một Task-owned invalidation source nhỏ. Không tạo approval framework/shared cache.

---

## 4. Findings P1 chi tiết

### F-10 — hard ceiling 100

Service chỉ `getMessages(limit:100)` một lần; list/update không thấy record #101 trở đi.

**Decision:** cursor `after:lastMessageId`, order asc, repeated-cursor guard; update dừng khi tìm thấy. Boundary test 101 records là đủ.

### F-11 — dueDate invariant

HTTP/Makers/service chấp nhận string tùy ý nhưng UI/Home assume calendar ISO.

**Decision:** write chỉ `undefined | null | valid calendar YYYY-MM-DD`; malformed stored legacy vẫn visible và sửa/clear được. Không migration framework.

### F-12/F-13 — false-empty và wrong-operation error

Home/Workspace có đường lỗi để state rỗng rồi trình bày như không có data; generic request fallback dùng cùng một message.

**Decision:** error/empty mutually exclusive; copy theo operation.

### F-18 — empty Task patch vẫn “success”

`pqg_task_update` schema chỉ bắt buộc `id`; HTTP PATCH cũng vậy. `updateTask()` với empty patch vẫn gọi `updateMessage()` bằng content cũ và trả Task thành công.

Điều này đặc biệt nguy hiểm với Agent: model có thể phát tool call thiếu field thay đổi nhưng nhận successful tool result rồi nói người dùng “đã cập nhật”.

**Decision #114:** service là invariant cuối: phải có ít nhất một explicit mutable field trong `title | completed | dueDate`. HTTP/Makers reject id-only và Store không được gọi update. Không cần cấm same-value idempotent update — chỉ cấm empty patch.

### F-14/F-15 — module lifecycle/state truthfulness

Transient module-policy error currently maps to false/return; toggle persists rồi fan-out runtime propagation nên không có atomic rollback thật.

**Decision:** focused fail→success reproduction trước; reuse Cordis lifecycle nếu cần. Persisted policy là source of truth; partial runtime propagation phải được trả/reconcile trung thực.

### F-16 — localization chạm user data

Global exact-text translation/hide chạy trên DOM và exclusions chưa bảo vệ chắc chắn PQG authored content.

**Decision:** thêm exclusion nhỏ vào PQG user-content regions; không rewrite i18n.

### F-19 — pending interaction bị gọi sai là approval

Home dashboard đang tính `approvalCount` bằng `pendingInteraction == null ? 0 : 1`. DSH phân biệt approval, ordinary question và plan review. Khi #111 khôi phục native question flow, metric này sẽ báo sai nhiều hơn.

**Decision #113:** reuse DSH pending classification. Hoặc chỉ đếm approval thật, hoặc đổi metric thành copy generic “Đang chờ bạn” nếu product muốn tổng mọi pending interaction. Không tạo pending-state store khác.

### F-20 — Search false-empty + request amplification

`SearchSurface` search mỗi query change; Task provider gọi `loadTasks()` toàn bộ mỗi lần. `services.search()` lại `Promise.allSettled` rồi silently drop provider failure; khi Task provider lỗi, UI có thể hiện “không có kết quả” như một empty hợp lệ. Sau F-10 pagination, một burst gõ có thể nhân số Store pages cần đọc.

**Decision #114:**

- Search phải phân biệt failure với valid-empty;
- thêm debounce nhỏ tại shell search boundary nếu focused test chứng minh burst typing gọi provider liên tục như source hiện tại; dùng timer effect hiện có, không dependency/cache/index framework;
- stale result guard vẫn giữ;
- không xây search backend/index riêng.

### F-21 — suggestion/session eligibility lệch nhau

`unavailable` coi removed/one-shot là unusable, nhưng suggestion button chỉ disable khi `snapshot === undefined || busy`. Vì vậy removed/one-shot vẫn có thể click suggestion rồi đi vào `promptSupport()`.

**Decision #111:** native composer/session eligibility là một source-of-truth cho send + suggestions + stop. Không vá riêng custom button trước rồi bỏ ở cùng remediation.

### F-22 — raw runtime error ở primary UI

Support render trực tiếp `promptError.error.message`, `lastAgentError`, `openError.message`; service cũng throw raw receipt message và notification dùng lại message đó.

**Decision #111:** primary UI dùng concise Vietnamese business error + recovery state; diagnostics/raw provider/runtime details chỉ ở native diagnostic surface nếu có. Không dựng taxonomy framework lớn.

---

## 5. Những giả thuyết đã loại bỏ / chưa được phép sửa

- Queue send while running là DSH-supported behavior; không disable để che bug.
- Current custom textarea không có Enter-submit, nên chưa có IME Enter bug để vá.
- Current draft chỉ clear sau successful prompt receipt; chưa có evidence admission failure làm mất draft.
- `localDateKey()` dùng browser local date, không phải UTC conversion bug.
- Task client thiếu `makers-conversation-id` là intentional current page-bootstrap design theo test; chưa có evidence lỗi.
- Direct `/api/pqg.tasks` khi module disabled chưa có product policy yêu cầu block.
- `TASK_CONVERSATION_ID` cố định **không** được nâng thành multi-user leak ở current Personal v1 single-user scope.
- Mutable `sidecar.context` là structural concurrency risk nhưng chưa chứng minh cross-request corruption; chưa code isolation.
- Không quy kết upstream `dsh-llm-deepseek` continuation bug cho PQG vì PQG dùng `dsh-llm-pi-ai`.
- Upstream pi-ai rc.6 max-token/retry/long-session reports không đủ để package-wave upgrade; chỉ verify khi reproduce.
- Task search click chưa deep-link/focus đúng task row: UX P2, defer đến khi Search acceptance yêu cầu entity-focus.
- Concurrent lost-update vẫn #116 `not_planned`.

---

## 6. Canonical remediation order sau vòng 4

Không đổi thứ tự, nhưng **mở rộng đúng root cause của #111**:

1. **#111 — native root/session/conversation composition + composer/queue/tool/question lifecycle.**
2. **#112 — raw authored prompt + scoped PQG persona/module/time/tool-domain guidance.**
3. **#113 — Task write Approval invariant + one decision surface + pending classification + invalidation.**
4. **#114 — pagination/date/empty-update/error/Search/localization + module activation/reconcile correctness.**
5. **#115 — focused cross-seam + Production verification.**

#116 tiếp tục closed `not_planned`.

### Tại sao #111 vẫn đứng đầu

F-17 cho thấy native root slot graph là prerequisite của F-01/F-02/F-03. Nếu sửa prompt/persona/Approval trước khi conversation/session seats có render path chuẩn, ta sẽ tạo adapter/code tạm và dễ phải bỏ ngay sau đó — trái YAGNI.

---

## 7. Focused test delta vòng 4

### #111 bổ sung

- root composition không còn structurally cắt official conversation/session seats cần thiết;
- fresh/no-current-session có official create/select path, không chỉ disabled Support;
- switch session A/B giữ scoped draft/pending state;
- suggestion/send/stop dùng cùng usable-session predicate;
- prompt/open/cancel failure không lộ raw infra/provider jargon ở primary UI.

### #113 bổ sung

- native composer Approval + PQG Approval không tạo hai decision surfaces;
- question/plan-review không bị dashboard đếm là approval;
- pending interaction session khác discoverable qua reused session UI, không custom global approval registry.

### #114 bổ sung

- id-only Task update reject và Store update không chạy;
- Search backend/provider failure không render valid-empty;
- burst query không tạo unbounded provider calls; focused debounce behavior nếu source fix dùng debounce.

### #115 bổ sung live smoke

- fresh page không có current session vẫn tạo/chọn session được;
- session switch + pending interaction discoverability;
- raw error redaction/business copy;
- Search failure/typing cost không regress;
- nếu live max-token + tool-call reproduce replay-state issue thì track upstream-specific task riêng, không nhét package upgrade vào #115.

---

## 8. Definition of Done của audit/remediation

- #111–#114 mỗi issue có một root-cause-focused RED reproduction trước implementation.
- Không custom chat/session/question/approval runtime khi DSH rc.6 đã có primitive tương ứng.
- Không shared Task cache, search index, tenancy framework, distributed transaction hoặc package-wave upgrade nếu chưa có evidence.
- Generated artifact chỉ thay đổi qua producer.
- Required GitHub `quality` pass từng PR.
- #115 chỉ đóng khi có cross-seam evidence và Production identity/smoke; nếu không truy cập live được thì ghi `Không thể xác nhận`.