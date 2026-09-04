# A09 — Tests, quality gates, CI strategy & observability

## 1. Metadata
- Repository: `thanhhaixn92/PQG-Harness`
- Base branch: `main`
- Exact base SHA: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- Audit date/time: `2026-09-04 17:02 +07:00` (Asia/Bangkok)
- Auditor/subagent: `A09`
- Verdict: **PARTIAL**

The expected baseline SHA in the audit prompt matches the canonical `main` SHA observed at audit start. No baseline drift was detected.

## 2. Scope

This audit is documentation-only and covers the test suite, test quality, capability-level coverage, current CI/check posture, missing runtime smoke coverage, and EdgeOne-native observability for `PQG-Harness`.

In scope:
- inventory and classification of all repository tests;
- capability coverage rather than file-count coverage;
- evaluation of behavior tests versus source/regex contract tests;
- verification attempt for `npm test`, `npm run typecheck`, and `npm run build` in an isolated temporary clone;
- GitHub Actions, commit status/check-run, and branch-protection posture;
- runtime-critical test gaps for gateway, SSE, sidecar, store/workspace, MCP approval, cancellation, export, and preview;
- EdgeOne Makers logs, metrics, traces, and the observability boundary around the spawned DSH sidecar;
- a minimal CI recommendation that does **not** introduce a second deployment pipeline.

Out of scope:
- implementation of tests, workflows, telemetry, runtime changes, dependency updates, generated asset updates, EdgeOne configuration changes, secrets, releases, deployment, or merge;
- deep re-audit of security, dependency/supply-chain, frontend accessibility/localization, deployment quotas, or production black-box behavior owned by other audit domains.

## 3. Method

1. Verified canonical `main` and exact SHA through the GitHub branch API.
2. Inspected the complete repository tree at the exact base SHA and identified all test files and first-party runtime/build files relevant to this domain.
3. Read `package.json`, `tsconfig.json`, `edgeone.json`, README, all six test files, and key runtime/build modules:
   - `agents/_gateway-proxy.ts`
   - `agents/api/_proxy.ts`
   - `agents/_dsh-web-sidecar.ts`
   - `agents/_mcp-bridge.ts`
   - `agents/_workspace.ts`
   - `agents/stop.ts`
   - `scripts/generate-dsh-api-routes.mjs`
4. Classified each existing test as source-contract, unit behavior, mock integration, real integration, or E2E.
5. Queried GitHub Actions runs, commit statuses, check-runs, and branch protection for the exact base SHA/main branch.
6. Reviewed current official EdgeOne Makers documentation for Agent logs, automatic tracing, metrics/traces, local `/agent-metrics`, and Git-triggered deployment.
7. Attempted to create a temporary local clone solely to run the required commands. The clone failed before checkout because the execution environment could not resolve `github.com`; therefore the three required npm commands are recorded as **NOT VERIFIED**, not guessed.
8. Created this report on a dedicated audit branch only. No source/runtime/test/config/generated file is intentionally changed by A09.

### Verification attempt for required commands

| Command | Exact result | Duration | Dirty files | Status |
|---|---|---:|---|---|
| `git clone --no-checkout https://github.com/thanhhaixn92/PQG-Harness.git repo` in `/tmp/pqg-a09` | Failed with exit status `128`: `fatal: unable to access 'https://github.com/thanhhaixn92/PQG-Harness.git/': Could not resolve host: github.com` | Not measured | N/A; checkout never occurred | CONFIRMED execution-environment failure |
| `npm test` | Not started because no isolated checkout could be materialized | N/A | N/A | **NOT VERIFIED** |
| `npm run typecheck` | Not started because no isolated checkout could be materialized | N/A | N/A | **NOT VERIFIED** |
| `npm run build` | Not started because no isolated checkout could be materialized | N/A | N/A | **NOT VERIFIED** |

No generated output from a test/build command was committed because none of the required npm commands could be started in the temporary clone.

## 4. Architecture / current-state summary

The repository is a TypeScript EdgeOne Makers Agent application that packages the DeepSeek Harness Web UI and starts a per-conversation DSH Web child process. The key runtime boundaries are:

1. **Browser ↔ Host API proxy** — generated `agents/api/*.ts` routes forward Host API requests through `agents/api/_proxy.ts`; WebSocket event streams from the DSH sidecar are converted to SSE.
2. **DSH sidecar lifecycle** — `agents/_dsh-web-sidecar.ts` allocates per-conversation ports/home directories, starts a local AI Gateway proxy and local MCP bridge, spawns `dsh web`, waits for readiness, creates a workspace, snapshots settings, and closes idle/stopped processes.
3. **Model gateway** — `agents/_gateway-proxy.ts` maps DSH OpenAI-compatible requests to `AI_GATEWAY_*`, normalizes `developer` messages to `system`, adds Makers conversation routing headers, and streams the upstream body back to DSH.
4. **MCP and permission model** — `agents/_mcp-bridge.ts` exposes Makers sandbox/workspace/preview tools; `_makers-mcp-permission.mjs` determines allow-versus-ask behavior by permission mode.
5. **Workspace/store persistence** — `agents/_workspace.ts` validates relative paths, scopes roots by conversation, persists bounded snapshots to conversation metadata, restores them, runs sandbox commands, and publishes previews.
6. **Cancellation** — `agents/stop.ts` stops the DSH sidecar and invokes `context.utils.abortActiveRun(conversationId)`; the MCP bridge also exposes `sandbox_wait` specifically to support cancellation validation.
7. **Build preparation** — `npm test` and `npm run build` both invoke `prepare:dsh-web`; route generation writes `agents/api/*`, while the DSH web preparation manages committed/generated web assets.
8. **Deployment** — `edgeone.json` declares `npm ci`, `npm run build:makers`, Node 24, and Makers Agent runtime settings. EdgeOne Git deployment is expected to build/deploy changes to the production branch; A09 does not add or recommend a second deployment mechanism.

## 5. Evidence inventory

### Repository evidence at exact base SHA

| Evidence | Observation |
|---|---|
| `package.json` | `test = npm run prepare:dsh-web && node --experimental-strip-types --test tests/*.test.ts`; `typecheck = tsc --noEmit`; `build = npm run prepare:dsh-web && vite build`; `build:makers` performs additional runtime/native preparation and pruning. |
| `tsconfig.json` | Strict TypeScript, `noEmit`, includes `agents/**/*.ts`, `src/**/*.ts`, and `tests/**/*.ts`. |
| `edgeone.json` | Node `24`; `agents.framework = openai-sdk`; Agent and sandbox timeouts `300`; production build command is `npm run build:makers`. |
| `tests/` | Exactly six test files at the base SHA. |
| `agents/_gateway-proxy.ts` | Real loopback HTTP streaming proxy exists; only request normalization is directly unit-tested. |
| `agents/api/_proxy.ts` | Real WS→SSE bridge, Host API forwarding, settings persistence hook, preset lock, and binary session-export handling exist. Most corresponding tests inspect source text. |
| `agents/_dsh-web-sidecar.ts` | Spawns DSH child process, waits for readiness, initializes workspace, persists settings, kills/cleans up. Sets `DSH_TELEMETRY_DISABLED=1` for the child. |
| `agents/_mcp-bridge.ts` | Registers context/sandbox/workspace/command/preview tools and `sandbox_wait`; local MCP HTTP bridge exists. |
| `agents/_workspace.ts` | Path validation, snapshot restore/save, sandbox command execution, and preview publication are implemented. |
| `agents/stop.ts` | Dual stop path: `stopDshWebSidecar()` plus optional `context.utils.abortActiveRun()`. |
| `scripts/generate-dsh-api-routes.mjs` | Build preparation rewrites generated Host API route files. |
| GitHub repository tree | No `.github/` directory exists at the base SHA. |
| GitHub Actions runs for `main` | `total_count = 0`. |
| Commit statuses for base SHA | No statuses (`total_count = 0`). |
| Check-runs for base SHA | No check-runs (`total_count = 0`). |
| `main` branch protection | `protected = false`; protection disabled; required status-check contexts/checks empty. |

### Existing test inventory and classification

There are **34 test cases** across six files.

| Test file | Cases | Primary classification | Quality/value assessment |
|---|---:|---|---|
| `tests/config.test.ts` | 7 | Source/config-contract | Useful as packaging invariants, but predominantly regex/source-shape assertions rather than executed runtime behavior. |
| `tests/dsh-web.test.ts` | 11 | Source-contract | Broad generated-UI coverage, but all observed cases inspect emitted source/HTML/bundle text. High breadth, low runtime proof. |
| `tests/gateway-proxy.test.ts` | 1 | Unit behavior | Valuable but narrow: verifies only `developer`→`system` normalization and preservation of other fields. |
| `tests/mcp-permission.test.ts` | 7 | 5 unit behavior, 1 mock integration, 1 source-contract | Strongest domain coverage: permission algebra and pre-execute decisions are behaviorally checked. Still no real MCP transport/tool invocation. |
| `tests/sidecar-settings.test.ts` | 4 | Mock integration | Good focused persistence tests using temporary filesystem plus mocked store. Does not prove the real DSH/settings API round trip. |
| `tests/workspace.test.ts` | 4 | 2 unit behavior, 2 mock integration | Valuable path traversal/root isolation and write/persistence behavior. Does not exercise real sandbox command/list/read/preview. |

Aggregate classification:

| Type | Cases | Share | Runtime significance |
|---|---:|---:|---|
| Source/config-contract | 19 | 55.9% | Confirms text/shape invariants; does not prove execution behavior. |
| Direct unit behavior | 8 | 23.5% | Proves deterministic local logic. |
| Mock integration | 7 | 20.6% | Proves orchestration against controlled fakes/temp files. |
| Real integration | 0 | 0% | No real child-process/network/sandbox/Host/MCP integration proven. |
| E2E / production smoke | 0 | 0% | No browser/production flow proven. |

These counts classify what the tests actually execute; they are not code-coverage percentages.

### Capability matrix

| Capability | Existing test | Test type | Runtime proven? | Gap | Priority |
|---|---|---|---|---|---|
| Model gateway | `tests/gateway-proxy.test.ts` normalizes `developer` messages | Unit | **No** for real proxy | No HTTP proxy smoke; no upstream SSE streaming, headers, default-model, disconnect/abort, 4xx/5xx/error-path test | P1 |
| SSE/events | `tests/dsh-web.test.ts` checks client source for SSE calls; `tests/config.test.ts` checks sidecar source | Source-contract | **No** | No WebSocket→SSE integration covering open/message/error/close and request abort | P1 |
| Sidecar startup | `tests/config.test.ts` checks source/config strings | Source-contract | **No** | No child spawn/readiness/workspace-create/cleanup/idle-sweep smoke | P1 |
| Settings persistence | `tests/sidecar-settings.test.ts`; source assertions in `dsh-web.test.ts` | Mock integration + source-contract | **Partially** | No `/api/settings.*` through proxy to a real sidecar then restore from store | P2 |
| Workspace path validation | `tests/workspace.test.ts` | Unit | **Yes**, for pure path logic | Add edge cases if behavior changes; current core traversal/absolute/double-separator rejection is valuable | P3 |
| Workspace persistence | `tests/workspace.test.ts` write + mocked store; settings tests analogous | Mock integration | **Partially** | No real sandbox snapshot/restore/list/read across separate conversations; bounded eviction not directly tested | P2 |
| MCP permission | `tests/mcp-permission.test.ts` | Unit + mock integration | **Yes** for gate algebra, **No** for transport | No real MCP HTTP session/tool call proving all tools visible and permission plugin interaction | P2 |
| Command approval | `tests/mcp-permission.test.ts` validates ask/allow decisions | Unit/mock | **Partially** | No actual command call demonstrating ask below full-access and execution after approval | P1 |
| Stop/cancel | No direct test; `sandbox_wait` exists specifically for cancellation validation | None | **No** | No active long-running call + `/stop` smoke proving sidecar close and platform `abortActiveRun` behavior | P1 |
| Session export | `tests/config.test.ts` and `tests/dsh-web.test.ts` inspect source for binary handling/fetch | Source-contract | **No** | No real ZIP bytes, content type/stream header, non-UTF-8 integrity, browser download flow | P1 |
| Preview publish | Permission visibility/gating is covered; no `publishWorkspacePreview` behavioral test | Unit only for permission | **No** | No static or Node preview startup/readiness/URL/token-shape test against sandbox fake or runtime | P2 |
| Build preparation | `tests/config.test.ts`, `tests/dsh-web.test.ts`; every `npm test`/`npm run build` invokes prepare | Source-contract + implicit prep | **No clean-tree reproducibility proof** | Missing single-prep deterministic drift check; test/build each repeat preparation | P2 |

## 6. Findings

### P0

No P0 finding was confirmed in the A09 scope.

### P1

#### A09-F01 — No independent required quality gate exists before changes can reach `main`
- ID: `A09-F01`
- Severity: **P1 — High**
- Status: **CONFIRMED**
- Evidence:
  - repository tree at `70119cfdae992a203a5e29eb24e91c7200222a7c`: no `.github/` directory;
  - GitHub Actions runs for `main`: `total_count: 0`;
  - base commit statuses: `total_count: 0`;
  - base commit check-runs: `total_count: 0`;
  - `main` branch API: `protected: false`, protection disabled, no required status-check contexts/checks;
  - `README.md` and EdgeOne documentation describe Git-triggered deployment from the production branch.
- Technical analysis: The repository declares local `test`, `typecheck`, and `build` scripts, but GitHub currently provides no independent automated signal that these pass before a change lands on `main`. EdgeOne's production-branch build/deploy is a deployment mechanism, not a pre-merge quality gate. Because Git integration can automatically deploy commits to the production branch, the absence of a required quality check makes deployment the first guaranteed integration boundary.
- Impact: A source, generated-asset, type, or test regression can reach `main` without an independently visible pass/fail gate. This raises reliability and change-management risk for stable/public use.
- Recommendation: Add one **quality-only** GitHub Actions workflow for pull requests (and optionally `push` to `main` for post-merge evidence) using Node 24 and `npm ci`. It should run preparation once, deterministic generated-drift checking, typecheck, tests, and build verification. It must not run `edgeone makers deploy`; EdgeOne remains the sole deployment pipeline. After it is proven stable, require the single quality job/check on `main` through branch protection or a ruleset.
- Dependency/interaction with other audit domains: Coordinate with A01 (Git governance), A07 (build/deploy/quota), A08 (dependencies/supply chain), and A12 (production smoke). Do not create a second deployment workflow.

#### A09-F02 — Runtime-critical adapter paths have zero real integration/E2E coverage
- ID: `A09-F02`
- Severity: **P1 — High**
- Status: **CONFIRMED**
- Evidence:
  - all 34 current tests classify as source-contract, direct unit, or mock integration; **0 real integration and 0 E2E**;
  - `agents/_gateway-proxy.ts` implements a real streaming HTTP proxy, but the only direct gateway test covers `normalizeGatewayRequest`;
  - `agents/api/_proxy.ts` implements WS→SSE, Host API forwarding, settings snapshots, and binary export, while tests primarily match source strings;
  - `agents/_dsh-web-sidecar.ts` spawns a child process and performs readiness/workspace initialization, with no real sidecar smoke;
  - `agents/_mcp-bridge.ts` creates a real local MCP HTTP server, while permission tests do not invoke that transport;
  - `agents/stop.ts` and the purpose-built `sandbox_wait` tool have no cancellation smoke;
  - `agents/_workspace.ts::publishWorkspacePreview` has no behavioral/integration test.
- Technical analysis: The architecture is dominated by boundaries where regressions often arise from lifecycle, stream framing, request abortion, process readiness, generated Host API compatibility, sandbox semantics, or binary transport. Current tests are strongest on deterministic permission/path/persistence logic but do not cross the actual runtime boundaries. Source-shape assertions can remain green when imports, process startup, stream behavior, runtime context, or platform integration changes incompatibly.
- Impact: High-value production failures—blank/stalled SSE, failed sidecar startup, broken MCP calls, uncancelled work, corrupt session export, gateway streaming regressions, or failed preview publication—can plausibly pass the current suite.
- Recommendation: Add a small number of deterministic integration smokes at adapter boundaries rather than a large E2E suite. Minimum set: (1) loopback gateway with fake upstream streaming/error/abort; (2) WS fixture→SSE bridge with abort/error; (3) DSH sidecar boot/readiness/workspace-create/close when dependencies are available; (4) MCP HTTP tool listing/invocation; (5) long `sandbox_wait` + stop/cancel; (6) binary session-export integrity; (7) preview publication against a controlled sandbox fake/runtime. Keep production smoke separate and minimal.
- Dependency/interaction with other audit domains: A12 should own live production smoke; A02 owns sidecar/Host architecture; A05 owns model compatibility/privacy; A06 owns MCP/tool permission behavior.

### P2

#### A09-F03 — The suite over-relies on regex/source-shape assertions as evidence of correctness
- ID: `A09-F03`
- Severity: **P2 — Medium**
- Status: **CONFIRMED**
- Evidence:
  - `tests/config.test.ts`: 7/7 cases are config/source-contract checks;
  - `tests/dsh-web.test.ts`: 11/11 cases inspect generated HTML/JS/source text;
  - one additional source-contract check exists in `tests/mcp-permission.test.ts`;
  - aggregate: **19/34 = 55.9%** source/config-contract cases.
- Technical analysis: These tests provide useful protection for intentionally patched/generated bundles where public APIs may be hard to exercise cheaply. However, regex presence/absence cannot show that the associated branch executes, the generated JavaScript remains valid in-browser, network streams frame correctly, the Host API accepts the request, or runtime state persists. Some assertions are also coupled to implementation text and may fail on benign refactors while missing semantically equivalent defects.
- Impact: Test pass rates can create more confidence than their evidence warrants, and maintenance cost can rise when generated source formatting changes.
- Recommendation: Preserve a small set of high-value source contracts for invariants that are otherwise expensive to observe, but progressively replace runtime-significant source assertions with executable adapter tests. Treat source-contract tests explicitly as contract/shape coverage, not runtime proof.
- Dependency/interaction with other audit domains: Coordinate with A10 for browser/UI behavior and A02/A06 for runtime/MCP behavior.

#### A09-F04 — Test/build preparation is repeated and can self-heal generated artifacts before assertions
- ID: `A09-F04`
- Severity: **P2 — Medium**
- Status: **CONFIRMED**
- Evidence:
  - `package.json`: both `npm test` and `npm run build` begin with `npm run prepare:dsh-web`;
  - `prepare:dsh-web` runs `scripts/prepare-dsh-web.mjs` and `scripts/generate-dsh-api-routes.mjs`;
  - `scripts/generate-dsh-api-routes.mjs` writes generated files under `agents/api/`;
  - `tests/dsh-web.test.ts` then asserts properties of the prepared/generated output.
- Technical analysis: A naïve CI job that invokes `npm test` and then `npm run build` repeats DSH Web preparation at least twice. More importantly, because the test command regenerates/patches artifacts before checking them, it does not independently prove that the committed generated artifacts were already in sync with the generators. A stale committed artifact can be rewritten into the expected form and then pass assertions unless the workflow explicitly checks the post-preparation diff.
- Impact: Unnecessary CI time/IO, avoidable flake surface, and reduced confidence in clean-checkout reproducibility of committed generated assets.
- Recommendation: In planning/implementation, expose prepared variants (for example, a raw test command and raw Vite build command) or equivalent workflow steps. CI should run `prepare:dsh-web` **once**, immediately check `git diff --exit-code` for the generated paths expected to remain committed, then run typecheck, raw Node tests, and raw Vite build without re-preparing. Preserve production `build:makers` semantics unless a separate build audit approves changes.
- Dependency/interaction with other audit domains: Coordinate with A07 before changing build preparation and with A08 for install/cache strategy.

#### A09-F05 — EdgeOne native observability exists, but DSH child-process trace continuity is not proven
- ID: `A09-F05`
- Severity: **P2 — Medium**
- Status: **NOT VERIFIED**
- Evidence:
  - official EdgeOne Makers Observability documentation states that the platform automatically collects full-link Agent/model/tool traces and supports manual business metrics through `context.tracer`;
  - the public auto-collection support matrix names Claude Agent SDK, OpenAI Agents SDK, DeepAgents, LangGraph, and CrewAI, but does not explicitly name DeepSeek Harness;
  - official Log Analysis documentation states that runtime logs from `agents/` are automatically collected and searchable;
  - `edgeone.json` declares `agents.framework = "openai-sdk"`;
  - `agents/_dsh-web-sidecar.ts::startSidecar` spawns a separate DSH child process and sets `DSH_TELEMETRY_DISABLED = "1"` in that process;
  - reviewed first-party runtime code uses a few `console.warn` paths, but no verified manual `context.tracer` instrumentation was established in this audit;
  - production trace/log UI was not accessible from the available audit execution path.
- Technical analysis: EdgeOne's native observability is a strong platform baseline and should be preferred over a parallel telemetry stack. However, the application delegates much of the Agent loop to a spawned DSH process behind local proxy/MCP boundaries. The public support matrix does not prove that auto-instrumentation propagates across those child-process boundaries, and disabling DSH telemetry further means DSH-native telemetry should not be assumed. It is therefore unsafe to claim end-to-end model/tool/sidecar spans without observing an actual trace.
- Impact: Operators may have platform-level request logs while still lacking causal visibility into sidecar startup, DSH Host calls, local gateway streaming, MCP tool execution, cancellation, or export failures.
- Recommendation: First verify the native console/local `/agent-metrics` with one deterministic scenario containing a prompt/model span, an MCP tool call, and a cancellation/error. Check whether a single `conversation_id`/trace can follow browser request → Agent route → DSH sidecar boundary → gateway/tool. Only if spans are missing, add minimal manual spans/metrics at first-party boundaries (`getDshWebSidecar/startSidecar`, gateway request, MCP request/tool, stop/cancel, session export) using EdgeOne `context.tracer`; keep secrets and prompt payloads out of custom logs/metrics unless explicitly governed.
- Dependency/interaction with other audit domains: A03/A05 should review telemetry privacy and sensitive payload logging; A12 should verify production traces/logs during black-box smoke.

### P3

#### A09-F06 — No repository-level code-coverage measurement or threshold is configured
- ID: `A09-F06`
- Severity: **P3 — Low**
- Status: **CONFIRMED**
- Evidence:
  - `package.json` test script uses Node's test runner without a coverage flag/report/threshold;
  - no coverage configuration/workflow exists in the repository tree at the base SHA.
- Technical analysis: Numeric coverage is not a substitute for capability coverage and would not fix the real-integration gaps above. Still, a lightweight baseline can help detect accidental erosion in pure logic modules once the suite matures.
- Impact: There is no trend signal for untested branches in first-party deterministic logic. This is a hygiene gap, not a release blocker by itself.
- Recommendation: Do not introduce a blanket high percentage target now. After adding the P1/P2 capability smokes, consider Node-native coverage with modest thresholds scoped to first-party deterministic modules, while continuing to use the capability matrix as the primary quality measure.
- Dependency/interaction with other audit domains: None material; coordinate only if CI budget constraints from A07/A08 make coverage expensive.

## 7. What is already good / should be preserved

1. **Permission logic has meaningful behavior tests.** `tests/mcp-permission.test.ts` verifies tool visibility, allow/ask policy by mode, generated permission plugin importability, and a mocked pre-execute path. This is significantly stronger than a source-only check.
2. **Workspace path validation is directly tested.** Traversal (`../`), absolute paths, and malformed double separators are rejected, and conversation IDs are sanitized into scoped roots.
3. **Store/settings failure modes receive focused tests.** Temporary filesystem plus mocked store tests cover missing conversations, creation/bootstrap, absent settings files, and persistence failure tolerance.
4. **The test runner is dependency-light.** Node's built-in test runner plus strict assertions keeps the unit layer simple and fast in principle.
5. **TypeScript strict mode is enabled.** `strict: true` and `noEmit` provide a useful static gate once `npm run typecheck` is automated and verified.
6. **The code already exposes deterministic seams for stronger tests.** `normalizeGatewayRequest`, path helpers, permission gates, settings helpers, and local loopback servers are testable without production credentials.
7. **EdgeOne already provides native observability.** The platform documents automatic Agent logs, metrics/traces, and local `/agent-metrics`; the preferred strategy should extend/verify this rather than create a duplicate telemetry platform.
8. **Cancellation has a purpose-built deterministic tool.** `sandbox_wait` is explicitly described as being used to validate cancellation, making a future stop smoke straightforward.
9. **Production deployment can remain single-sourced.** EdgeOne Git deployment already owns production-branch deployment; a GitHub quality workflow can be deliberately non-deploying.

## 8. Gaps and NOT VERIFIED items

### Required command verification
- **NOT VERIFIED — `npm test`:** temporary clone could not be created because the audit execution environment could not resolve `github.com`.
- **NOT VERIFIED — `npm run typecheck`:** same blocker.
- **NOT VERIFIED — `npm run build`:** same blocker.
- Because the commands did not start, there are no truthful durations or generated dirty-file lists to report.

### Runtime/production verification
- **NOT VERIFIED — production black-box smoke** against `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/` in this A09 run. A12 should own/confirm live production behavior.
- **NOT VERIFIED — DSH child-process trace continuity** in EdgeOne Traces/local `/agent-metrics`.
- **NOT VERIFIED — live Agent log visibility** for sidecar/gateway/MCP failures in the project's Makers console.
- **NOT VERIFIED — auto-instrumented model/tool spans** for the DeepSeek Harness child process specifically; the public EdgeOne support matrix does not explicitly list DeepSeek Harness.
- **NOT VERIFIED — clean-checkout reproducibility** of `npm test`, `typecheck`, or `build` because the isolated checkout could not be materialized.

### GitHub state limitations
GitHub repository state was directly queryable and is **CONFIRMED**: no current Actions runs/check-runs/statuses and no branch protection/required checks at the audited base. This is not a NOT VERIFIED item.

## 9. Recommended next actions — audit recommendation only

### 9.1 Minimal CI target: one quality gate, zero deployment duplication

Recommended shape after planning approval:

1. Trigger on `pull_request` to `main`; optionally also on `push` to `main` to retain post-merge evidence.
2. One Node 24 job, one `npm ci`, dependency cache keyed by `package-lock.json`.
3. Run DSH Web preparation once.
4. Immediately assert no generated drift for the committed generated outputs (`git diff --exit-code` over the paths owned by preparation/generation).
5. Run `npm run typecheck`.
6. Run the underlying Node tests without re-running preparation.
7. Run the underlying Vite build without re-running preparation.
8. Upload only diagnostic test/build logs if useful; do not upload secrets or workspace/session content.
9. Do **not** invoke `edgeone makers deploy` or create another production deployment workflow.
10. Once stable, require this one quality check on `main`.

Illustrative logical sequence, not an implementation patch:

```text
checkout exact PR revision
→ setup Node 24
→ npm ci
→ prepare:dsh-web (once)
→ generated drift check
→ typecheck
→ raw Node tests (prepared tree)
→ raw Vite build (prepared tree)
```

The current public scripts embed preparation in both `test` and `build`, so avoiding duplicate preparation cleanly may require small, explicitly reviewed `test:prepared`/`build:prepared` scripts or equivalent raw commands in the future workflow. That change belongs to planning/implementation, not this audit branch.

### 9.2 Highest-value test additions

Priority order:
1. Gateway loopback streaming/error/abort behavior.
2. WS→SSE event bridge with abort/error/close.
3. Sidecar boot/readiness/workspace-create/cleanup smoke.
4. Stop/cancel using `sandbox_wait` plus verification of both sidecar and platform abort result.
5. MCP HTTP tool list/invocation and permission escalation handshake.
6. Session export binary integrity.
7. Workspace snapshot restore/isolation plus preview publish behavior.
8. Selected browser-level UI smoke only for high-risk generated-patch flows; do not convert every source-contract assertion into a browser test.

### 9.3 Observability verification sequence

Use EdgeOne-native observability first:
1. Run a deterministic local or staging conversation with a model call and one MCP tool.
2. Locate it by `conversation_id` in `/agent-metrics`/Makers Traces.
3. Confirm Agent/model/tool span nesting and latency.
4. Trigger one controlled failure/cancellation and verify ERROR/cancel visibility in trace/logs.
5. Confirm the spawned DSH process's important boundaries are visible; if not, add only first-party manual spans/metrics with `context.tracer` at boundary functions.
6. Establish a small structured logging convention: event name, conversation/run identifier, component, duration/status/error class. Never log API keys/tokens/cookies or ungoverned full prompts.

## 10. Handoff to planning phase

Planning should treat the quality problem as **capability confidence**, not a request to maximize test count.

Recommended planning workstreams:
- **Quality gate:** add a single non-deploying GitHub quality workflow and required check after proving it stable.
- **Build/test deduplication:** prepare generated DSH Web artifacts once, verify drift, then test/typecheck/build the prepared tree.
- **Runtime smokes:** add a compact integration suite around network/process/sandbox boundaries with deterministic fakes/loopback services and no production secrets.
- **Production smoke:** delegate live URL flows, cancellation, export, and observable error behavior to A12; reuse those scenarios as a future post-deploy smoke only if the deployment strategy explicitly supports it.
- **Observability:** verify EdgeOne native traces/logs before adding instrumentation; instrument only missing first-party boundaries.

Cross-audit handoff:
- A01: branch protection/ruleset and required-check governance.
- A02: sidecar/Host API lifecycle and process boundary.
- A03/A05: telemetry privacy, prompt logging, and sensitive-data handling.
- A06: MCP permission/approval semantics and tool execution.
- A07: build preparation, CI cost, EdgeOne deployment/quotas; preserve one deployment pipeline.
- A08: dependency installation/caching/supply-chain controls.
- A10: browser-level product/UI smoke where generated bundle behavior matters.
- A12: live production smoke and production trace/log verification.

## 11. Appendix

### A. Exact test-case classification

`tests/config.test.ts` — 7 source/config-contract:
1. Agent packaging/timeout config.
2. Native runtime restoration script source invariants.
3. Dependency source-map pruning source invariant.
4. Sidecar Gateway/MCP/spawn/workspace source invariant.
5. Makers provider/model/permission source invariants.
6. Built-in preset rejection source invariant.
7. Binary session-export source invariant.

`tests/dsh-web.test.ts` — 11 source-contract:
1. Prepared Web plugin graph.
2. SSE/routing strings.
3. Locked built-in preset UI patch.
4. Permission picker/copy patch.
5. Single cloud workspace UI patch.
6. UTF-8 charset position.
7. Hostname-based initial locale.
8. Page chrome/deploy/contact strings and layout contracts.
9. Session-log export fetch implementation shape.
10. Settings/model-selection persistence implementation shape.
11. Generated API route implementation shape.

`tests/gateway-proxy.test.ts` — 1 unit behavior:
1. Gateway request normalization.

`tests/mcp-permission.test.ts` — 7:
1. Generated permission plugin importable — unit behavior.
2. Tool visibility / read-only gates — unit behavior.
3. Workspace-write gates — unit behavior.
4. Full-access gates — unit behavior.
5. Ask copy/tool-name parsing — unit behavior.
6. Pre-execute allow/ask with mocked event context — mock integration.
7. MCP bridge source registers tools without filtering — source-contract.

`tests/sidecar-settings.test.ts` — 4 mock integration:
1. Restore stored settings YAML.
2. Missing-conversation restore.
3. Snapshot settings onto a new conversation.
4. Missing settings file no-op.

`tests/workspace.test.ts` — 4:
1. Workspace path traversal validation — unit behavior.
2. Workspace root conversation-ID sanitization — unit behavior.
3. Write bootstraps/persists conversation snapshot — mock integration.
4. Write succeeds when snapshot persistence fails — mock integration.

### B. Official EdgeOne observability/deployment references reviewed

- EdgeOne Makers — Observability: `https://pages.edgeone.ai/document/agents-observability`
- EdgeOne Makers — Log Analysis: `https://pages.edgeone.ai/document/log-analysis`
- EdgeOne Makers — Agent Quick Start: `https://pages.edgeone.ai/document/agents-quick-start`
- EdgeOne Makers — Observability Overview: `https://pages.edgeone.ai/document/observability`
- EdgeOne Makers — Create Deploys: `https://pages.edgeone.ai/document/create-deploys`

### C. Finding count

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 2 |
| P2 | 3 |
| P3 | 1 |
| **Total** | **6** |

### D. Audit-only change declaration

This A09 branch is intended to contain exactly one new file: `docs/audit/phase-1/A09-tests-quality-observability.md`.

**No runtime/source changes. No test changes. No CI/CD changes. No generated asset changes. No dependency/lockfile changes. No EdgeOne config changes. No deployment. No merge.**
