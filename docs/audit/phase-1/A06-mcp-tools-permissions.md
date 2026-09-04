# A06 — MCP bridge, tool permissions, command/preview & cancellation policy

## 1. Metadata
- Repository: `thanhhaixn92/PQG-Harness`
- Base branch: `main`
- Exact base SHA: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- Baseline comparison: matches the SHA anticipated by the audit prompt; no baseline drift detected at audit start.
- Audit date/time: 2026-09-04 16:54 +07:00
- Auditor/subagent: Subagent A06
- Verdict: **PASS WITH RISKS**
- Finding count: **P0 0 / P1 4 / P2 4 / P3 1**

## 2. Scope
This audit is limited to the MCP/tool plane and its permission/cancellation boundaries:

- `agents/_mcp-bridge.ts`
- `agents/_makers-mcp-permission.mjs`
- `agents/_dsh-web-sidecar.ts` profile/preset injection
- `agents/_workspace.ts` command and preview helpers
- `agents/stop.ts`
- relevant generated API proxy behavior in `agents/api/_proxy.ts`
- relevant tests in `tests/mcp-permission.test.ts`, `tests/dsh-web.test.ts`, and `tests/workspace.test.ts`
- `edgeone.json` timeout/runtime configuration

The audit covers tool registry/visibility, permission modes, approval behavior, raw/public tool-name mapping, command execution, preview publishing, MCP lifecycle/reconnect assumptions, request logging, cancellation/stop behavior, and fail-open/fail-closed semantics.

Out of scope: implementation changes, dependency updates, production command execution, Full Access approval on production, unrelated frontend/product concerns, and deep review of AI Gateway/security domains owned by other audit agents.

## 3. Method
1. Verified canonical `main` directly through GitHub branch metadata and recorded exact SHA `70119cfdae992a203a5e29eb24e91c7200222a7c`.
2. Read the scoped source and tests at that exact SHA through the authenticated GitHub connector.
3. Performed static trust-boundary analysis from tool registration through DSH `tools/pre-execute`, approval policy, MCP dispatch, EdgeOne sandbox calls, preview publication, and stop/cancellation paths.
4. Cross-checked semantics against current upstream documentation where repository code depends on external contracts:
   - DeepSeek Harness permission presets and approval semantics: `https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/permission-presets.md` and `https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/approval.md`
   - DeepSeek Harness tool pre-execution semantics: `https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md`
   - MCP TypeScript SDK stateless Streamable HTTP pattern: `https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/http.md`
   - EdgeOne Makers sandbox and conversation semantics: `https://pages.edgeone.ai/document/sandbox-overview`, `https://pages.edgeone.ai/document/agents-quick-start`, and `https://pages.edgeone.ai/document/agents-conversation-storage`
5. Attempted a temporary local clone for test execution as required by the audit protocol, but the execution environment could not resolve `github.com`. No source was modified and no local test result is claimed.
6. No production commands were run and Full Access was not approved on production.

## 4. Architecture / current-state summary
The project exposes a local MCP bridge on `127.0.0.1` per DSH sidecar. The bridge registers eight Makers tools:

- `makers_context_probe`
- `workspace_list_files`
- `workspace_read_file`
- `workspace_write_file`
- `workspace_run_command`
- `publish_preview`
- `sandbox_probe`
- `sandbox_wait`

`agents/_dsh-web-sidecar.ts` injects the MCP client with `serverName: edgeone`, Streamable HTTP transport, a 300,000 ms tool-call timeout, startup failure enabled, and reconnect enabled. It also injects a DSH permission preset table:

- `read-only` = sandbox `read-only` + approval `ask`
- `workspace-write` = sandbox `workspace-write` + approval `ask`
- `danger-full-access` = sandbox `danger-full-access` + approval `never`

The custom plugin in `agents/_makers-mcp-permission.mjs` deliberately keeps every MCP tool visible and uses `tools/pre-execute` to return `allow` or `ask`. The current default is `workspace-write`.

The MCP bridge itself is stateless per HTTP request: a new `McpServer` and `StreamableHTTPServerTransport` are created for each request and closed with the response. This matches the SDK's stateless serving pattern and avoids cross-request request-ID/state collision. The bridge binds only to loopback.

Workspace file operations normalize relative paths. `workspace_run_command` intentionally accepts an arbitrary shell command string and forwards it to `context.sandbox.commands.run` with the conversation workspace as `cwd`. Preview publication starts a background server in the same EdgeOne sandbox and returns a public sandbox URL containing the sandbox data-plane access token as a query parameter.

`agents/stop.ts` accepts a body `conversation_id`, closes an in-process DSH sidecar for that ID if present, and calls `context.utils.abortActiveRun(conversationId)`.

## 5. Evidence inventory

| Evidence | Relevant symbols/configuration | Audit use |
|---|---|---|
| `agents/_makers-mcp-permission.mjs` | `ALL_MAKERS_TOOLS`, `AUTO_ALLOW`, `makersAutoAllowTools`, `makersRequiredMode`, `makersRawToolName`, `apply` | permission classification, fallback, unknown-tool behavior, name mapping |
| `agents/_mcp-bridge.ts` | `createMcpServer`, `handleMcpRequest`, `startLocalMcpBridge`, `workspace_run_command`, `publish_preview`, `requestBodies` | registry, stateless MCP lifecycle, raw request logging, command/preview dispatch |
| `agents/_workspace.ts` | `runWorkspaceCommand`, `publishWorkspacePreview`, `appendAccessToken`, `normalizeWorkspacePath` | shell boundary, timeout clamp, preview token exposure |
| `agents/_dsh-web-sidecar.ts` | `writeProfilePatch`, `startSidecar`, `DshWebSidecar.close`, reconnect config | DSH permission preset, MCP client timeout/reconnect, sidecar shutdown |
| `agents/stop.ts` | `onRequestPost` | stop identity and authorization assumptions |
| `agents/api/_proxy.ts` | `eventStream`, `proxy`, `getDshWebSidecar` | request signal propagation into sidecar proxy and current conversation routing |
| `tests/mcp-permission.test.ts` | current allow/ask expectations and visibility assertions | confirms intended tool visibility model; exposes missing drift/fallback coverage |
| `tests/dsh-web.test.ts` | permission-mode UI/config assertions | confirms product copy and injected permission picker assumptions |
| `tests/workspace.test.ts` | path normalization tests | confirms workspace path hygiene for file tools, not shell command confinement |
| `edgeone.json` | `agents.timeout: 300`, `agents.sandbox.timeout: 300` | timeout coordination |
| EdgeOne sandbox docs | `envdAccessToken` described as data-plane access token; one conversation per sandbox | preview-token and isolation semantics |
| DeepSeek Harness docs | `approval: never` rejects approval asks; `tools/pre-execute` `ask` only executes on `allowed-once` | exact Full Access/unknown-tool semantics |
| MCP TypeScript SDK docs | stateless server factory/per-request pattern | validates per-request server lifecycle as intentional |

## 6. Findings

### P0
No P0 finding confirmed.

### P1

#### A06-P1-01 — Invalid or failed permission-mode resolution falls back to `workspace-write`
- ID: A06-P1-01
- Severity: P1
- Status: **CONFIRMED**
- Evidence:
  - `agents/_makers-mcp-permission.mjs` defines `DEFAULT_MAKERS_PERMISSION = 'workspace-write'`.
  - `makersAutoAllowTools(mode)` substitutes `DEFAULT_MAKERS_PERMISSION` for any invalid mode.
  - `apply(ctx)` reads `sandboxPolicy.resolve({ session })?.mode`, then sets `current` to `workspace-write` whenever the resolved value is missing or invalid.
  - `AUTO_ALLOW['workspace-write']` includes `workspace_write_file`.
- Technical analysis: the code conflates a product default for a fresh session with a runtime failure to resolve the effective session policy. If the policy service is absent, temporarily unavailable, returns malformed data, or an upstream API shape changes, the custom gate automatically treats the session as `workspace-write`. A session that should be `read-only`, or whose permission state is simply unknown, can therefore execute file writes without an approval prompt.
- Impact: permission-resolution failure is fail-open with respect to file mutation. This can bypass the user's selected `read-only` intent and weakens the trust boundary at exactly the point where policy state is uncertain.
- Recommendation: separate the composition default from the runtime error fallback. For missing/invalid/unresolvable policy state, fail closed to `read-only` or to an `ask-all-Makers-mutations` state. Add tests for missing `sandboxPolicy`, thrown/undefined `resolve`, malformed modes, and a read-only session whose resolver fails.
- Dependency/interaction with other audit domains: security/authentication audit should treat this as a trust-boundary fail-open; test/CI audit should add negative-path coverage.

#### A06-P1-02 — `publish_preview` returns the sandbox data-plane access token to the model as part of the tool result
- ID: A06-P1-02
- Severity: P1
- Status: **CONFIRMED**
- Evidence:
  - `agents/_workspace.ts::publishWorkspacePreview()` reads `context.sandbox.envdAccessToken`.
  - `appendAccessToken(url, token)` writes that token into the preview URL query as `access_token`.
  - `publishWorkspacePreview()` returns `{ previewUrl, framework }`.
  - `agents/_mcp-bridge.ts` serializes that return value into the `publish_preview` MCP tool result.
  - EdgeOne Makers documents `envdAccessToken` as the sandbox instance's **data plane access token**, not merely a display-only identifier: `https://pages.edgeone.ai/document/sandbox-overview`.
- Technical analysis: the bearer credential needed to reach the externally exposed sandbox is embedded in a normal model-visible MCP result. Tool results participate in the DSH trajectory/model-visible surface, and the URL can also be copied, logged, exported, or propagated to later model context. The implementation therefore moves a sandbox credential across the model/tool trust boundary rather than keeping it in a UI-only channel.
- Impact: disclosure of a live sandbox data-plane token can expose the preview and may expose additional sandbox data-plane capabilities depending on EdgeOne token scope. The exact privilege breadth and TTL were not verified, but the credential exposure itself is direct and confirmed.
- Recommendation: do not return the bearer token in model-visible tool content. Return an opaque preview handle/status to the model and deliver the credentialed URL out-of-band to the authenticated frontend. If a URL must be model-visible, use a preview-only, narrowly scoped, short-lived signed capability distinct from the sandbox data-plane token; redact it from logs/exports and apply strict referrer policy.
- Dependency/interaction with other audit domains: hand off token scope/TTL and browser leakage analysis to A03 Security/Authentication/Trust/Secrets and preview hosting details to A07 Build/EdgeOne Deploy/Preview.

#### A06-P1-03 — `/stop` treats caller-supplied body `conversation_id` as authority without an application-level ownership check
- ID: A06-P1-03
- Severity: P1
- Status: **INFERRED**
- Evidence:
  - `agents/stop.ts::onRequestPost()` reads `context.request.body.conversation_id` and directly passes it to both `stopDshWebSidecar(conversationId)` and `context.utils.abortActiveRun(conversationId)`.
  - It does not compare that value with `context.conversation_id`, a user/session principal, or a server-issued capability.
  - EdgeOne documentation states that normal `agents/*` conversation identity is parsed from the `Makers-Conversation-Id` request header and injected into `context.conversation_id`; it explicitly advises application code to use the injected value rather than construct a storage key from the body: `https://pages.edgeone.ai/document/agents-conversation-storage`.
  - EdgeOne templates also show body-only stop patterns to avoid sticky-routing a stop request to a busy run, so body targeting can be operationally intentional; that does not establish authorization.
- Technical analysis: the stop endpoint necessarily needs an out-of-band target to interrupt a busy session, but the current code has no application-level proof that the caller is entitled to stop that conversation. A conversation ID is client-generated and functions as a routing/storage key; it should not automatically be treated as an authorization credential.
- Impact: if a target conversation ID is disclosed, predictable, reused, or observable through another channel, another caller may be able to abort the active run and close its sidecar, producing cross-conversation denial of service. Whether EdgeOne adds an independent authorization layer before this handler is **NOT VERIFIED**.
- Recommendation: introduce an explicit stop capability/ownership check that works without sticky routing, for example a server-issued per-conversation stop token or an authenticated user-to-conversation ownership lookup in a stateless control endpoint. Do not rely on UUID secrecy alone.
- Dependency/interaction with other audit domains: hand off platform/authentication validation to A03. If EdgeOne guarantees project/user-bound authorization for `abortActiveRun`, document that contract and downgrade accordingly.

#### A06-P1-04 — Tool cancellation is not explicitly propagated into sandbox command execution
- ID: A06-P1-04
- Severity: P1
- Status: **INFERRED**
- Evidence:
  - `agents/_mcp-bridge.ts` registers handlers as functions of `args` only; it does not consume the MCP handler execution context/abort signal.
  - `sandbox_wait` calls `context.sandbox.commands.run(...)` with only a timeout.
  - `workspace_run_command` calls `runWorkspaceCommand(...)`; `agents/_workspace.ts::runWorkspaceCommand()` calls `context.sandbox.commands.run(command, { cwd, timeout })` without an explicit abort signal/cancellation handle.
  - `handleMcpRequest()` closes the MCP transport/server on HTTP response close, but there is no explicit linkage from that close event to a running EdgeOne sandbox command/process.
  - `DshWebSidecar.close()` terminates the DSH child and closes gateway/MCP listeners, but it does not kill the conversation sandbox or explicitly terminate commands/background preview processes already started inside it.
- Technical analysis: DSH and MCP have cancellation signals, but the bridge drops the signal before entering EdgeOne sandbox command execution. Closing the HTTP transport prevents further MCP communication; it does not, from this code alone, prove that a running sandbox command is cancelled. The same applies to `stop.ts`: platform run abortion and sidecar shutdown may terminate the agent loop while a sandbox-side effect continues until its command timeout or process exit. `publishWorkspacePreview()` deliberately starts a `nohup` background server, which also survives sidecar shutdown unless the sandbox runtime itself cleans it up.
- Impact: after the user presses Stop or a client cancels, commands may continue consuming resources or mutating the sandbox. For destructive or networked commands this violates expected cancellation semantics and can create post-cancel side effects.
- Recommendation: thread the MCP execution `AbortSignal` into bridge handlers and into the EdgeOne sandbox command API if supported; otherwise track process handles/tags and explicitly terminate them on cancellation. Define which background services intentionally survive a run and which must be killed. Add cancellation tests that verify the sandbox process, not merely the HTTP/tool request, has stopped.
- Dependency/interaction with other audit domains: platform support for cancellable sandbox commands should be verified with A02 Runtime/Architecture and A09 Tests/CI/Observability.

### P2

#### A06-P2-01 — Tool registry and permission registry are duplicated and can drift
- ID: A06-P2-01
- Severity: P2
- Status: **CONFIRMED**
- Evidence:
  - `agents/_mcp-bridge.ts::createMcpServer()` registers tools with repeated `register(...)` calls.
  - `agents/_makers-mcp-permission.mjs::ALL_MAKERS_TOOLS` separately duplicates the expected eight names.
  - `AUTO_ALLOW['danger-full-access']` is exactly `ALL_MAKERS_TOOLS`.
  - `tests/mcp-permission.test.ts` asserts the current hard-coded list and separately asserts that the bridge does not filter by permission; it does not derive or compare actual MCP registrations against the permission registry.
- Technical analysis: adding a tool in the bridge does not mechanically update permission classification. A novel `mcp__edgeone__*` tool is not auto-allowed in any mode because it is absent from all allow lists. `makersToolGate()` returns `ask`, including under `danger-full-access`. Upstream DeepSeek Harness semantics define approval policy `never` as rejecting asks rather than auto-approving them, so a drifted/novel tool can become unusable in Full Access. The safety direction is fail-closed, but behavior is fragile and the permission copy becomes misleading.
- Impact: future MCP tools can silently get incorrect permission behavior, fail unexpectedly in Full Access, or require ad-hoc list synchronization. This is a forward-compatibility and policy-maintainability risk.
- Recommendation: define one canonical typed tool registry containing name, minimum mode, handler, and metadata; generate both MCP registration and permission decisions from it. Add a test asserting exact equality between registered tool names and policy metadata.
- Dependency/interaction with other audit domains: A09 should enforce the registry invariant in CI.

#### A06-P2-02 — `makersRequiredMode()` is not a complete classification function
- ID: A06-P2-02
- Severity: P2
- Status: **CONFIRMED**
- Evidence:
  - `agents/_makers-mcp-permission.mjs::makersRequiredMode(tool)` returns `workspace-write` only for `workspace_write_file`; every other tool returns `danger-full-access`.
  - Read-only tools such as `makers_context_probe`, `workspace_list_files`, and `workspace_read_file` therefore classify as `danger-full-access` if this function is evaluated directly.
- Technical analysis: the function currently feeds approval-reason text, not the allow-list itself, so the misclassification is latent for known read tools because they are auto-allowed in all valid modes. It becomes visible when a tool falls onto the ask path because of drift/refactoring and it makes the function unsafe to reuse as a policy source.
- Impact: approval prompts or future policy logic can state an unnecessarily broad required mode and create inconsistent policy behavior.
- Recommendation: make minimum required mode explicit per tool (`read-only`, `workspace-write`, `danger-full-access`) in the canonical registry and derive labels/gates from it.
- Dependency/interaction with other audit domains: test coverage belongs in A09.

#### A06-P2-03 — Custom permission enforcement depends on an exact public-name prefix; mapping drift fails open to downstream policy
- ID: A06-P2-03
- Severity: P2
- Status: **INFERRED**
- Evidence:
  - `MCP_TOOL_PREFIX` is hard-coded to `mcp__edgeone__`.
  - `makersRawToolName(publicName)` returns `null` when the exact prefix is absent.
  - `apply(ctx)` immediately calls `next()` for a `null` raw tool name, so the custom Makers allow/ask gate is not applied.
  - Current tests cover `mcp__edgeone__workspace_write_file` and confirm `bash` is ignored, but do not test an upstream naming change or server alias drift.
- Technical analysis: current DSH naming and `serverName: edgeone` are internally consistent, so there is no current bypass demonstrated. However, this mapping is part of the security boundary because the generic DSH sandbox policy does not itself know that an MCP tool ultimately calls `context.sandbox.commands.run`. If an upstream MCP client changes public naming, the custom gate can stop recognizing Makers tools and delegate them downstream.
- Impact: a dependency/configuration change could remove the intended per-tool approval gate without an obvious registry failure.
- Recommendation: validate the MCP client's actual exported tool names at startup and fail startup if any tool from the Makers server cannot be mapped/classified. Prefer metadata/server identity over a string-prefix convention if DSH exposes it.
- Dependency/interaction with other audit domains: A08 Dependency/Supply Chain should flag upstream DSH MCP naming changes; A09 should add integration coverage.

#### A06-P2-04 — MCP request logging retains raw POST bodies without a bound or redaction
- ID: A06-P2-04
- Severity: P2
- Status: **CONFIRMED**
- Evidence:
  - `agents/_mcp-bridge.ts::startLocalMcpBridge()` stores every parsed POST body in `requestBodies`.
  - `requestLog()` returns a copy of the entire accumulated array.
  - MCP tool-call bodies can include complete `workspace_write_file` contents and arbitrary shell commands.
  - No size/count cap, TTL, redaction, or production/debug guard is present in the bridge.
- Technical analysis: the log is process-memory only in the audited code, but it retains potentially sensitive workspace content and grows for the sidecar lifetime. The sidecar idle window is 25 minutes, and repeated calls can accumulate large bodies.
- Impact: unnecessary sensitive-data retention and avoidable memory growth. A future diagnostic surface that exposes `requestLog()` would amplify the confidentiality risk.
- Recommendation: remove raw body retention from production or replace it with bounded metadata-only telemetry (method/tool name, timestamp, size, status). If test inspection is needed, inject a test-only recorder.
- Dependency/interaction with other audit domains: hand off logging/privacy posture to A09 and A03.

### P3

#### A06-P3-01 — 300-second timeout layers have no explicit headroom
- ID: A06-P3-01
- Severity: P3
- Status: **CONFIRMED**
- Evidence:
  - `edgeone.json`: agent timeout 300 s and sandbox timeout 300 s.
  - `agents/_dsh-web-sidecar.ts`: MCP `toolCallTimeoutMs: 300000`.
  - `agents/_mcp-bridge.ts`: command input timeout max 300 s.
  - `agents/_workspace.ts::runWorkspaceCommand()`: clamps timeout to max 300 s.
- Technical analysis: equal outer and inner deadlines can race. A command completing near 300 s may lose its result because the MCP client, Agent runtime, or sandbox lifetime expires at the same boundary, leaving ambiguous cancellation/error reporting.
- Impact: low-severity reliability/diagnostic ambiguity for long commands.
- Recommendation: establish ordered timeout budgets with headroom, e.g. command < MCP tool timeout < agent request timeout < sandbox lifetime where the platform permits it, and document which layer owns the final cancellation.
- Dependency/interaction with other audit domains: coordinate with A02 and A09.

## 7. What is already good / should be preserved
1. **Unknown Makers tool direction is fail-closed at the custom gate.** A public name with the current `mcp__edgeone__` prefix but absent from the allow list returns `ask`, not `allow`.
2. **Tool visibility and permission are intentionally separated.** The MCP bridge registers all tools; the DSH pre-execute plugin gates execution rather than hiding definitions. Existing tests encode this product invariant.
3. **Current allow-list semantics are understandable:** read-only auto-allows probe/list/read; workspace-write additionally auto-allows file write; known commands, preview, and sandbox probes require a one-call ask below Full Access.
4. **Per-request MCP server/transport creation is appropriate for stateless Streamable HTTP.** Current MCP SDK guidance explicitly uses a fresh server/transport per request for stateless serving, avoiding cross-client/request-ID state collision. The current implementation's overhead is mostly repeated registration/allocation, not a state correctness defect.
5. **MCP is bound to loopback (`127.0.0.1`).** The sidecar and bridge communicate locally rather than exposing the MCP endpoint publicly.
6. **Workspace file paths are normalized and traversal-resistant** for list/read/write operations. Tests cover `..`, absolute paths, doubled separators, and conversation-ID sanitization.
7. **`workspace_run_command` is correctly treated as arbitrary shell execution rather than sanitized input.** Passing the command string verbatim is not, by itself, an injection bug: arbitrary shell is the tool's purpose. The intended boundary is approval plus the EdgeOne conversation sandbox, not shell escaping. The `cwd` limits convenience/scope but should not be described as a security sandbox.
8. **MCP startup is configured fail-loud** with `failOnStartupError: true` and finite reconnect attempts.
9. **Sidecar process shutdown is bounded:** it sends `SIGTERM`, then `SIGKILL` after 3 seconds, and closes gateway/MCP listeners with `Promise.allSettled`.

## 8. Gaps and NOT VERIFIED items
- **NOT VERIFIED — local test/typecheck execution.** A temporary clone was attempted, but the execution environment failed DNS resolution for `github.com`; no `npm test`, `npm run typecheck`, or runtime test result is claimed.
- **NOT VERIFIED — production cancellation behavior.** The prompt prohibits production command execution and Full Access approval. No destructive/live stop test was performed.
- **NOT VERIFIED — EdgeOne platform authorization in front of `agents/stop.ts`.** Repository code contains no ownership check; whether the hosting platform independently authenticates/authorizes a body-targeted abort is not established.
- **NOT VERIFIED — exact privilege scope and TTL of `context.sandbox.envdAccessToken`.** Official docs identify it as a data-plane access token; whether it is restricted to preview traffic only is not documented in the evidence reviewed.
- **NOT VERIFIED — whether `context.sandbox.commands.run` implicitly terminates an in-flight command when the enclosing Agent request is aborted even without an explicit signal parameter.** Static code does not prove such coupling.
- **NOT VERIFIED — dynamic DSH behavior for every built-in/non-Makers tool under `danger-full-access`.** Upstream docs establish the two knobs (`sandbox` and `approval`) and that `approval: never` rejects asks, but each tool's own need for approval depends on its execution path.
- **NOT VERIFIED — reconnect/resumability beyond ordinary stateless requests.** The bridge intentionally holds no MCP session/event store; server-to-client resumability/notifications are therefore not part of the demonstrated contract.

## 9. Recommended next actions — audit recommendation only
1. **Before stable/public use:** change permission-resolution failure to fail closed; this is the highest-confidence trust-boundary defect.
2. **Before stable/public use:** remove `envdAccessToken` from model-visible tool output and move preview capability delivery to a frontend-only channel.
3. **Before stable/public use:** define a non-sticky but authorized stop-control mechanism and document the caller/ownership model.
4. **Before stable/public use:** make cancellation observable end-to-end with a test that proves the actual sandbox process stops after tool cancellation/Stop.
5. Consolidate MCP tool registration and permission metadata into one registry; generate visibility/gating/required-mode labels from that source.
6. Replace raw MCP body logging with bounded, redacted telemetry.
7. Add integration tests for prefix/name mapping, unknown tools under all three modes, invalid policy resolution, `approval: never`, and timeout/cancellation races.
8. Add explicit timeout headroom rather than aligning all layers at 300 seconds.

No implementation is proposed or performed in this audit branch.

## 10. Handoff to planning phase
Planning should treat the A06 work as four trust-boundary tracks:

1. **Permission-state integrity** — fail-closed resolver behavior; canonical registry; exact minimum-mode metadata; mapping validation.
2. **Capability confidentiality** — preview URL/token must not enter model-visible tool results unless deliberately scoped for that trust boundary.
3. **Cancellation ownership** — one authoritative cancellation path from browser/DSH/MCP to EdgeOne sandbox processes, with explicit semantics for intentionally persistent preview servers.
4. **Control-plane authorization** — `/stop` needs a documented caller identity/ownership contract that remains usable while the main conversation instance is busy.

Cross-audit handoff:
- A03: preview credential scope/leakage and stop authorization.
- A02: sandbox/Agent cancellation contract and process lifecycle.
- A07: preview-host exposure and preview capability delivery.
- A08: DSH/MCP public tool-name compatibility drift.
- A09: negative-path, cancellation, registry-invariant, and timeout tests/observability.

## 11. Appendix

### A. Mandatory question answers

**1. Unknown/novel MCP tool mặc định được gate thế nào?**  
With the current `mcp__edgeone__` prefix, an unknown tool is not in any `AUTO_ALLOW` list, so `makersToolGate()` returns `ask`. This remains true even in `danger-full-access`. Because the injected DSH preset sets `approval: never` for Full Access and upstream DSH defines `never` as rejecting asks, a novel tool is effectively denied/unavailable in Full Access until it is added to the canonical permission list. This is fail-closed for safety but brittle for forward compatibility.

**2. `makersRequiredMode()` có classification đúng cho mọi tool không?**  
No. It only recognizes `workspace_write_file` as `workspace-write`; every other tool is labeled `danger-full-access`, including read-only tools. Current allow lists hide this defect on the normal path, but the function is not a correct general classifier.

**3. Nếu mode resolve thất bại, fallback có an toàn không?**  
No. Missing/invalid resolution falls back to `workspace-write`, which auto-allows file writes. Runtime policy uncertainty should fail closed, not inherit the product's normal fresh-session default.

**4. `danger-full-access` = approval never có phạm vi gì?**  
The DSH permission preset writes two per-session knobs: sandbox mode `danger-full-access` and approval policy `never`. Upstream DSH documentation states that `never` disables prompting by rejecting every `ask`; it does **not** mean “approve every ask.” Known Makers tools still run immediately because the custom Makers plugin returns `allow` for all names in `ALL_MAKERS_TOOLS` under Full Access. A novel/drifted Makers tool returns `ask` and is therefore rejected under `never`. Other DSH tools depend on whether their execution path requires approval once the sandbox is already in danger-full-access mode.

**5. Tool list và permission list có thể drift không?**  
Yes. MCP registration and `ALL_MAKERS_TOOLS` are separate hard-coded lists. Existing tests assert the current values but do not mechanically prove equality between the actual bridge registry and permission metadata.

**6. MCP server tạo mới per request có overhead/state/cancellation issue nào?**  
Per-request server/transport creation is the recommended stateless Streamable HTTP pattern and is not itself a defect. It adds repeated object/tool-registration allocation and intentionally carries no session/resumability state. The material issue is cancellation: bridge handlers ignore the MCP execution signal before calling EdgeOne sandbox commands, so transport closure does not prove sandbox-side work has stopped.

**7. `workspace_run_command` input có shell injection theo thiết kế không, và boundary kiểm soát nằm ở đâu?**  
The tool intentionally accepts arbitrary shell. The command is passed verbatim to `context.sandbox.commands.run`, so shell metacharacters are features of the tool, not an injection defect into a fixed command template. The security boundary is the Makers permission gate plus EdgeOne's conversation-isolated sandbox. `cwd` is not a containment boundary, and one approved command can perform arbitrary effects that the sandbox itself permits.

**8. Preview token/host exposure có phù hợp permission semantics không?**  
Not sufficiently. `publish_preview` is correctly gated below Full Access, but after approval it returns the sandbox data-plane token in model-visible content. Execution permission and credential disclosure are distinct concerns; approving preview publication should not automatically expose a reusable data-plane credential to the model/trajectory.

**9. `stop` endpoint có authorization assumption nào?**  
Yes. It assumes possession of the body `conversation_id` is sufficient authority to stop that conversation. No application-level ownership proof is present. This may be an intentional routing workaround, but it still needs a separate authorization contract.

### B. Full Access semantics matrix for known Makers tools

| Tool | Read Only | Workspace Write | Full Access |
|---|---|---|---|
| `makers_context_probe` | allow | allow | allow |
| `workspace_list_files` | allow | allow | allow |
| `workspace_read_file` | allow | allow | allow |
| `workspace_write_file` | ask | allow | allow |
| `workspace_run_command` | ask | ask | allow |
| `publish_preview` | ask | ask | allow |
| `sandbox_probe` | ask | ask | allow |
| `sandbox_wait` | ask | ask | allow |
| unknown `mcp__edgeone__*` | ask | ask | ask → rejected when DSH approval policy is `never` |

### C. Command/preview containment note
`workspace_run_command` is intentionally a general shell escape **inside the EdgeOne Makers sandbox**, not a constrained “workspace-only command interpreter.” The code sets the workspace as `cwd`, but it does not parse or sanitize commands to restrict filesystem targets. EdgeOne documentation states that one conversation maps to one physically isolated sandbox instance. Therefore the relevant trust boundary is sandbox isolation plus approval, not command-string sanitization.

### D. Audit protocol compliance
- Canonical main SHA verified before audit: yes.
- Separate fresh branch: `audit/a06-mcp-tools-permissions`.
- Runtime/source/dependency/config changes: none.
- Production command execution: none.
- Full Access approval on production: none.
- Report-only branch intent: yes.
- Local temporary clone attempt: failed before checkout because the execution environment could not resolve `github.com`; no files were changed by that attempt.
