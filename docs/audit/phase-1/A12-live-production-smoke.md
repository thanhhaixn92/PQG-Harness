# A12 — Black-box production smoke audit — non-destructive

## 1. Metadata
- Repository: `thanhhaixn92/PQG-Harness`
- Base branch: `main`
- Exact base SHA: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- Baseline comparison: matches the prompt's expected baseline `70119cfdae992a203a5e29eb24e91c7200222a7c`; no deviation observed.
- Audit date/time: 2026-09-04 17:02 ICT (Asia/Bangkok, UTC+07:00)
- Auditor/subagent: A12
- Production target: `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/`
- Verdict: **PARTIAL**

## 2. Scope
This audit is limited to non-destructive black-box production smoke checks for the known EdgeOne deployment URL. It covers HTTP/TLS reachability, page shell rendering, browser-console/static-asset health, model and permission selectors, session creation, one minimal model prompt if safe and reachable, response streaming/SSE, session refresh/reopen behavior, restricted-action approval prompting without approval, read-only session export if clearly safe, basic mobile/tablet layout, and observed authentication/access-gate behavior.

The audit does **not** modify source, dependencies, lockfiles, generated assets, tests, CI/CD, EdgeOne configuration, runtime configuration, secrets, `main`, releases, tags, or deployments. It does not approve `danger-full-access`, execute production shell commands, upload private data, load test, stress test, or infer backend security from UI/source behavior.

## 3. Method
1. Resolve canonical `main` immediately before audit and record the exact SHA.
2. Create the required fresh audit branch from that exact SHA.
3. Attempt minimal HTTP access to the production target with `HEAD` and `GET`, with short timeouts and no authentication material.
4. Attempt to use available web/browser tooling for live inspection.
5. Where live access is blocked, inspect only enough source/config at the exact base SHA to establish expected UI/transport capabilities; do not treat source evidence as proof of production behavior.
6. Record every unobservable live test as `BLOCKED` / `NOT VERIFIED` rather than PASS/FAIL.
7. Create only this report file, then verify the branch diff against the exact base SHA.

No secret, API key, cookie, token, access token, or private user data was read, printed, stored, or submitted.

## 4. Architecture / current-state summary
**Source-baseline summary only; production parity is NOT VERIFIED.** At exact base SHA `70119cfdae992a203a5e29eb24e91c7200222a7c`:

- `README.md` describes a full-stack EdgeOne Makers deployment using the official DSH Web GUI, Agent routes, AI Gateway, sandbox/store/MCP tools, per-conversation sidecars, and `/api/*` RPC forwarding with native WebSocket downlinks converted to SSE.
- `index.html` contains the DSH Web boot graph, including client modules for model selection, permission presets, conversation/session UI, settings, and session-log export. It also creates/persists `dsh-makers-web-conversation-id` in browser `localStorage` and injects it into same-origin `/api` and `/rpc` requests as `makers-conversation-id`.
- `edgeone.json` configures `npm ci`, `npm run build:makers`, output directory `dist`, Node 24, Agent runtime timeout 300 seconds, and sandbox timeout 300 seconds.
- `package.json` identifies the application as `deepseek-harness`, describes Makers AI Gateway usage and the current-session sandbox workspace, and defines the EdgeOne/Makers production build path.

These facts establish reasonable smoke-test expectations but do not establish that the named production URL currently serves this exact revision.

## 5. Evidence inventory
- Canonical `main` ref: GitHub `refs/heads/main` resolved to `70119cfdae992a203a5e29eb24e91c7200222a7c` at audit start.
- Required audit branch: `audit/a12-live-production-smoke`, created fresh from the exact base SHA.
- Production URL: `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/`.
- HTTP probe evidence from audit runner:
  - `curl -I --max-time 20 https://pqg-harness-dp0dukyw6bfl.edgeone.cool/` -> `curl: (6) Could not resolve host: pqg-harness-dp0dukyw6bfl.edgeone.cool`.
  - `curl ... GET ...` -> same DNS-resolution failure; no response headers or body were received.
  - `getent ahosts pqg-harness-dp0dukyw6bfl.edgeone.cool` returned no address in the audit runner.
- Browser/tooling evidence:
  - The documented `agent-browser` automation skill was inspected, but no `agent-browser` executable is installed in this runtime.
  - Available hosting connector functions do not expose a generic interactive browser for arbitrary EdgeOne URLs.
  - General web fetch/search did not yield a fetchable indexed copy of the target; therefore it was not used to claim live state.
- Source evidence at exact base SHA:
  - `README.md` — architecture and stated WebSocket-to-SSE transport, model selection, session/workspace behavior.
  - `index.html` — DSH boot entries such as `@deepseek-ai/dsh-client-ui-model-selection`, `@deepseek-ai/dsh-client-ui-permission-presets`, `@deepseek-ai/dsh-session-log-export`, plus `dsh-makers-web-conversation-id` persistence and request-header injection.
  - `edgeone.json` — deployment/build/runtime configuration.
  - `package.json` — production build script and project description.

### Live smoke matrix

| Test ID | Step | Expected | Actual | PASS/FAIL/BLOCKED | Evidence |
|---|---|---|---|---|---|
| SMK-01 | HTTP/TLS/page load | DNS resolves; TLS handshake succeeds; root returns a usable HTTP response | Audit runner could not resolve the hostname; no TCP/TLS/HTTP response was reached | **BLOCKED** | `curl` HEAD and GET both returned error 6, `Could not resolve host`; `getent ahosts` returned no address |
| SMK-02 | Main shell render | DSH Web main shell visibly renders | No page could be loaded | **BLOCKED** | Dependency on SMK-01; no live DOM/browser state |
| SMK-03 | Console errors | No critical uncaught errors during initial load | Console unavailable because no interactive browser/page load | **BLOCKED** | `agent-browser` executable unavailable; SMK-01 blocked |
| SMK-04 | Static asset failures | Required JS/CSS/plugin assets load without 4xx/5xx/network failures | No live network waterfall or asset responses available | **BLOCKED** | SMK-01/SMK-03 blocked |
| SMK-05 | Model selector render | Model selector is present and usable | Live render not observable. Source baseline contains `@deepseek-ai/dsh-client-ui-model-selection` | **BLOCKED** | `index.html` boot graph is source-only evidence, not production proof |
| SMK-06 | Permission selector and default mode | Permission control renders and default is observable without changing it | Live render/default not observable. Source baseline contains `@deepseek-ai/dsh-client-ui-permission-presets` | **BLOCKED** | `index.html`; no live DOM |
| SMK-07 | Session creation | A new non-destructive conversation/session can be created | Not attempted because the application could not be reached | **BLOCKED** | SMK-01 blocked |
| SMK-08 | One prompt: `Reply exactly: OK` | If model endpoint is functional, exactly one minimal prompt is sent and one normal response is returned | Prompt was **not sent** because endpoint reachability was not established | **BLOCKED** | Safety rule: no speculative requests when live target is unreachable |
| SMK-09 | Response streaming/SSE | Response/events stream progressively without transport failure | No request or event stream could be observed. Source documentation states WebSocket downlinks are converted to SSE | **BLOCKED** | `README.md` source-only transport description; live stream not observed |
| SMK-10 | Refresh/reopen session | Session state survives/reopens according to intended UX | Not testable without a created live session | **BLOCKED** | SMK-07 blocked; source uses a persistent browser conversation identifier but that is not live persistence proof |
| SMK-11 | Restricted action approval prompt | If a restricted action is available, an approval prompt appears before execution; no approval is granted | No restricted action was invoked because UI was unreachable | **BLOCKED** | No live UI; no command/full-access approval performed |
| SMK-12 | Export session | Read-only export works only if clearly safe and contains no secret/private data | Not attempted because no session existed and safety could not be established | **BLOCKED** | Source boot includes `@deepseek-ai/dsh-session-log-export`; live behavior not verified |
| SMK-13 | Mobile/tablet layout | Main shell remains usable at basic tablet/mobile viewports | No interactive browser/rendering surface available | **BLOCKED** | Browser automation unavailable; SMK-01 blocked |
| SMK-14 | Authentication/access gate | Observe whether target is public or gated; do not infer deeper security | No HTTP response was obtained, so public/gated status cannot be observed | **BLOCKED** | DNS failure occurred before HTTP status/page content |
| SRC-01 | Canonical source baseline | Audit source is pinned to latest `main` | `main` resolved exactly to expected SHA | **PASS** | GitHub `refs/heads/main` -> `70119cfdae992a203a5e29eb24e91c7200222a7c` |
| SRC-02 | Expected live UI capabilities from source | Source should contain modules needed for requested smoke checks | Model selection, permission presets, conversation/session UI, and session-log export modules are present in the boot graph | **PASS** | `index.html` at exact base SHA; source-only result |
| SRC-03 | Expected EdgeOne production build configuration | Repository should define EdgeOne production build/output config | `edgeone.json` defines install/build/output/runtime parameters; `package.json` defines `build:makers` | **PASS** | `edgeone.json`, `package.json` at exact base SHA; source-only result |

## 6. Findings

### P0
No P0 finding confirmed.

### P1
No P1 finding confirmed.

### P2
No P2 finding confirmed.

### P3
No P3 finding confirmed.

Because the live target could not be reached from the audit environment, absence of confirmed findings **must not** be interpreted as a production PASS.

## 7. What is already good / should be preserved
- The repository has explicit production build configuration (`edgeone.json`) and a dedicated `build:makers` path rather than relying on an implicit local-development build.
- The source baseline exposes the major UI capabilities required by this audit: model selection, permission presets, conversation/session UI, and session-log export.
- The browser bootstrap assigns a per-browser conversation identifier and attaches it only to same-origin `/api` and `/rpc` requests, which provides a clear observable mechanism to test session affinity when live access is available.
- The documented transport explicitly distinguishes browser-facing SSE from the sidecar's native WebSocket downlink, giving a concrete black-box expectation for future live validation.

All four items above are source-confirmed properties at the pinned base SHA, not claims about the currently deployed artifact.

## 8. Gaps and NOT VERIFIED items
- **NOT VERIFIED — live DNS/TLS/HTTP availability.** The audit runner could not resolve `pqg-harness-dp0dukyw6bfl.edgeone.cool`. This does not distinguish a deployment/DNS defect from an audit-runner network/DNS limitation.
- **NOT VERIFIED — deployed revision.** No live response header/body/build identifier was available to correlate production with base SHA `70119cf...`.
- **NOT VERIFIED — main shell render and static assets.** No live DOM or network waterfall was available.
- **NOT VERIFIED — browser console health.** No generic interactive browser is available in this runtime for the EdgeOne target.
- **NOT VERIFIED — model selector live render/behavior.** Source module exists; production behavior was not observed.
- **NOT VERIFIED — permission selector and default mode.** Source module exists; production default was not observed.
- **NOT VERIFIED — session creation and persistence.** No session was created; refresh/reopen behavior remains untested.
- **NOT VERIFIED — model endpoint and one-prompt response.** The prescribed `Reply exactly: OK` prompt was deliberately not sent because the target was unreachable.
- **NOT VERIFIED — SSE/streaming behavior.** Source documents SSE bridging, but no production stream was observed.
- **NOT VERIFIED — restricted-action approval UX.** No restricted action was attempted and no approval was granted.
- **NOT VERIFIED — session export.** Source module exists, but no safe live session was available to export.
- **NOT VERIFIED — mobile/tablet layout.** No responsive browser rendering surface was available.
- **NOT VERIFIED — authentication/access gate.** No HTTP status or page was obtained; public-vs-gated status cannot be inferred.
- **NOT VERIFIED — backend security.** By design, this audit does not infer backend trust/security guarantees from source or UI.

## 9. Recommended next actions — audit recommendation only
1. Re-run A12 from an audit runner/browser that can resolve and connect to the EdgeOne hostname. Preserve the same non-destructive restrictions.
2. First collect minimal live evidence: DNS result, TLS/HTTP status, final URL after redirects, page title/shell screenshot, and initial network/console status.
3. Only after a stable shell load, execute the remaining tests in order: model selector, permission default, session creation, exactly one `Reply exactly: OK` prompt, SSE observation, refresh/reopen, restricted-action approval prompt without approval, safe export, then tablet/mobile viewport checks.
4. Capture a non-secret production revision/build identifier if the deployment exposes one; compare it with the intended Git commit rather than assuming branch parity.
5. If hostname non-resolution reproduces from an independent normal network, hand off the deployment/DNS availability question to **A07 — Build / EdgeOne Deploy / Preview / Quotas**. Do not diagnose EdgeOne deployment internals inside A12.
6. If live responsive/UI defects are later observed, hand them to **A10 — Frontend / Productization / Localization / A11y** with screenshots/console evidence; keep A12 limited to smoke verification.

## 10. Handoff to planning phase
The planning phase should treat A12 as **incomplete live evidence**, not as a clean bill of health. No production defect has been proven, but nearly all runtime-facing acceptance checks remain unresolved because the target could not be reached from the current audit environment.

Planning dependency:
- A07 should confirm whether the known production URL is still the canonical live deployment and whether DNS/deployment health is externally observable.
- Once reachability is available, A12 should be re-run before any public/stable-use gate is considered satisfied.

Cross-audit handoff: DNS/deployment reachability -> A07; any later confirmed responsive/UI issue -> A10. No deeper duplicate audit was performed here.

## 11. Appendix

### A. Exact base verification
`refs/heads/main` resolved at audit start to:

```text
70119cfdae992a203a5e29eb24e91c7200222a7c
```

This exactly matches the prompt's expected baseline.

### B. Non-destructive HTTP probe result
Representative audit-runner output:

```text
curl: (6) Could not resolve host: pqg-harness-dp0dukyw6bfl.edgeone.cool
```

The failure occurred before any TLS or HTTP exchange. Therefore no HTTP status, certificate details, response headers, HTML, cookies, auth gate, or application behavior can be claimed from this probe.

### C. Safety actions explicitly not performed
- No secret/environment value was read.
- No production shell command was executed.
- No `danger-full-access` or restricted action was approved.
- No file/private data was uploaded.
- No load/stress test was run.
- No model prompt was sent because reachability was not established.
- No session export was attempted.
- No source/runtime/deployment configuration was modified.

### D. Severity count
- P0: **0**
- P1: **0**
- P2: **0**
- P3: **0**

The zero finding count reflects lack of confirmed defects, **not** successful live smoke coverage. Verdict remains **PARTIAL**.
