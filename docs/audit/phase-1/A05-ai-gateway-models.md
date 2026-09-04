# A05 — AI Gateway, Models, Privacy & Compatibility

## 1. Metadata

- **Repository:** `thanhhaixn92/PQG-Harness`
- **Base branch:** `main`
- **Exact base SHA:** `70119cfdae992a203a5e29eb24e91c7200222a7c`
- **Base tree SHA:** `489ec3e0c02a95acd99b554de9e6769c0523afd6`
- **Audit branch:** `audit/a05-ai-gateway-models`
- **Audit date/time:** 2026-09-04 16:58 ICT (UTC+7)
- **Auditor:** OpenAI GPT-5.6 Sol (ChatGPT)
- **Mode:** audit-only / documentation-only; no model invocation, no secret inspection, no environment mutation, no deploy/release action
- **Production URL supplied for context:** `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/`
- **Verdict:** **PASS WITH RISKS**
- **Severity counts:** P0 = 0, P1 = 2, P2 = 3, P3 = 2

The canonical `main` SHA was verified before the branch was created. The expected SHA in the audit prompt matched the repository head exactly. The current `TencentEdgeOne/deepseek-harness` `main` commit observed during the audit is `2110cc1bb5f6d5436593927fa6a4fa46e6f16407`; its tree SHA is also `489ec3e0c02a95acd99b554de9e6769c0523afd6`, so the audited PQG source tree is byte-for-byte aligned with that current TencentEdgeOne fork tree at the Git tree level. The separate upstream `deepseek-ai/deepseek-harness` `master` head observed on 2026-09-04 is `76fda729799fe9b3848dbe2c211d4b231032b81e` (2026-09-03), which has evolved beyond the package generation represented here.

## 2. Scope

This audit is limited to the AI gateway/model/privacy/compatibility surface requested by A05:

- `.env.example` and README model/gateway environment contract.
- `agents/_gateway-proxy.ts`: OpenAI-compatible request path, request normalization, model fallback, headers, streaming, errors, backpressure, and abort behavior.
- `agents/_dsh-web-sidecar.ts`: Makers provider registration, model catalog/defaults, context/output metadata, settings persistence, and optional DeepSeek provider environment pass-through.
- `agents/api/_proxy.ts`: settings persistence and browser-facing proxy/error boundary where relevant to model configuration/privacy.
- Relevant tests under `tests/`.
- Current official EdgeOne Makers model documentation and current DeepSeek Harness upstream provider documentation.

Out of scope: changing application/runtime code, changing dependencies, reading deployment secrets, reading live environment values, calling any model, changing model selection, changing deployment configuration, running a release/deploy, or merging the audit PR.

## 3. Method

1. Verified canonical `main` at exact SHA `70119cfdae992a203a5e29eb24e91c7200222a7c` and created a fresh branch from that SHA.
2. Performed static source inspection at the exact base SHA via the GitHub repository connector. A local network clone was not used for evidence because the execution environment could not resolve external Git hosts; no repository source was modified locally.
3. Traced the model request path from DSH provider registration to the local gateway proxy and then to `AI_GATEWAY_BASE_URL`.
4. Inspected model default/catalog generation, persistence, optional DeepSeek provider exposure, request role normalization, streaming and abort behavior, and browser-facing error flow.
5. Compared the current hard-coded Makers model list with EdgeOne's official current Models & Vendors documentation.
6. Compared request-compatibility assumptions with current DeepSeek Harness upstream provider guidance.
7. Searched official/public EdgeOne documentation for the exact headers `x-prompt-log` and `x-gateway-quota-bypass`. No official public semantics were located during this audit; their effects are therefore **NOT VERIFIED** rather than inferred as facts.
8. Did **not** invoke models, inspect API keys, inspect live deployment environment values, modify any environment variable, or change deployment/model configuration.

### Current external references (accessed 2026-09-04)

- EdgeOne Makers — Models & Vendors overview: <https://pages.edgeone.ai/document/models-vendors-overview>
- EdgeOne Makers — Models overview: <https://pages.edgeone.ai/document/models>
- EdgeOne Makers — Makers Models integration: <https://pages.edgeone.ai/document/makers-models-integration>
- EdgeOne Makers — Agents quick start: <https://pages.edgeone.ai/document/agents-quick-start>
- DeepSeek Harness current provider guide at upstream SHA `76fda729799fe9b3848dbe2c211d4b231032b81e`: <https://github.com/deepseek-ai/deepseek-harness/blob/76fda729799fe9b3848dbe2c211d4b231032b81e/docs/user/guide/providers.md>
- DeepSeek Harness current pi-ai configuration reference: <https://github.com/deepseek-ai/deepseek-harness/blob/76fda729799fe9b3848dbe2c211d4b231032b81e/docs/config-catalog.md>

## 4. Architecture / current-state

### 4.1 Request path

`agents/_dsh-web-sidecar.ts::writeProfilePatch()` registers a custom DSH pi-ai provider named `edgeone-makers`. DSH is configured with:

- API protocol `openai-completions`;
- a local base URL returned by `startLocalGatewayProxy()` (`http://127.0.0.1:<port>/v1`);
- environment credential name `MAKERS_GATEWAY_API_KEY`;
- the process-local value `MAKERS_GATEWAY_API_KEY=makers-proxy`, which is a sentinel/dummy token rather than the actual Makers key.

The local gateway proxy accepts only `POST /v1/chat/completions`, normalizes the request, then sends it to `${AI_GATEWAY_BASE_URL-with-trailing-slashes-removed}/chat/completions` using the actual `AI_GATEWAY_API_KEY` from server-side `context.env`.

For the documented Makers value `AI_GATEWAY_BASE_URL=https://ai-gateway.edgeone.link/v1`, this resolves to the officially documented endpoint `https://ai-gateway.edgeone.link/v1/chat/completions`. Therefore the code path and documented `/v1` convention are consistent.

### 4.2 Default model and catalog

The project advertises and defaults to `@makers/deepseek-v4-flash` when `AI_GATEWAY_MODEL` is absent. The sidecar hard-codes these seven Makers built-in IDs:

- `@makers/hy3`
- `@makers/hy3-preview`
- `@makers/deepseek-v4-pro`
- `@makers/deepseek-v4-flash`
- `@makers/minimax-m3`
- `@makers/minimax-m2.7`
- `@makers/kimi-k2.6`

As of 2026-09-04, this list exactly matches EdgeOne's current official built-in model list. However, the code assigns **every** catalog entry `contextWindow: 1000000` and `maxTokens: 256000`, regardless of provider/model.

### 4.3 Provider compatibility normalization

Before forwarding, `normalizeGatewayRequest()` rewrites every message whose role is `developer` to `system`, preserving the rest of the message object. This is unconditional and independent of model/provider.

Current DeepSeek Harness upstream documentation explains that pi-ai request shape is provider/baseURL dependent: reasoning models can use the `developer` role, while many OpenAI-compatible gateways reject it; the current upstream exposes compatibility switches such as `compat.supportsDeveloperRole` and `compat.maxTokensField` so this decision can be route/model specific. The project instead applies one global wire transformation at its local gateway adapter.

### 4.4 Streaming, abort, and errors

- The local gateway sends `Accept: text/event-stream` and forwards the request body unchanged apart from normalization/default model insertion.
- It streams the upstream response body chunk-by-chunk and honors Node response backpressure via `drain`.
- It creates an `AbortController` for the upstream `fetch()` and aborts it when the client response closes before normal completion.
- It forwards the upstream status and almost all upstream response headers, excluding only `content-length` and `transfer-encoding`.
- Local gateway exceptions become HTTP 502 with `error: AI_GATEWAY_PROXY_FAILED` and the exception message.
- DSH API proxy exceptions similarly return `DSH_WEB_PROXY_FAILED` plus the exception message.

### 4.5 Model selection persistence

`restoreDshSettingsYaml()` and `snapshotDshSettingsYaml()` persist `settings.yaml` as conversation metadata under `dshSettingsYaml`; settings writes are snapshotted after successful DSH settings mutations. `ensureMakersDefaultModelSettings()` preserves an existing default when the saved provider is already `edgeone-makers`, so an explicitly selected Makers model can survive sidecar recreation. Current upstream DSH documentation additionally states that selecting a model sets the default for new sessions while an already-started session retains the model recorded in its log.

### 4.6 Optional direct DeepSeek provider

The sidecar reads `DEEPSEEK_API_KEY` and `DEEPSEEK_BASE_URL` and, if present, passes them into the spawned official DSH process. This does **not** implement automatic failure fallback from Makers to DeepSeek. It makes the official direct DeepSeek provider available alongside `edgeone-makers`; data can leave the Makers gateway path when that direct provider/model is deliberately selected (or an existing session is already bound to it). README explicitly tells operators to leave these variables unset unless that provider is desired.

## 5. Evidence inventory

| Evidence | Status | What it establishes |
|---|---|---|
| `main` commit `70119cfdae992a203a5e29eb24e91c7200222a7c` | CONFIRMED | Exact audit baseline. |
| `.env.example` at base SHA | CONFIRMED | `AI_GATEWAY_MODEL=@makers/deepseek-v4-flash`; base URL and key placeholders only. |
| `README.md`, “Environment Variables” / “Provider fallbacks” | CONFIRMED | Makers base URL requires `/v1`; built-in default is for prototyping; production should use BYOK; `DEEPSEEK_*` is optional/direct-provider exposure. |
| `agents/_gateway-proxy.ts::normalizeGatewayRequest` | CONFIRMED | Unconditional `developer` → `system` rewrite. |
| `agents/_gateway-proxy.ts::startLocalGatewayProxy` | CONFIRMED | `/v1/chat/completions` local route, actual gateway URL construction, model fallback, headers, SSE pass-through, backpressure, abort and error behavior. |
| `agents/_dsh-web-sidecar.ts::MAKERS_MODELS`, `modelYaml`, `writeProfilePatch`, `startSidecar` | CONFIRMED | Catalog IDs, uniform 1M/256k metadata, local Makers provider, dummy sidecar key, optional `DEEPSEEK_*` pass-through. |
| `agents/_dsh-web-sidecar.ts::ensureMakersDefaultModelSettings` | CONFIRMED | Preserves existing Makers-provider default, migrates non-Makers default to Makers at sidecar setup. |
| `agents/api/_proxy.ts::snapshotSettingsAfterWrite` | CONFIRMED | Successful settings changes are snapshotted to conversation metadata. |
| `tests/gateway-proxy.test.ts` | CONFIRMED | Test explicitly expects `developer` → `system`; no provider-specific coverage. |
| `tests/sidecar-settings.test.ts` | CONFIRMED | Restore/snapshot persistence behavior is tested. |
| `tests/config.test.ts`, “sidecar registers a custom Makers provider…” | CONFIRMED | Tests assert the seven catalog IDs and that Makers does not overwrite the official DeepSeek provider credentials. |
| EdgeOne Models & Vendors overview, accessed 2026-09-04 | CONFIRMED | Current seven built-in IDs exactly match code; built-ins are for validation and official page says not to use them in production; Makers OpenAI base URL is `/v1`. |
| EdgeOne Models integration, accessed 2026-09-04 | CONFIRMED | BYOK provider keys are hosted/encrypted; app still uses Makers gateway key; model list may update; vendor IDs use `<provider>/<model>`. |
| EdgeOne Models overview, accessed 2026-09-04 | CONFIRMED | Unified endpoint, OpenAI-compatible use, native SSE, and recommended backend proxy so keys are not exposed to frontend. |
| Current DeepSeek Harness provider guide at SHA `76fda729...` | CONFIRMED | Provider/baseURL request-shape compatibility matters; many gateways reject `developer`; route/model `compat` should control such differences; selection/session model persistence semantics. |
| Public official semantics for `x-prompt-log` | NOT VERIFIED | Exact-header searches of current EdgeOne public documentation did not locate a definition. |
| Public official semantics for `x-gateway-quota-bypass` | NOT VERIFIED | Exact-header searches of current EdgeOne public documentation did not locate a definition. |
| Live production values of `AI_GATEWAY_*` / `DEEPSEEK_*` | NOT VERIFIED | Intentionally not read under audit rules. |
| Live production prompt retention/logging behavior | NOT VERIFIED | No model/API calls or privileged platform inspection permitted. |

## 6. Findings

### A05-P1-01 — Built-in Makers model remains the code/config fallback for a production-shaped deployment

- **Severity:** P1
- **Status:** CONFIRMED for source/default behavior; live production env override is NOT VERIFIED.
- **Evidence:**
  - `.env.example` at base SHA: `AI_GATEWAY_MODEL=@makers/deepseek-v4-flash`.
  - `agents/_dsh-web-sidecar.ts::DEFAULT_MAKERS_MODEL` and `startSidecar()` fall back to `@makers/deepseek-v4-flash` when `AI_GATEWAY_MODEL` is empty.
  - `agents/_gateway-proxy.ts::startLocalGatewayProxy()` also inserts `@makers/deepseek-v4-flash` when a request has no model and `AI_GATEWAY_MODEL` is empty.
  - `README.md` calls the template “production-shaped” but also correctly says the built-in model is suitable for prototyping and production should bind a paid provider.
  - EdgeOne Models & Vendors overview, accessed 2026-09-04: built-in models are for technical validation and explicitly “Do not use it in production environments.” <https://pages.edgeone.ai/document/models-vendors-overview>
- **Technical analysis:** Two independent fallback points make the built-in model the effective safety net whenever the deployment does not supply a usable paid/BYOK model ID. This is internally consistent but not production-safe according to the platform's own current guidance. The project cannot prove from source whether the supplied production deployment overrides this value; audit rules prohibit inspecting that environment.
- **Impact:** A production deployment with missing/misconfigured `AI_GATEWAY_MODEL` can silently use a free/limited validation model that has no production quality guarantee and may be rate-limited or feature-restricted.
- **Recommendation:** Before public/stable release, add a deployment-readiness gate (implementation work outside this audit) that distinguishes production from development and fails closed if a production environment resolves to an `@makers/*` built-in model. Keep the friendly built-in default for local/demo use if desired.
- **Dependency / interaction:** Coordinate with deployment/production-smoke audit (A12) and operations/governance (A11) to verify, without exposing secrets, that the live production model is a production-supported BYOK/native route.

### A05-P1-02 — `x-prompt-log: true` is unconditionally emitted but its official retention/privacy semantics are not publicly verified

- **Severity:** P1
- **Status:** NOT VERIFIED for platform semantics; header emission itself is CONFIRMED.
- **Evidence:** `agents/_gateway-proxy.ts::startLocalGatewayProxy()` sends `x-prompt-log: 'true'` on every upstream model request. Exact-header searches of official EdgeOne/Makers public documentation on 2026-09-04 did not locate a definition for `x-prompt-log`.
- **Technical analysis:** The name strongly suggests prompt logging, but this audit does **not** treat that suggestion as fact. The material issue is that a privacy-sensitive, undocumented header is enabled unconditionally while the application handles arbitrary user/code prompts. Without an authoritative contract, retention scope, access controls, redaction behavior, tenant isolation, regional handling, and whether the header is ignored/required/internal are unknown.
- **Impact:** Privacy posture cannot be signed off for public/stable release because model prompts may be subject to an unverified logging behavior. The risk is amplified by coding-agent prompts potentially containing source snippets, filenames, build output, or user-provided confidential material.
- **Recommendation:** Obtain an authoritative EdgeOne contract for the header before release. If it enables optional prompt logging, make privacy-preserving behavior the default and gate any logging behind explicit, documented operator/user policy with retention/redaction controls. If it is required internal plumbing with no persistence effect, document that evidence and downgrade/close this finding.
- **Dependency / interaction:** A03 security/trust/secrets for data-handling policy; A11 documentation/governance for privacy disclosure; platform owner for authoritative header semantics.

### A05-P2-01 — Every Makers catalog model is declared as 1,000,000 context / 256,000 max output without per-model evidence

- **Severity:** P2
- **Status:** INFERRED risk; uniform metadata assignment is CONFIRMED, validity for all models is NOT VERIFIED.
- **Evidence:** `agents/_dsh-web-sidecar.ts::modelYaml()` emits `contextWindow: 1000000` and `maxTokens: 256000` for every entry from `MAKERS_MODELS`. Current EdgeOne Models & Vendors documentation lists the IDs but does not publish these capacities on the audited page. Current DeepSeek Harness direct-provider documentation supports these values for its DeepSeek V4 defaults, but that is not evidence for `@makers/hy3`, `@makers/hy3-preview`, `@makers/minimax-m3`, `@makers/minimax-m2.7`, or `@makers/kimi-k2.6`.
- **Technical analysis:** In DSH/pi-ai, model capacity metadata influences model resolution and request/default budgeting. Applying the largest DeepSeek-style values to unrelated providers turns unknown capability into an asserted capability. If an upstream model has a smaller context/output limit, DSH may compact too late or request a larger output budget than the route accepts. The EdgeOne gateway may reject such requests, but no model calls were allowed in this audit.
- **Impact:** Long-running agent sessions can fail late with context/output-limit errors, and UI/model capability display can be misleading. Failure likelihood grows as sessions accumulate tool output and conversation history.
- **Recommendation:** Replace universal constants with authoritative per-model metadata, gateway-discovered metadata where supported, or conservative documented fallbacks. Treat unknown as unknown rather than cloning DeepSeek limits to all providers.
- **Dependency / interaction:** A08 dependencies/compatibility if adopting newer DSH model catalog/discovery behavior; A09 tests/quality for provider-specific boundary tests.

### A05-P2-02 — Global `developer` → `system` rewriting overrides provider/model-specific wire semantics

- **Severity:** P2
- **Status:** INFERRED compatibility impact; transformation is CONFIRMED.
- **Evidence:**
  - `agents/_gateway-proxy.ts::normalizeGatewayRequest()` rewrites all `developer` roles to `system` before any upstream route is considered.
  - `tests/gateway-proxy.test.ts` codifies that unconditional behavior.
  - Current DeepSeek Harness upstream provider guide at SHA `76fda729...` states that unknown/private OpenAI-compatible endpoints can differ in support for `developer`, and provides route/model compatibility settings (`supportsDeveloperRole`, `maxTokensField`, etc.) rather than a universal transformation. <https://github.com/deepseek-ai/deepseek-harness/blob/76fda729799fe9b3848dbe2c211d4b231032b81e/docs/user/guide/providers.md>
- **Technical analysis:** The rewrite is useful for gateways that reject OpenAI's `developer` role, but it also removes the distinction for routes/models that natively support or expect it. Makers can route to multiple vendors; native/custom `AI_GATEWAY_BASE_URL` is also supported. Therefore one gateway-level normalization cannot be proven correct for all allowed providers. Exact behavior for every EdgeOne vendor mapping is NOT VERIFIED.
- **Impact:** Provider-specific instruction hierarchy or request compatibility can diverge from DSH's intended behavior, particularly when switching to an OpenAI-native reasoning model or another endpoint whose wire contract supports `developer`.
- **Recommendation:** Move role compatibility into provider/model-specific configuration. Prefer DSH/pi-ai `compat.supportsDeveloperRole` (or the equivalent available in the pinned version) and only normalize when the target route is known to require it. Add tests for at least one route that rejects `developer` and one route that preserves it.
- **Dependency / interaction:** A08 for DSH version capability; A09 for compatibility regression coverage.

### A05-P2-03 — Model catalog is currently synchronized, but hard-coded discovery creates predictable staleness

- **Severity:** P2
- **Status:** CONFIRMED maintenance risk; catalog is current as of audit date.
- **Evidence:**
  - `agents/_dsh-web-sidecar.ts::MAKERS_MODELS` hard-codes seven IDs.
  - EdgeOne Models & Vendors overview accessed 2026-09-04 lists exactly the same seven IDs, so there is no present-day ID drift.
  - EdgeOne Makers Models integration explicitly notes that the model list may be updated and recommends copying the complete currently available ID from the console/official overview. <https://pages.edgeone.ai/document/makers-models-integration>
  - `makersModelCatalog()` only prepends the configured `AI_GATEWAY_MODEL` if it is absent; it does not discover the full current gateway catalog.
- **Technical analysis:** The selector is accurate today because source and docs happen to match. It will become stale whenever EdgeOne adds/removes/renames a built-in model unless this repo is manually updated. BYOK models are not represented as a full dynamic vendor catalog; only a specifically configured model can be injected into the custom Makers list.
- **Impact:** Users can see removed models, miss newly available models, or rely on labels/capability metadata that no longer matches the gateway.
- **Recommendation:** Prefer gateway model discovery or a generated/versioned catalog source, with graceful handling of unknown configured IDs. If dynamic discovery is intentionally avoided, document an update cadence and add a CI drift check against an authoritative machine-readable source if EdgeOne provides one.
- **Dependency / interaction:** A09 for drift test/CI ownership; A11 for maintenance ownership and release checklist.

### A05-P3-01 — `x-gateway-quota-bypass: true` is unconditional and publicly undocumented in the evidence reviewed

- **Severity:** P3
- **Status:** NOT VERIFIED for platform semantics; header emission is CONFIRMED.
- **Evidence:** `agents/_gateway-proxy.ts::startLocalGatewayProxy()` sends `x-gateway-quota-bypass: 'true'` on every upstream request. Exact-header searches of official EdgeOne public documentation on 2026-09-04 did not locate a definition.
- **Technical analysis:** The audit cannot establish whether this is a required Makers-internal marker, a no-op for normal keys, a privileged quota-control signal, or something else. Because it is unconditional, the repository currently depends on undocumented behavior.
- **Impact:** Low-to-medium operational/governance uncertainty: quota accounting, rate-limit expectations, or portability to native/custom OpenAI-compatible endpoints may differ from what operators expect. There is no evidence in this audit that the header actually bypasses a quota.
- **Recommendation:** Obtain the authoritative contract. If Makers-specific, send it only to the Makers endpoint under an explicit route check; if unnecessary, remove it in implementation work; if required, document why and how it interacts with quotas.
- **Dependency / interaction:** A11 operations/governance and A12 production behavior.

### A05-P3-02 — Proxy error surfaces expose raw exception messages and most upstream response headers

- **Severity:** P3
- **Status:** CONFIRMED.
- **Evidence:** `agents/_gateway-proxy.ts` returns `error.message` in `AI_GATEWAY_PROXY_FAILED`; `agents/api/_proxy.ts` returns `error.message` in `DSH_WEB_PROXY_FAILED`; gateway success/error responses copy upstream headers except `content-length` and `transfer-encoding`.
- **Technical analysis:** No code path inspected returns `AI_GATEWAY_API_KEY`, and the Authorization request header is not copied back to the browser. However, raw networking/provider exceptions and arbitrary upstream response headers can disclose endpoint names, provider implementation details, request IDs, infrastructure hints, or vendor-specific diagnostics. This is primarily an information-minimization issue rather than a demonstrated secret leak.
- **Impact:** Minor information disclosure and inconsistent privacy/error UX. If an upstream ever returns sensitive diagnostic headers, the current broad pass-through would expose them.
- **Recommendation:** Use an allowlist for browser-relevant response headers (content type, cache/streaming/request IDs as needed) and return stable public error codes/messages while retaining detailed diagnostics only in a redacted server-side log/trace policy.
- **Dependency / interaction:** A03 security error disclosure; A09 observability/redaction.

## 7. Good / preserve

1. **Makers `/v1` path is internally consistent.** README explicitly instructs `AI_GATEWAY_BASE_URL=https://ai-gateway.edgeone.link/v1`; the local adapter appends `/chat/completions`, matching official EdgeOne OpenAI examples.
2. **Actual gateway key is not intentionally exposed to the DSH browser/frontend.** The real `AI_GATEWAY_API_KEY` is read inside the server-side local proxy. The DSH child receives only `MAKERS_GATEWAY_API_KEY=makers-proxy`. EdgeOne's recommended pattern is likewise frontend → backend proxy → model service.
3. **No automatic Makers→DeepSeek failover was found.** Optional `DEEPSEEK_*` variables expose the official DeepSeek provider only when deliberately configured; Makers request failure does not trigger a retry to DeepSeek in `_gateway-proxy.ts`.
4. **README documents the direct-provider egress boundary.** It explicitly says to leave `DEEPSEEK_*` unset unless that provider should appear alongside `edgeone-makers`.
5. **Streaming path is simple and backpressure-aware.** Upstream chunks are written progressively and `drain` is awaited when required.
6. **Client disconnect aborts active upstream work.** The gateway's `AbortController` is wired to premature response close.
7. **Upstream HTTP status is preserved.** Provider errors are not blindly rewritten to 200 responses.
8. **Current seven model IDs match EdgeOne official documentation as of 2026-09-04.** The finding is future drift/metadata, not a present ID mismatch.
9. **Makers model selection has a persistence path.** Saved Makers defaults are preserved, settings writes are snapshotted, and settings are restored for the same conversation.
10. **Secrets are not stored in this repository.** `.env.example` contains placeholders, and no actual key value was read or printed during audit.

## 8. Gaps and NOT VERIFIED

The following items remain explicitly **NOT VERIFIED** and must not be interpreted as passing controls:

1. Exact official semantics, retention, and access controls for `x-prompt-log`.
2. Exact official semantics and quota/accounting effect for `x-gateway-quota-bypass`.
3. Live production values of `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_MODEL`, `DEEPSEEK_API_KEY`, and `DEEPSEEK_BASE_URL`.
4. Whether the supplied production deployment currently uses a BYOK/production-supported model rather than an `@makers/*` built-in.
5. Per-model authoritative `contextWindow` and `maxTokens` for `@makers/hy3`, `@makers/hy3-preview`, `@makers/minimax-m3`, `@makers/minimax-m2.7`, and `@makers/kimi-k2.6`; EdgeOne's audited overview page did not publish these values.
6. Exact provider-specific behavior of `developer` vs `system` for every vendor routed through Makers; the current DSH upstream only establishes that gateways vary and compatibility must be route/model aware.
7. Runtime/platform guarantees that `context.env` values can never be surfaced through platform diagnostics, crash dumps, or operator logs; source code does not expose the key to the browser, but platform internals were not inspectable in this audit.
8. Live SSE behavior, upstream cancellation propagation, and provider error bodies against the real production gateway, because model/API calls were prohibited.
9. Whether current deployment environment includes inherited `DEEPSEEK_*` values. If present, a deliberate direct-DeepSeek selection creates non-Makers egress; no automatic fallback path was found.
10. Build/test execution in a local clone was not used as evidence because the audit execution environment could not resolve external Git hosts. Static tests were inspected at the exact SHA; no source change was made that required code test execution.

## 9. Recommended next actions

Priority order for release planning:

1. **Resolve P1 privacy contract:** obtain authoritative meaning of `x-prompt-log`; make retention behavior explicit and privacy-preserving before public/stable release.
2. **Verify production model posture without exposing secrets:** confirm the production deployment does not resolve to an `@makers/*` validation model and document the supported BYOK/native model route.
3. **Replace universal model capacities:** source model-specific context/output metadata from an authoritative catalog or conservative per-model configuration.
4. **Make request-role compatibility route/model specific:** stop global `developer` → `system` rewriting once equivalent provider compat can be configured safely.
5. **Remove catalog drift as a manual-only process:** use discovery/generated metadata or add an explicit CI/release drift check.
6. **Clarify `x-gateway-quota-bypass`:** document and scope it to Makers if required.
7. **Reduce browser error/header disclosure:** allowlist response headers and stabilize public error messages.
8. **Add focused tests:** provider-role matrix, capacity boundary behavior, custom/BYOK model IDs, SSE abort, and no-secret/browser-exposure assertions.

## 10. Handoff planning

### A03 — Security / Authentication / Trust / Secrets

- Own policy review for raw proxy error disclosure and prompt logging/privacy classification.
- Validate that any operational logging/trace tooling redacts credentials and sensitive prompt content where required.

### A08 — Dependencies / Supply Chain / Compatibility

- Assess upgrade implications from the project's DSH `0.1.0-rc.6` generation to the current upstream line. Current upstream has a richer provider compatibility surface; A05 does not recommend or perform the upgrade itself.

### A09 — Tests / Quality / CI / Observability

- Add provider compatibility matrix tests and model-metadata drift tests.
- Add long-context/output-boundary tests without requiring real paid model calls where a deterministic adapter/mock can prove behavior.
- Add regression coverage that browser-visible errors never contain credentials.

### A11 — Documentation / Licensing / Operations / Governance

- Document production model/BYOK policy and ownership of catalog updates.
- Document privacy/retention semantics once `x-prompt-log` is authoritatively resolved.
- Document quota behavior if `x-gateway-quota-bypass` is required.

### A12 — Blackbox Production Smoke

- Verify non-secret production facts only: model class/support posture where observable without a model invocation, correct static deployment behavior, and safe generic failure handling. Do not expose or print environment secrets.

## 11. Appendix

### 11.1 Mandatory question answers

**Q1. Is `AI_GATEWAY_BASE_URL` expected to include `/v1`, and is the code path consistent?**  
**CONFIRMED.** For Makers Models, current EdgeOne official examples use `https://ai-gateway.edgeone.link/v1`. The proxy strips trailing slashes and appends `/chat/completions`, producing `/v1/chat/completions`. README documents the same value. For native/custom providers, the operator must supply a base URL whose version prefix matches that provider; the proxy does not add `/v1` automatically.

**Q2. What are the official semantics of `x-gateway-quota-bypass` and `x-prompt-log`?**  
**NOT VERIFIED.** Both headers are unconditionally emitted by source. Exact-header searches of current official EdgeOne public documentation on 2026-09-04 did not yield an authoritative definition. No semantic claim (including that quotas are actually bypassed or prompts are actually retained) is treated as confirmed.

**Q3. When is `developer` → `system` normalization compatible?**  
**INFERRED / provider-dependent.** Current DeepSeek Harness upstream explicitly documents that many OpenAI-compatible gateways reject `developer`, so normalization can improve compatibility for those routes. But routes/models that natively support the OpenAI `developer` role should not be globally flattened. Current upstream provides provider/model compatibility switches for this reason. Exact behavior of every Makers vendor mapping remains NOT VERIFIED.

**Q4. Is the model catalog stale?**  
**CONFIRMED current, structurally drift-prone.** The seven IDs exactly match EdgeOne official documentation on 2026-09-04. EdgeOne also states the model list may be updated. The repo has no full dynamic discovery for this custom Makers catalog, so future staleness is predictable.

**Q5. Is there evidence for `contextWindow=1,000,000` and `maxTokens=256,000` for each model?**  
**NOT VERIFIED for the full catalog.** Current DeepSeek Harness direct-provider documentation uses those values for DeepSeek V4 defaults. The audited EdgeOne model overview does not establish those capacities for every `@makers/*` model, especially Hunyuan, MiniMax, and Kimi entries. Applying them uniformly is therefore not adequately evidenced.

**Q6. When can `DEEPSEEK_*` cause data to leave Makers?**  
**CONFIRMED behavior.** When `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` are present, the sidecar passes them to the official DSH process, allowing its direct DeepSeek provider to be selected. A request/session using that direct provider can go to the configured DeepSeek endpoint instead of Makers. No automatic gateway-failure failover to DeepSeek was found. README documents the operator choice and recommends leaving the variables unset unless desired.

**Q7. Can the actual AI gateway API key leak to the frontend?**  
**No source-level exposure was found; platform-level guarantee NOT VERIFIED.** The real `AI_GATEWAY_API_KEY` is read only by the server-side gateway proxy. DSH receives a dummy `makers-proxy` credential for its localhost provider. No inspected response echoes Authorization or the actual key. This aligns with EdgeOne's documented backend-proxy pattern. However, live platform diagnostics/logging were not inspectable, so an absolute platform-wide non-exposure guarantee is not claimed.

### 11.2 Source evidence anchors

All repository evidence below is pinned to base SHA `70119cfdae992a203a5e29eb24e91c7200222a7c`:

- <https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/.env.example>
- <https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/README.md>
- <https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/agents/_gateway-proxy.ts>
- <https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/agents/_dsh-web-sidecar.ts>
- <https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/agents/api/_proxy.ts>
- <https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/tests/gateway-proxy.test.ts>
- <https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/tests/sidecar-settings.test.ts>
- <https://github.com/thanhhaixn92/PQG-Harness/blob/70119cfdae992a203a5e29eb24e91c7200222a7c/tests/config.test.ts>

### 11.3 Release interpretation

`PASS WITH RISKS` means the architecture is coherent enough to proceed to planning, but it is **not** a statement that privacy, production model support, or provider compatibility is fully verified. The two P1 items should be resolved or explicitly accepted with authoritative evidence before treating the project as public/stable production-ready.
