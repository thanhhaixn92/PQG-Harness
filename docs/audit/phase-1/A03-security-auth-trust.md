# A03 — Security, authentication, trust boundaries & secret handling

## 1. Metadata
- Repository: `thanhhaixn92/PQG-Harness`
- Base branch: `main`
- Exact base SHA: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- Baseline delta vs prompt expectation: none; prompt expected the same SHA.
- Audit date/time: `2026-09-04 16:59 +07:00` (Asia/Bangkok)
- Auditor/subagent: `A03`
- Verdict: **PARTIAL**
- Production URL supplied to the audit: `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/`
- Scope mode: **AUDIT-ONLY / DOCUMENTATION-ONLY**
- Finding count: **P0 0 / P1 4 / P2 5 / P3 2**

The verdict is `PARTIAL`, not `PASS`, because application/source controls were inspected in depth but EdgeOne Console access policy, live production response headers/reachability, deployed environment values, AI Gateway logging policy, and any platform-side identity binding beyond documented `conversation_id` behavior were not available for direct verification. No destructive testing, brute force, fuzzing, production command execution, secret reading, or secret printing was performed.

## 2. Scope
This audit covers the security domain assigned to A03:

- application-level authentication and authorization;
- public deployment exposure and Agent API exposure;
- trust boundaries across browser → EdgeOne → DSH sidecar → MCP bridge → Makers sandbox → AI Gateway/model provider;
- secret and environment-variable handling;
- accidental secret disclosure through files, logs, errors, headers, prompt/tool results, and preview URLs;
- command-execution surfaces and approval boundaries;
- preview token handling;
- path traversal and identifier sanitization from a security perspective;
- request validation, response leakage, privacy-sensitive headers, and abuse/quota controls;
- SSRF/open-proxy possibilities in the inspected proxy design;
- dependency on the upstream DeepSeek Harness developer-preview security posture.

This audit intentionally does **not** perform exploit validation against production, dependency vulnerability scanning, CI review, deployment mutation, source fixes, or EdgeOne Console changes. Those belong to planning/remediation or other audit domains.

## 3. Method
1. Resolved canonical `main` through GitHub and pinned the audit to `70119cfdae992a203a5e29eb24e91c7200222a7c`.
2. Created a fresh audit branch from that exact commit: `audit/a03-security-auth-trust`.
3. Inspected the root deployment configuration, generated API proxy surface, DSH sidecar lifecycle, local AI Gateway proxy, MCP bridge, workspace helpers, permission plugin, frontend conversation routing, and related tests.
4. Compared application behavior with current official EdgeOne Makers documentation for Agent authentication, `conversation_id`, quotas/rate limits, and conversation storage.
5. Reviewed current official upstream DeepSeek Harness safety/developer-preview statements. Community security discussions were treated only as context, not as proof of a vulnerability in this fork.
6. Did not read actual secret values. `.env.example` was inspected only as a names-only template; deployed environment values were intentionally not queried.
7. Attempted a non-destructive production reachability check, but the available execution environment could not directly resolve/fetch the supplied EdgeOne deployment URL. Production behavior is therefore marked `NOT VERIFIED` rather than inferred.

## 4. Architecture / current-state summary
The current application is an EdgeOne Makers-hosted wrapper around DeepSeek Harness Web. The browser loads the DSH Web UI and injects a locally generated UUID from `localStorage` into same-origin `/api` and `/rpc` requests as `makers-conversation-id`. EdgeOne injects that identifier into the Agent context as `context.conversation_id`.

For each conversation ID, the application creates a DSH Web sidecar, a local AI Gateway proxy, and a local MCP bridge. All three local servers are bound to `127.0.0.1`. The public Agent API routes under `agents/api/**` forward DSH Host API traffic to the loopback sidecar, while MCP tools call Makers `context.sandbox` APIs for file, command, and preview work. The AI Gateway key is read from `context.env` inside the server runtime; the child DSH process receives a dummy local proxy key (`makers-proxy`) for the Makers provider rather than the real gateway key.

The security model is therefore layered, but one layer is materially under-specified at application level: the browser-facing Agent API does not implement a user login/authorization check. The current session boundary is primarily the client-controlled `makers-conversation-id`, while EdgeOne-level access policy is outside the repository and was not verifiable in this audit.

### Threat actors
| Actor | Capability considered | Main risk path |
|---|---|---|
| Legitimate user | Uses UI, selects permission mode, writes code, publishes preview | Accidental secret placement, over-broad Full Access, token leakage |
| Unauthenticated Internet caller | Directly calls Agent routes if deployment is publicly reachable | Quota abuse, sidecar/sandbox creation, Host API bypass of frontend |
| Malicious prompt/content | Influences model/tool decisions from repository text, fetched content, or user input | Auto-approved reads, secret exfiltration, command escalation requests |
| Compromised model/provider | Produces hostile tool calls or retains sensitive context | Secret/file disclosure, command attempts, prompt-log/privacy exposure |
| Malicious dependency/upstream package | Executes inside DSH/plugin/runtime dependency graph | Host control-plane or permission-boundary compromise |
| Concurrent session/user | Uses a different or stolen conversation identifier | State collision, IDOR-style access, aborting another session |

### Required threat-model table
| Asset | Entry point | Trust boundary | Existing control | Gap | Severity |
|---|---|---|---|---|---|
| Agent API, model and sandbox quota | `/api/*`, `/rpc/*` | Internet/browser → EdgeOne Agent | Platform requires valid `makers-conversation-id`; platform quotas/rate limits exist | No application login/authorization before forwarding Host API; EdgeOne access policy not verified | P1 |
| Conversation state, settings, workspace | Client-generated `makers-conversation-id` | Browser → EdgeOne store/sidecar/sandbox | UUID generation, server-side path sanitization | No repository-visible binding of conversation ID to authenticated user; `/stop` accepts body ID | P1 |
| Workspace source/secrets | MCP `workspace_list_files` / `workspace_read_file` | Model → MCP bridge → sandbox | Sandbox boundary and traversal checks | Reads are auto-allowed even in read-only mode; no sensitive-file deny/approval list | P1 |
| DSH Host control plane | Generated `agents/api/**` routes | EdgeOne public route → loopback DSH | Sidecar itself binds loopback; some built-in presets are locked | Entire Host API is re-exposed through Agent routes; auth depends on outer layer | P1 |
| AI Gateway key | Local gateway proxy | DSH sidecar → local proxy → provider | Real key stays in server `context.env`; child gets dummy Makers proxy key | Prompt logging and quota-bypass headers need policy verification | P2 |
| Shell/preview capability | MCP `workspace_run_command`, `publish_preview` | Model → permission plugin → sandbox | Read-only/workspace-write modes ask for commands/preview | `danger-full-access` sets approval to never and auto-allows all Makers tools | P2 |
| Preview access token | `publishWorkspacePreview()` | Sandbox host → tool result/model/browser | Token is required and derived from platform sandbox | Credential is placed in URL query string and returned in tool/API data | P2 |
| Stored workspace content | `workspace_write_file` snapshot | Sandbox → `context.store` | Snapshot size/file caps | Arbitrary written file content is persisted; no sensitive-file exclusion | P2 |
| Error/header metadata | `_proxy.ts`, SSE error path | DSH sidecar → browser | Binary export uses `no-store`; hop-by-hop length headers removed | Internal error strings and most upstream headers pass through | P3 |

## 5. Evidence inventory
### Repository evidence at exact base SHA
- `edgeone.json` (blob `293f79e8352cb8d7974285155e7758e0023f4031`): Agent timeout/sandbox config and external modules; no repository-level auth/access-control configuration.
- `.env.example` (blob `5f1a58626848bda0997a26c7b85a950842d3a96c`): names only for `AI_GATEWAY_API_KEY`, `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_MODEL`.
- `.gitignore` (blob `dee2c432158998449da73d0520da9dcd0d80d9c3`): excludes `.env`, `.edgeone`, logs, build outputs.
- `index.html` / `scripts/prepare-dsh-web.mjs`: browser stores `dsh-makers-web-conversation-id` in `localStorage`, creates it with `crypto.randomUUID()`, and injects it as `makers-conversation-id` into same-origin `/api` and `/rpc` fetches.
- `agents/api/_proxy.ts` (blob `f85f2ac5e78aff9b6c04ed6e930b80113e1b17c7`): proxies browser Agent API requests to the per-conversation loopback DSH sidecar; no user authentication check is present in `proxy()` / `onRequest()`.
- `agents/api/commands/execute.ts` and other generated API files: thin wrappers delegate to `_proxy.ts`.
- `agents/stop.ts` (blob `390b209e79918e1ed3cbe4db36bca3d7d7a29356`): accepts `conversation_id` from request body and calls `stopDshWebSidecar()` / `abortActiveRun()`.
- `agents/_dsh-web-sidecar.ts` (blob `7b1eb43eec6f466187b502088edeace7d103e2a4`): sidecar map keyed by `conversationId`; loopback bind; per-conversation DSH home; Makers provider setup; optional DeepSeek env passthrough; `DSH_TELEMETRY_DISABLED=1`.
- `agents/_gateway-proxy.ts` (blob `55de313e6f53d04c3cfbebd7466eb22618c54ce8`): real `AI_GATEWAY_API_KEY` read from `context.env`, loopback listener, outbound Bearer header, `x-gateway-quota-bypass: true`, `x-prompt-log: true`, `makers-conversation-id`.
- `agents/_mcp-bridge.ts` (blob `d1069896934876d978bcc0c979b09dca8bab28a5`): registered file, command, sandbox, and preview tools; loopback MCP server.
- `agents/_makers-mcp-permission.mjs` (blob `824807bd534515e0b9b9c327f7ef39f63fe33db5`): read/list auto-allowed; workspace writes auto-allowed in `workspace-write`; all tools auto-allowed in `danger-full-access`.
- `agents/_workspace.ts` (blob `7f11604ce8d88183555dd83aa860ca03846b6b8a`): traversal-resistant path normalization, arbitrary shell command execution in Makers sandbox, workspace snapshot persistence, preview token URL construction.
- `tests/workspace.test.ts`: verifies traversal rejection and conversation-root sanitization.
- `tests/mcp-permission.test.ts`: explicitly verifies that Full Access auto-allows commands/preview without asking.
- `tests/dsh-web.test.ts`: verifies browser conversation routing and permission picker behavior.
- `middleware.ts`: not present at base SHA (GitHub contents API returned 404).
- `middleware.js`: not present at base SHA (GitHub contents API returned 404).

### External authoritative evidence
- EdgeOne Makers, **Agent Authentication**: https://pages.edgeone.ai/document/agents-authentication — explicitly states that without login authentication anyone can directly access Agent APIs, consume LLM/tool quotas, and bypass the frontend.
- EdgeOne Makers, **Agents Quick Start**: https://pages.edgeone.ai/document/agents-quick-start — states the client/business backend generates `conversation_id`, all Agent requests carry it, and the platform uses it for sticky routing, conversation ownership, and sandbox ownership.
- EdgeOne Makers, **Conversation Storage**: https://pages.edgeone.ai/document/agents-conversation-storage — states the platform parses `makers-conversation-id` into `context.conversation_id` and uses it as the persistence key.
- EdgeOne Makers, **Limits and Quotas**: https://pages.edgeone.ai/document/limits-and-quotas — documents platform execution/session/model quotas and platform security/rate-limiting capabilities.
- DeepSeek Harness, official **SAFETY.md**: https://github.com/deepseek-ai/deepseek-harness/blob/master/SAFETY.md — states DeepSeek Harness is experimental developer-preview software, has not undergone a security audit, and must not be treated as secure or production-ready.
- DeepSeek Harness official repository: https://github.com/deepseek-ai/deepseek-harness — states developer-preview status and compatibility-breaking changes are expected.

## 6. Findings
### P0
No P0 finding is claimed. The most consequential Internet-exposure risk depends on whether the supplied production deployment is actually reachable without an EdgeOne access policy, which was `NOT VERIFIED`. Promoting that conditional risk to P0 without live policy/reachability evidence would violate the audit evidence rules.

### P1
#### A03-P1-01 — No application-layer authentication/authorization before Agent Host API forwarding
- ID: `A03-P1-01`
- Severity: `P1`
- Status: `CONFIRMED`
- Evidence:
  - `agents/api/_proxy.ts`, functions `proxy()` and `onRequest()`: forwards requests to the loopback DSH Host endpoint and does not validate a logged-in user, session cookie, bearer token, or user-to-conversation authorization mapping.
  - Generated routes such as `agents/api/commands/execute.ts` are thin delegators to `_proxy.ts`.
  - Repository has no `middleware.ts` or `middleware.js` at the pinned base SHA.
  - `index.html` injects only `makers-conversation-id`; it does not inject an authentication credential.
  - Official EdgeOne Agent Authentication documentation explicitly warns that without login authentication anyone can call Agent APIs directly and consume LLM/tool quota.
- Technical analysis: The loopback bind protects the raw DSH sidecar from direct network access, but the application deliberately republishes that control plane through EdgeOne Agent routes. The only repository-visible caller discriminator is a client-generated conversation identifier. Therefore the security of the public control plane depends on an outer EdgeOne access policy that is not represented in source and was not verifiable here.
- Impact: If production is Internet-reachable without a separate EdgeOne authentication policy, an unauthenticated caller can bypass the UI and invoke Agent routes, create/use conversations, instantiate sidecars/sandboxes, and consume model/tool resources. This is a material abuse and trust-boundary risk.
- Recommendation: Before public/stable use, require authentication at the edge/app layer for `/api/*`, `/rpc/*`, `/stop`, and any Agent entry point; bind authenticated principal → authorized conversation IDs; default deny direct API access; keep platform rate limiting as defense in depth rather than as identity/authentication.
- Dependency/interaction with other audit domains: Cross-audit handoff to A07 for quotas/production deployment controls, A02 for runtime trust-boundary architecture, and A09 for security regression tests.

#### A03-P1-02 — Conversation ID acts as an ownership/routing key without repository-visible user binding
- ID: `A03-P1-02`
- Severity: `P1`
- Status: `INFERRED`
- Evidence:
  - `index.html`: creates a UUID in browser `localStorage` under `dsh-makers-web-conversation-id` and sends it as `makers-conversation-id`.
  - `agents/_dsh-web-sidecar.ts`, `getDshWebSidecar()`: keys the sidecar map by `context.conversation_id`.
  - `agents/_workspace.ts`, `workspaceRoot()` / store helpers: derives workspace/store scope from `conversationId`.
  - `agents/stop.ts`: accepts `conversation_id` from the body and does not compare it with `context.conversation_id` or an authenticated owner before aborting.
  - Official EdgeOne documentation states the client/business backend generates `conversation_id` and the platform uses it for routing/ownership; no repository-visible user identity layer exists here.
- Technical analysis: A UUID has strong entropy, so this is not a claim that IDs are guessable. The concern is that possession of the identifier appears sufficient to select the conversation scope at the application layer. If an identifier is disclosed through XSS, browser storage access, support logs, screenshots, exported data, malicious extensions, or other application paths, another caller could plausibly address the same state. Whether EdgeOne adds a hidden account-level ownership check is `NOT VERIFIED`, so cross-user exploitability is marked `INFERRED` rather than `CONFIRMED`.
- Impact: Potential IDOR-style access to conversation state/workspace and targeted denial of service through `/stop` if a valid victim conversation ID is obtained.
- Recommendation: Use authenticated user/session identity as the primary authorization key; store conversation ownership server-side; reject cross-principal IDs; make `/stop` use the request context's authorized conversation rather than a free-form body identifier; rotate/expire browser conversation identifiers where practical.
- Dependency/interaction with other audit domains: Cross-audit handoff to A04 for session isolation/persistence and A02 for Host API routing semantics.

#### A03-P1-03 — Sensitive workspace files are readable by the model without per-call approval
- ID: `A03-P1-03`
- Severity: `P1`
- Status: `CONFIRMED`
- Evidence:
  - `agents/_makers-mcp-permission.mjs`: `workspace_list_files` and `workspace_read_file` are auto-allowed in both `read-only` and `workspace-write` modes.
  - `agents/_workspace.ts`, `listWorkspace()`: ignores build/cache directories but does not exclude sensitive files such as `.env*`, `.npmrc`, key material, credentials files, or application secrets.
  - `agents/_workspace.ts`, `readWorkspaceFile()`: accepts any traversal-safe relative path and returns file content to the MCP tool result.
  - `tests/mcp-permission.test.ts`: explicitly verifies read access is allowed without an approval prompt.
- Technical analysis: Path containment protects the host, but it does not protect sensitive data *inside the permitted workspace*. A malicious prompt/content source or compromised model can autonomously list and read workspace secrets because read operations are intentionally auto-approved. Tool results become model-visible data, crossing the sandbox → model/provider trust boundary.
- Impact: Project secrets, private source, credentials copied into the workspace, or other sensitive files can be disclosed to the active model/provider and potentially retained in conversation traces/logging without a fresh user decision.
- Recommendation: Add a sensitive-path policy requiring explicit approval or denying reads for `.env*`, private keys, credential/config files, package-manager auth files, cloud credentials, and configurable project-specific patterns; separate runtime secrets from the model-readable workspace; redact sensitive tool outputs; document that sandbox containment is not a confidentiality boundary against the model.
- Dependency/interaction with other audit domains: Cross-audit handoff to A04 for workspace persistence and A06 for MCP permission UX/command approval semantics.

#### A03-P1-04 — Production-shaped deployment depends on upstream software that explicitly disclaims production security readiness
- ID: `A03-P1-04`
- Severity: `P1`
- Status: `CONFIRMED`
- Evidence:
  - `package.json`: multiple DeepSeek Harness components are pinned to `0.1.0-rc.6` or compatible release-candidate ranges.
  - Repository README describes the app as a production-shaped starter based on official DeepSeek Harness Web/Host.
  - Upstream `deepseek-ai/deepseek-harness` official `SAFETY.md` states the software is experimental developer-preview software, has not undergone a security audit, and must not be treated as secure or production-ready.
  - Upstream repository states developer-preview status and compatibility-breaking changes are expected.
- Technical analysis: This fork adds meaningful compensating controls—loopback binding, Makers sandbox indirection, a custom permission plugin, and removal/locking of some UI/plugin surfaces—but still runs the upstream DSH Web control plane and release-candidate dependency graph. Upstream's own safety statement means public/stable deployment cannot rely on DSH itself as a validated security boundary.
- Impact: Security assumptions may change across upstream RC updates; undocumented or newly discovered upstream control-plane/plugin weaknesses can invalidate local hardening assumptions.
- Recommendation: Treat DSH as an untrusted/preview dependency; pin exact reviewed versions; maintain a security-delta checklist on every upgrade; preserve strict outer authentication and sandbox isolation; add regression tests for trust-boundary invariants; do not label the deployment secure/production-ready until upstream posture and local compensating controls meet the project's release bar.
- Dependency/interaction with other audit domains: Cross-audit handoff to A08 for dependency/supply-chain policy and A11 for release/governance documentation.

### P2
#### A03-P2-01 — Preview bearer token is embedded in the URL query string and returned through tool/API data
- ID: `A03-P2-01`
- Severity: `P2`
- Status: `CONFIRMED`
- Evidence:
  - `agents/_workspace.ts`, `appendAccessToken()`: writes `access_token` into the preview URL query string.
  - `publishWorkspacePreview()` and `currentPreview()` return that full URL.
  - `agents/_mcp-bridge.ts`, `publish_preview`: serializes the preview result into MCP tool output.
- Technical analysis: A query-string token can propagate into browser history, copied links, screenshots, diagnostics, reverse-proxy/CDN logs, referrer flows, and model/tool transcripts. The token's lifetime and scope were not verified, so impact is bounded to a medium finding rather than assuming long-lived broad access.
- Impact: Disclosure of the preview access token can grant unintended access to the published sandbox preview for the token lifetime.
- Recommendation: Prefer a short-lived exchange flow or HttpOnly/SameSite cookie instead of a bearer credential in the URL; if the platform mandates a query token, minimize TTL/scope, strip it immediately after session establishment, set strict referrer policy, and avoid returning the raw token to model-visible text where possible.
- Dependency/interaction with other audit domains: Cross-audit handoff to A07 for preview/deployment semantics and A10 for browser/referrer handling.

#### A03-P2-02 — Gateway requests explicitly enable prompt logging and attach a conversation identifier
- ID: `A03-P2-02`
- Severity: `P2`
- Status: `INFERRED`
- Evidence:
  - `agents/_gateway-proxy.ts`, outbound headers include `x-prompt-log: 'true'` and `makers-conversation-id: conversationId`.
  - The same code also forwards full normalized request bodies to the configured AI Gateway.
- Technical analysis: The header names strongly indicate a request for prompt logging and correlation, but the actual EdgeOne/provider retention, redaction, access policy, and whether the header is honored were not available for verification. Therefore the privacy consequence is `INFERRED`.
- Impact: Prompts, tool context, and a stable conversation identifier may be retained or correlated beyond the live request, increasing exposure if users place confidential code/data in chats.
- Recommendation: Confirm official semantics/retention for `x-prompt-log`; disable prompt logging by default unless required; document data processing/retention; avoid sending unnecessary stable identifiers to providers; ensure secret/tool-output redaction before gateway submission.
- Dependency/interaction with other audit domains: Cross-audit handoff to A05 for model/provider privacy compatibility and A11 for privacy documentation.

#### A03-P2-03 — Full Access intentionally removes per-call approval for shell commands and preview publication
- ID: `A03-P2-03`
- Severity: `P2`
- Status: `CONFIRMED`
- Evidence:
  - `agents/_dsh-web-sidecar.ts`, generated permission config: `danger-full-access` uses `approval: never`.
  - `agents/_makers-mcp-permission.mjs`: `danger-full-access` maps to `ALL_MAKERS_TOOLS` and returns `allow`.
  - `tests/mcp-permission.test.ts`: verifies commands and preview run without asking in Full Access.
  - `agents/_workspace.ts`, `runWorkspaceCommand()`: executes the provided shell command in the Makers sandbox.
- Technical analysis: Makers sandbox isolation limits host impact, but Full Access changes the human approval boundary from per-call confirmation to model discretion. Under the required threat model, malicious prompt content or a compromised model can execute any command available within the sandbox and publish previews without additional confirmation once the user enters this mode.
- Impact: Destructive workspace actions, dependency/network activity, secret reads available to the sandbox process, or unintended preview publication can occur without a fresh user prompt.
- Recommendation: Keep Full Access explicit and high-friction; consider time-limited elevation, one-time confirmation on transition, visible persistent warning, per-session expiry, and optional re-approval for high-risk classes such as network access, secret-bearing files, or publication.
- Dependency/interaction with other audit domains: Cross-audit handoff to A06 for command/preview approval UX and A04 for sandbox capability boundaries.

#### A03-P2-04 — Proxy has no application-level schema/body/rate control; gateway sends a quota-bypass header
- ID: `A03-P2-04`
- Severity: `P2`
- Status: `CONFIRMED`
- Evidence:
  - `agents/api/_proxy.ts`: serializes `context.request.body` and forwards method/path/query/body to the sidecar with no route-specific Zod/schema validation, per-user rate control, or application quota check.
  - `agents/_gateway-proxy.ts`, `readJsonBody()`: buffers the complete local request body before JSON parse; no local size cap is implemented.
  - `agents/_gateway-proxy.ts`: sets `x-gateway-quota-bypass: 'true'` on upstream model requests.
  - Official EdgeOne quota documentation shows platform-level limits/rate controls exist, but the project's specific deployed policies and the semantics of the quota-bypass header were not verified.
- Technical analysis: Platform request limits provide some protection, but the app has no authenticated/user-scoped abuse control. If the outer deployment is public, an attacker can create many valid conversation IDs and drive expensive Agent/model/sandbox operations up to platform/site limits. `x-gateway-quota-bypass` further requires explicit policy review because its effective scope is unknown.
- Impact: Resource exhaustion, model-token consumption, session-slot starvation, or cost/availability degradation.
- Recommendation: Add authenticated principal-level quotas, request/body bounds appropriate to each endpoint, route/method allowlists, concurrency controls, and explicit monitoring; document or remove `x-gateway-quota-bypass` unless its intended policy is formally understood.
- Dependency/interaction with other audit domains: Cross-audit handoff to A07 for quota/production hardening and A09 for abuse/load tests.

#### A03-P2-05 — Workspace snapshot persistence can store arbitrary sensitive file contents in conversation metadata
- ID: `A03-P2-05`
- Severity: `P2`
- Status: `CONFIRMED`
- Evidence:
  - `agents/_workspace.ts`, `writeWorkspaceFile()` calls `saveWorkspaceSnapshotFile()` for every write performed through the MCP file tool.
  - `saveWorkspaceSnapshotFile()` persists `{ path, content, updatedAt }` into `conversation.metadata.workspaceSnapshot`, bounded only by count/bytes.
  - No sensitive filename/content exclusion is applied before persistence.
  - `tests/workspace.test.ts` verifies full file content is snapshotted into conversation metadata.
- Technical analysis: The snapshot mechanism improves continuity, but it makes `context.store` another data-retention location. A model or user writing `.env`, a private config, or a generated credential file through `workspace_write_file` will persist that content until it falls out of snapshot bounds or the conversation is deleted.
- Impact: Longer retention and wider administrative/logical access surface for secrets that were intended to live only inside the sandbox workspace.
- Recommendation: Exclude sensitive file patterns from snapshots, add content-based secret detection/redaction, document retention/deletion behavior, and provide an explicit opt-out for persistence of confidential workspaces.
- Dependency/interaction with other audit domains: Cross-audit handoff to A04 for persistence semantics and A11 for data-retention documentation.

### P3
#### A03-P3-01 — Error strings and most DSH response headers are passed through to the browser
- ID: `A03-P3-01`
- Severity: `P3`
- Status: `CONFIRMED`
- Evidence:
  - `agents/api/_proxy.ts`, `eventStream()` returns `error.message` in SSE error payloads.
  - `agents/api/_proxy.ts`, `onRequest()` returns caught error messages in JSON.
  - `proxy()` copies `upstream.headers` and removes only `content-length` / `transfer-encoding` before returning responses.
  - `agents/_gateway-proxy.ts` similarly forwards most upstream Gateway response headers to the sidecar.
- Technical analysis: This is not a demonstrated secret leak, but it exposes more internal implementation detail and upstream metadata than necessary. Future upstream headers/errors could contain topology, trace identifiers, provider metadata, or sensitive diagnostics.
- Impact: Information disclosure useful for reconnaissance/debug correlation; possible accidental leakage if upstream error behavior changes.
- Recommendation: Define explicit response-header allowlists and map internal exceptions to stable public error codes/messages; keep detailed diagnostics in protected server logs with secret redaction.
- Dependency/interaction with other audit domains: Cross-audit handoff to A09 for observability/error design.

#### A03-P3-02 — No explicit browser security-header policy is committed in `edgeone.json`
- ID: `A03-P3-02`
- Severity: `P3`
- Status: `CONFIRMED`
- Evidence:
  - `edgeone.json` contains build/runtime/Agent settings but no `headers` policy for CSP, framing, referrer, MIME sniffing, or related browser controls.
  - `index.html` contains inline scripts/styles and no repository-visible CSP meta policy.
- Technical analysis: EdgeOne may inject defaults or Console-managed headers; that live behavior is `NOT VERIFIED`. Repository-level security posture therefore does not currently document/enforce a consistent browser header baseline. This matters because XSS/browser compromise would expose the `localStorage` conversation identifier and preview links.
- Impact: Reduced defense in depth against clickjacking, token referrer leakage, MIME confusion, and script injection impact.
- Recommendation: Define and test a deployment-level header baseline compatible with the DSH frontend, including at minimum a deliberate `Referrer-Policy`, framing policy (`frame-ancestors`/equivalent), `X-Content-Type-Options`, and a staged CSP strategy.
- Dependency/interaction with other audit domains: Cross-audit handoff to A10 for frontend/browser hardening and A07 for deployment headers.

## 7. What is already good / should be preserved
1. **Loopback pinning:** DSH Web sidecar, local AI Gateway proxy, and MCP bridge bind to `127.0.0.1`, sharply reducing direct network exposure of internal control planes.
2. **Server-side gateway key handling:** the real `AI_GATEWAY_API_KEY` is read from `context.env` and used only in the local proxy; the child DSH Makers provider receives a dummy local key. Preserve this key-separation pattern.
3. **Secret hygiene in Git:** `.env` is ignored and `.env.example` contains no credential value.
4. **DSH telemetry disabled:** the sidecar environment sets `DSH_TELEMETRY_DISABLED=1`.
5. **Workspace path validation:** `normalizeWorkspacePath()` rejects absolute paths, null bytes, empty segments, `.` and `..`; tests cover traversal cases.
6. **Sandbox indirection:** file/command/preview tools operate through EdgeOne `context.sandbox` rather than the local host filesystem/shell.
7. **Permission tests:** the repository has explicit tests for read-only/workspace-write/full-access tool gates, making the intended approval boundary auditable.
8. **Preset hardening:** built-in agent presets are locked at the API/UI layer and high-risk live Cordis/HMR editing plugins are excluded from the prepared Web bundle.
9. **No obvious user-controlled open proxy found:** the DSH Host proxy targets a per-conversation loopback address, and the AI Gateway upstream base URL comes from server environment configuration rather than request input. This is a source-level observation, not a claim about all upstream dependencies.
10. **Binary export cache control:** session export sets `cache-control: no-store`.

## 8. Gaps and NOT VERIFIED items
The following are explicitly `NOT VERIFIED`:

1. **EdgeOne Console access policy for the supplied production deployment.** No Console evidence was available; no claim is made that production is public or protected.
2. **Live production reachability and response headers.** The audit environment could not directly fetch/resolve the supplied EdgeOne deployment URL, so status codes, cookies, CSP, CORS, referrer policy, and route behavior were not observed.
3. **Actual deployed secret/environment values.** Intentionally not read or printed under the audit rules.
4. **AI Gateway semantics for `x-prompt-log` and `x-gateway-quota-bypass`.** Retention, redaction, billing/quota scope, and provider handling were not verified.
5. **Platform-side identity binding beyond documented `conversation_id`.** It was not possible to confirm whether EdgeOne enforces any hidden account/principal ownership check on store or Agent routing in addition to the supplied conversation ID.
6. **Upstream vulnerability closure for DeepSeek Harness `0.1.0-rc.6`.** Official upstream developer-preview/safety status is confirmed; individual community security reports were not treated as verified defects in this fork without reproduction/source-delta analysis.
7. **Sandbox environment secret exposure under Full Access.** The audit did not execute commands to enumerate environment variables or credentials.
8. **Preview token lifetime/scope and logging behavior.** The audit did not inspect or use a live sandbox preview token.

## 9. Recommended next actions — audit recommendation only
Priority order for the planning phase:

1. **Establish the public access decision first:** confirm the EdgeOne Console access policy and live behavior for production. If public Internet access is intended, implement explicit login/authentication before any broader rollout.
2. **Bind identity to conversation ownership:** authenticated principal → allowed conversation IDs; remove free-form cross-conversation stop semantics.
3. **Harden model-readable data boundaries:** require approval/deny sensitive workspace files and prevent secret-bearing files from conversation snapshots.
4. **Review Gateway privacy/abuse headers:** formally document or remove `x-prompt-log` and `x-gateway-quota-bypass`; define retention/quota policy.
5. **Reduce token exposure:** redesign preview credential delivery or, if platform-constrained, minimize TTL, referrer propagation, model visibility, and logging.
6. **Strengthen Full Access UX/policy:** explicit elevation, expiry, warning, and optional re-approval for sensitive action classes.
7. **Add endpoint and abuse controls:** request schemas, body limits, route/method allowlists, principal-scoped quotas, and security telemetry.
8. **Treat upstream DSH as untrusted preview software:** pin reviewed versions and run a security-delta audit on each upgrade.
9. **Define browser security headers** and add black-box checks once live deployment access is available.

## 10. Handoff to planning phase
Planning should treat A03-P1-01 and A03-P1-02 as the primary architecture decision: either the app is intentionally an anonymous public coding agent, in which case strong anonymous abuse controls and isolated disposable state must be designed explicitly, or it is a user-owned workspace product, in which case authenticated identity and authorization must become a first-class trust boundary.

A03-P1-03 and A03-P2-05 should be planned together as a data-classification problem: sandbox containment does not prevent the model from reading files it is authorized to access, and persistence extends the lifetime of written content. Sensitive-path policy, secret injection, redaction, and retention should be designed consistently.

A03-P1-04 means the project should not rely on the upstream DSH Web/permission control plane as the sole security control. Outer authentication, EdgeOne sandbox isolation, explicit capability mediation, version pinning, and regression tests are mandatory compensating layers while upstream remains developer preview.

No implementation is included in this audit.

## 11. Appendix
### A. Trust-boundary flow
```text
Browser
  |  same-origin /api/* + makers-conversation-id (client-generated)
  v
EdgeOne Makers Agent route
  |  context.conversation_id / context.store / context.sandbox / context.env
  v
Per-conversation DSH Web sidecar (127.0.0.1)
  |-----------------------> Local AI Gateway proxy (127.0.0.1)
  |                            |
  |                            +--> configured AI Gateway / model provider
  |
  +-----------------------> Local MCP bridge (127.0.0.1)
                               |
                               +--> Makers sandbox files / commands / preview
```

### B. Security-sensitive controls by layer
| Layer | Control observed | Audit note |
|---|---|---|
| Browser | UUID conversation ID in `localStorage` | Routing token, not authentication |
| EdgeOne Agent | Valid conversation header, platform quotas | Auth policy `NOT VERIFIED` |
| DSH sidecar | Loopback bind | Strong local exposure reduction |
| AI Gateway adapter | Real key retained server-side | Prompt-log/quota-bypass policy unresolved |
| MCP bridge | Loopback bind + tool schemas | Read tools auto-approved |
| Makers sandbox | Isolated file/command APIs | Full Access still grants broad in-sandbox capability |
| Workspace helper | Traversal-safe relative paths | Sensitive-file confidentiality not enforced |
| Preview | Platform access token | Token returned in query URL |
| Store | Snapshot size/count bounds | Sensitive content not excluded |

### C. SSRF/open-proxy conclusion
No direct application-level open proxy was confirmed in the inspected source. `agents/api/_proxy.ts` targets `127.0.0.1:<sidecar-port>`, and `agents/_gateway-proxy.ts` uses `AI_GATEWAY_BASE_URL` from server environment configuration rather than a request-controlled URL. This conclusion is limited to these local adapters; upstream DSH/plugin network capabilities and deployed environment configuration were not independently exercised.

### D. Production verification limitation
A non-destructive attempt to access the supplied production URL could not be completed from the available audit execution environment because direct network resolution/fetching of that deployment URL was unavailable. The report therefore does not manufacture a production PASS/FAIL result and records the relevant items as `NOT VERIFIED`.

### E. No-runtime-change attestation
This A03 branch is intended to contain only this Markdown report. No source, dependency, lockfile, generated asset, test, CI/CD, EdgeOne config, runtime config, secret, release, tag, or deployment change is part of this audit.
