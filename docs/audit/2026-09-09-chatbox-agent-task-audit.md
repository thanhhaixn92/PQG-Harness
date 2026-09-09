# Audit Chatbox Agent + mô-đun Công việc — 09/09/2026

## 1. Phạm vi và baseline

- Repository: `thanhhaixn92/PQG-Harness`.
- Baseline audit: `main@e945004d1c8484f7c58b0755d0ee126371bd9981`.
- Phạm vi: Application Shell/Support Agent, DSH session/conversation, MCP/module tool lifecycle, Task UI/API/Store/Makers tools, test/CI và các PR gần nhất liên quan.
- Không coi các PR đang mở là đã sửa xong. Đặc biệt PR #107 đang **FAIL quality**.
- Audit ưu tiên tái sử dụng seam chính thức của DeepSeek Harness/Cordis/MCP và EdgeOne Makers; không đề xuất thêm agent framework, permission engine hoặc database thứ hai.

### Nguồn đối chiếu bên ngoài

1. DeepSeek Harness Web Client architecture: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-client.md
2. DeepSeek Harness Conversation subsystem: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/conversation.md
3. DeepSeek Harness `ui-tool`: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-tool/README.md
4. EdgeOne Makers Conversation Storage: https://pages.edgeone.ai/document/agents-conversation-storage
5. EdgeOne Makers Agent quick start / `Makers-Conversation-Id`: https://pages.edgeone.ai/document/agents-quick-start

> Lưu ý version: repository hiện pin DSH `0.1.0-rc.6`. Tài liệu upstream hiện tại dùng để xác định **ranh giới kiến trúc và hướng tái sử dụng**; khi triển khai phải kiểm tra seam/API thực tế của rc.6 trước khi dùng, không copy API từ `master` một cách mù quáng.

## 2. Kết luận điều hành

Hiện trạng không phải một lỗi đơn lẻ của chatbox. Có ba cụm nguyên nhân gốc liên kết với nhau:

1. **Support Agent đang tự dựng transcript từ internals của `ConversationSnapshot` thay vì dùng lớp Conversation/Tool UI của DSH.** Các commit liên tiếp sửa rồi revert carrier transcript và PR #107 lại đổi sang một carrier khác là bằng chứng coupling này không ổn định.
2. **Support Agent không có persona sản phẩm nhất quán.** Sidecar vẫn là coding agent tiếng Anh; câu lệnh tiếng Việt chỉ được nhét vào user prompt khi đang ở module có support context. Vì vậy câu trả lời tiếng Anh/generic và hành vi thiên về coding/hướng dẫn là phù hợp với code hiện tại.
3. **Task backend và Task client có các lỗi dữ liệu/state độc lập:** chỉ đọc tối đa 100 message đầu tiên, activation fail-silent một lần lúc boot, Home che giấu lỗi thành “0 việc”, và các surface giữ cache riêng nên thay đổi do Agent không phản ánh ngay vào Workspace/Home.

Ngoài ra PR #107 có ý tưởng session recovery đúng hướng nhưng **không thể merge hiện tại** vì full CI đang đỏ và PR vẫn giữ cách đọc raw snapshot internals.

## 3. Ma trận phát hiện

| ID | Mức | Khu vực | Trạng thái | Tóm tắt |
|---|---|---|---|---|
| AG-01 | P0 | Agent/session | Confirmed | Session Support stale không recovery trên `main`; PR #107 chỉ sửa một phần và CI đỏ |
| AG-02 | P0 | Conversation UI | Confirmed architectural defect | Chatbox tự đọc raw `ConversationSnapshot` thay vì dùng DSH Conversation/Tool presentation |
| TK-01 | P0 | Task Store | Confirmed | Chỉ lấy 100 message đầu; task thứ 101+ biến mất khỏi list và không update được |
| AG-03 | P1 | Persona/language | Confirmed | Persona nền là coding agent tiếng Anh; rule tiếng Việt chỉ có khi có module context |
| AG-04 | P1 | Prompt semantics | Confirmed | Internal Support instructions được ghép vào chính user message |
| AG-05 | P1 | Session lifecycle | Confirmed | Không có active session => Support không tự bảo đảm một session usable |
| AG-06 | P1 UX | Chatbox state | Confirmed | Desktop >=1440px tự `expanded` khi load; explicit open trên desktop lại vào `compact` |
| AG-07 | P1 | Tool/approval UX | Confirmed gap | Chat UI không render tool-call/tool-result; approval chờ không được giải thích trong luồng chat |
| TK-02 | P1 | Module activation | Confirmed | `taskModuleEnabled()` fail-silent; một lỗi GET lúc boot có thể giấu Task đến reload |
| TK-03 | P1 | Client state | Confirmed | Workspace/Home giữ state riêng; Agent tool mutation không invalidate/revalidate |
| TK-04 | P1 | Error UX | Confirmed | Home nuốt lỗi load và có thể hiển thị sai “0 việc” |
| TK-05 | P1 | Validation | Confirmed | API/MCP/service chấp nhận `dueDate` là chuỗi bất kỳ |
| TK-06 | P1/P2 | Concurrency | Confirmed risk | `updateTask` read-modify-write toàn metadata; concurrent patch khác field có thể lost update |
| OP-01 | P1 | Observability | Confirmed | Makers adapter lỗi bị rollback/silently removed, thiếu diagnostic module id |
| CI-01 | P0 gate | PR #107 | Confirmed | `quality` fail: Task activation integration test 0 != 1 |
| QA-01 | P1 | Test coverage | Confirmed | Thiếu runtime integration tests cho Agent→tool→Store→UI, pagination, language, recovery |
| GOV-01 | P2 | GitHub governance | Confirmed | #77/#78 đóng dù exit checklist trong issue vẫn chưa được đánh dấu hoàn tất |
| TK-07 | P2 | MVP scope | Incomplete/ambiguous | Exit criteria nói CRUD nhưng Task chưa có delete; scope text lại chỉ yêu cầu create/edit/complete |

## 4. Phân tích chi tiết — Chatbox / Support Agent

### AG-01 — stale Support session không recovery trên `main` — P0

**Bằng chứng**

`packages/application-shell/src/services.ts` trên `main` lấy current DSH session và gọi `session.prompt(..., 'queue')`. Nếu receipt lỗi thì throw trực tiếp; không reconnect/rebind.

PR #107 thêm `IWorkspaces.connectWorkspace()` và retry một lần khi message chứa `not found`. Hướng dùng DSH workspace/session có cơ sở, nhưng PR chưa đạt release gate.

**Ảnh hưởng**

- Runtime reset/sidecar reset/Host loại session có thể khiến chatbox tiếp tục hiển thị nhưng gửi tin thất bại.
- Người dùng thấy “đang xử lý”, lỗi hoặc khung không có câu trả lời dù UI Shell vẫn hoạt động.

**Không nên làm**

- Không tạo Agent backend/session store thứ hai.
- Không retry vô hạn.

### AG-02 — chatbox coupling trực tiếp với raw `ConversationSnapshot` — P0

**Bằng chứng**

`packages/application-shell/src/client.tsx` tự duyệt `snapshot.nodes`, `snapshot.queue`, `snapshot.partial` và tự dựng bubble chat. Lịch sử gần nhất có chuỗi:

- fix canonical chat nodes;
- revert canonical chat nodes;
- PR #107 lại chuyển sang `snapshot.chat.legacy.nodes`.

Upstream DSH phân định rõ: `ui-conversation` sở hữu assembly/replay/Chat ordering; `ui-tool` sở hữu call/result pairing và rendering tool tree. Business UI không nên tự rebuild transcript/tool topology.

**Ảnh hưởng**

- Rất dễ mất transcript sau thay đổi carrier/version.
- Tool-only turn không có text có thể trông như “Agent không làm gì”.
- Tự ghép queue/partial/durable nodes có nguy cơ duplicate hoặc ordering lệch.
- Mỗi lần upstream đổi internals lại phát sinh hotfix/revert.

**Kết luận**

Đây là lỗi kiến trúc quan trọng nhất của chatbox. Cần giữ shell/panel PQG nhưng giao transcript + tool lifecycle cho seam native/version-locked của DSH rc.6.

### AG-03 — persona sản phẩm và ngôn ngữ mâu thuẫn — P1

**Bằng chứng**

`agents/_dsh-web-sidecar.ts` ghi preset persona: `You are a coding agent running on EdgeOne Makers...` và tập trung file/command/preview.

Trong khi `packages/application-shell/src/services.ts` chỉ thêm câu `Bạn là Trợ lý hỗ trợ của PQG Harness. Hãy trả lời bằng tiếng Việt.` khi `support context` khác `undefined`.

Ở Home hoặc khu vực không có support provider, user text được gửi nguyên bản, không có rule tiếng Việt ở lớp Support.

**Ảnh hưởng**

- Có thể trả lời tiếng Anh ở Home/global Support.
- Có thể ưu tiên mindset coding agent thay vì trợ lý văn phòng/công việc.
- Model có thể hướng dẫn thao tác thay vì gọi `pqg_task_*`.

### AG-04 — internal instruction bị biến thành user message — P1

`promptSupport()` ghép persona/context/capability instruction và câu user vào một text duy nhất rồi gửi bằng `session.prompt()` như user content.

**Ảnh hưởng**

- Transcript semantic không còn phản ánh đúng điều người dùng đã nhập.
- Context nội bộ bị lẫn vào history hội thoại.
- Khó test chính xác “user said X” và khó reuse transcript cho UI khác.

**Hướng đúng**

Dùng persona/system/context seam của DSH/Cordis ở lớp runtime; user message phải giữ nguyên. Nếu rc.6 không có dynamic system-context seam phù hợp, đặt adapter ở model/request layer, không biến instruction thành nội dung user-visible.

### AG-05 — Support không bảo đảm active usable session — P1

`supportSession()` chỉ trả current session nếu `sessions.list.current` tồn tại. Nếu không có current session, composer trở thành unavailable/throw.

PR #107 chỉ recovery sau khi đã có một stale session id; chưa giải quyết đầy đủ fresh/no-current-session.

### AG-06 — trạng thái mở chatbox không đúng UX — P1 UX

`initialSupportState()` hiện tại:

- `<1200`: collapsed;
- `1200..1439`: compact;
- `>=1440`: expanded.

Vì vậy desktop lớn tự mở chatbox khi tải trang. Đây là logic hiện hữu, không phải model behavior.

Ngoài ra nút Support trên desktop đang mở từ collapsed sang `compact`, trong khi `compact` ẩn cả transcript/composer; người dùng phải mở thêm lần nữa để chat đầy đủ.

### AG-07 — thiếu tool/progress/approval presentation trong chat — P1

Chatbox chỉ render user/assistant text. Không render tool call/result/progress. Approval có surface riêng nhưng Support không cho biết run đang chờ approval hoặc cung cấp CTA tới khu vực Phê duyệt.

Với action auto-allowed, đây chủ yếu là observability. Với action cần approval, người dùng dễ hiểu nhầm Agent bị treo.

## 5. Phân tích chi tiết — mô-đun Công việc

### TK-01 — giới hạn 100 task gây mất dữ liệu khỏi view/update — P0

`packages/task-module/src/service.ts`:

```ts
context.store.getMessages({
  conversationId: TASK_CONVERSATION_ID,
  limit: 100,
  order: 'asc',
})
```

Chỉ gọi một lần, không dùng cursor.

Tài liệu EdgeOne Makers xác nhận `getMessages` giới hạn tối đa 100 item/lần và hỗ trợ cursor `after`/`before`; một conversation có thể chứa tới 10.000 messages.

**Hệ quả chính xác**

- Task 101+ vẫn có thể được append vào Store nhưng `listTasks()` chỉ trả 100 task đầu.
- `updateTask()` cũng tìm current task trong cùng 100 message đầu, nên task 101+ sẽ báo not found.
- Home/Search/Agent list cùng bị thiếu task mới khi vượt ngưỡng.

Đây là defect dữ liệu/chức năng, phải sửa trước khi mở rộng module.

### TK-02 — activation fail-silent một lần — P1

`taskModuleEnabled()` fetch `/api/pqg.modules`; mọi lỗi/network/store exception đều `catch { return false }`. `apply()` kiểm tra đúng một lần rồi return vĩnh viễn cho vòng đời plugin.

Một transient failure khi boot có thể làm:

- sidebar không có Công việc;
- workspace không register;
- Home widget không register;
- search/support provider không register;

cho tới khi reload.

Đây là một root cause hợp lý cho hiện tượng “mở Công việc nhưng không thấy UI”; browser Production cần smoke lại sau khi sửa.

### TK-03 — state phân mảnh và stale sau Agent mutation — P1

- `TaskWorkspace` load tasks một lần khi mount.
- `TaskHomeWidget` load tasks một lần khi mount.
- Search gọi `loadTasks()` riêng khi search.
- UI mutation chỉ sửa local state của Workspace.
- Agent mutation qua `pqg_task_create/update` không phát invalidation tới Workspace/Home.

Backend là một nguồn Store, nhưng browser có nhiều bản sao state không được đồng bộ. Kết quả: Agent có thể tạo thành công trong Store nhưng người dùng vẫn không thấy task cho tới reload/remount; Search có thể thấy dữ liệu mới trong khi Home/Workspace cũ.

### TK-04 — Home che giấu lỗi thành empty state — P1

`TaskHomeWidget` khi `loadTasks()` reject chỉ `setLoaded(true)` và không lưu error. UI sau đó có thể hiện `0 việc` / `Không có việc đến hạn hôm nay.`

Đây là false-success UX và làm chẩn đoán Production khó hơn.

### TK-05 — `dueDate` không được validate — P1

- Service: trim string, không kiểm tra `YYYY-MM-DD` hoặc ngày hợp lệ.
- API: type string.
- Makers tool schema: `z.string().optional()/nullable()`.

UI `<input type="date">` không bảo vệ call từ Agent/API. Một `dueDate="tomorrow"` hoặc `2026-99-99` có thể được lưu; Home so sánh equality với local `YYYY-MM-DD` nên task đó âm thầm không vào danh sách hôm nay.

### TK-06 — lost update khi UI và Agent sửa cùng task — P1/P2

`updateTask()`:

1. đọc current message;
2. merge patch trong application memory;
3. `updateMessage()` với full content + full metadata.

EdgeOne Store `updateMessage` là overwrite message; conversation metadata mới là shallow merge. Không thấy CAS/conditional update trong API generic đã nghiên cứu.

Nếu UI và Agent cùng đọc cùng một current state rồi sửa hai field khác nhau, write sau có thể ghi đè field mà write trước vừa thay đổi.

**Không được khắc phục bằng in-process mutex và coi là atomic**, vì Makers runtime có thể scale nhiều instance. Cần một design spike về CAS/transaction thực tế của Store version đang dùng; nếu không có, dùng mutation/event journal hoặc mô hình lưu trữ có semantics merge rõ ràng.

### TK-07 — delete chưa có, tiêu chí MVP không nhất quán — P2

Issue #78 nói scope `create/edit/complete`, nhưng exit criterion dùng cụm `Task CRUD`. Code hiện tại không có delete API/service/Makers tool/UI.

Không coi đây là runtime blocker, nhưng trước khi gọi MVP hoàn tất phải chốt một định nghĩa và phản ánh vào acceptance test.

## 6. MCP/module lifecycle và observability

### OP-01 — adapter lỗi bị silent rollback — P1

`agents/_module-adapters.ts` bắt lỗi khi import/apply Makers adapter, `removeModule(module.id)` rồi tiếp tục, không có structured diagnostic đủ rõ cho operator/user.

Điều này bảo vệ core MCP bridge không crash — đúng. Nhưng nếu riêng Task adapter lỗi, `pqg_task_*` biến mất; Agent vẫn chạy và rất dễ rơi về câu trả lời generic. Vì vậy cần giữ rollback isolation nhưng thêm log/health evidence theo module id.

### Những phần đã kiểm tra và **không phải lỗi hiện tại**

1. **Không thiếu `Makers-Conversation-Id` trong Task fetch.** Page bootstrap hiện globally inject conversation routing cho same-origin `/api` và `/rpc`; test hiện tại cũng khóa contract này. Không nên thêm header thủ công vào từng Task request.
2. Module policy được apply vào MCP bridge trước khi installed Makers adapters register; lifecycle `enable/disable` hiện đúng hướng.
3. `pqg_task_list/create/update` dùng cùng Task service, không có Task database riêng do Agent sở hữu.

## 7. PR #107 — đánh giá chính xác

PR: `fix: recover Support Agent session after runtime reset`.

### Phần nên giữ

- Reuse `IWorkspaces.connectWorkspace()` thay vì tạo session backend riêng.
- Retry bounded một lần cho stale session.
- Rebind/open replacement session qua DSH runtime.

### Phần chưa đạt

1. **CI full quality fail.** Run `34303332397`, job `102314746158`: 187 pass / 1 fail; Makers production build bị skip.
2. PR thêm Application Shell inject `workspaces`, nhưng test `prepared Task contribution activates on Home before a DSH session exists` chỉ provide `sessions`. Shell không được apply => không provide `pqgShell` => Task không register 3 slots => assertion `0 !== 1`.
3. Error detection dựa trên `.includes('not found')`, dễ match sai lỗi không liên quan. Nên dùng typed/stable error code nếu rc.6 expose; nếu không, gom vào một helper version-locked và test exact cases.
4. Recovery vẫn chưa giải quyết `current session === undefined`.
5. PR vẫn chọn một raw transcript carrier (`snapshot.chat.legacy.nodes`), tiếp tục coupling AG-02.

### Quyết định audit

**Không merge #107 nguyên trạng.** Tách/salvage session recovery; transcript rendering phải đi theo Phase native-conversation riêng.

## 8. Test/CI gaps

Hiện test có nhiều contract/source/SSR/VM tests hữu ích, nhưng thiếu các case quyết định hành vi Production:

- Support mặc định collapsed trên desktop lớn.
- Gửi tiếng Việt từ Home/global context vẫn nhận policy tiếng Việt.
- User message lưu/render đúng nguyên văn, không chứa internal wrapper.
- Fresh session / stale session / concurrent recovery / non-session error.
- Native transcript có user, assistant, partial, tool call/result đúng thứ tự.
- Agent `pqg_task_create/update` thực sự thay đổi Store và UI revalidate.
- Task 101/150/201 được list/update đầy đủ qua pagination.
- Invalid dueDate bị reject nhất quán ở UI/API/MCP/service.
- Home load error hiển thị error/retry, không giả “0 việc”.
- Module-enabled GET transient fail rồi recover/register.
- Tool adapter failure có structured diagnostic mà không làm core tools chết.

## 9. GitHub governance

Issues #77 và #78 đã đóng, nhưng body của cả hai vẫn còn exit checklist `[ ]`. Đây không chứng minh chức năng chưa tồn tại, nhưng làm mất traceability giữa “closed” và acceptance evidence.

Kế hoạch mới phải có master issue với checkbox theo finding + acceptance gate; chỉ đóng khi CI và Production smoke có evidence.

## 10. Giới hạn xác minh của audit này

Audit đã kiểm tra source hiện hành, Git history/PR, GitHub Actions live logs và tài liệu upstream/platform hiện tại. **Không thể xác nhận lại trực tiếp toàn bộ hành vi browser Production từ môi trường audit này**, nên các triệu chứng Production như “UI Công việc không hiện” được gắn với root-cause code có thể gây ra triệu chứng và phải được tái xác minh bằng Production smoke sau khi sửa.

## 11. Thứ tự ưu tiên sửa

1. **P0 integration gate:** xử lý/supersede PR #107, đưa quality về xanh.
2. **P0 conversation architecture:** bỏ raw snapshot transcript coupling; reuse DSH Conversation/Tool presentation của version pin.
3. **P0 Task data correctness:** pagination >100.
4. **P1 session/persona/language:** ensure session + product persona tiếng Việt + user content nguyên bản.
5. **P1 Task activation/client resource/error state:** không fail-silent; shared revalidation; Home không giả empty.
6. **P1 tool/approval/diagnostics:** tool progress, approval CTA, module adapter diagnostics.
7. **P1 validation/concurrency:** shared schemas; xác nhận CAS hoặc chọn event-journal.
8. **QA/Production gate:** focused tests trước, một full quality ở integration boundary, exact Makers build, desktop+iPad Production smoke.

Chi tiết triển khai từng file/test/commit nằm tại `docs/superpowers/plans/2026-09-09-chatbox-agent-task-remediation.md`.
